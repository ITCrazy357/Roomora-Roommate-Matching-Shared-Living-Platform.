import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  Connection,
  Prisma,
  Profile,
} from '../../generated/prisma/client.js';
import { LocationsService } from '../locations/locations.service.js';
import { publicProfile } from '../profile/public-profile.js';
import { matchProfiles } from './matching.js';
import type {
  ConnectionQuery,
  PeopleQuery,
  ReportUserDto,
  SendConnectionDto,
} from './people.dto.js';

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  async search(query: PeopleQuery, viewerId?: string) {
    if (
      query.budgetMin !== undefined &&
      query.budgetMax !== undefined &&
      query.budgetMin > query.budgetMax
    )
      throw new BadRequestException({
        code: 'BUDGET_RANGE_INVALID',
        message: 'Khoảng ngân sách không hợp lệ',
      });
    if (query.wardCode && !query.provinceCode)
      throw new BadRequestException({ code: 'LOCATION_INVALID' });
    if (query.provinceCode)
      this.locations.resolve([
        { provinceCode: query.provinceCode, wardCode: query.wardCode },
      ]);
    const where: Prisma.ProfileWhereInput = {
      visibility: 'PUBLIC',
      userId: viewerId ? { not: viewerId } : undefined,
      user: {
        emailVerifiedAt: { not: null },
        ...(viewerId
          ? {
              blockedUsers: { none: { targetId: viewerId } },
              blockedBy: { none: { blockerId: viewerId } },
            }
          : {}),
      },
    };
    const filters: Prisma.ProfileWhereInput[] = [];
    if (query.q)
      filters.push({
        OR: [
          { displayName: { contains: query.q, mode: 'insensitive' } },
          { bio: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    if (query.provinceCode)
      filters.push({
        showDesiredAreas: true,
        desiredLocations: {
          array_contains: [
            {
              provinceCode: query.provinceCode,
              ...(query.wardCode ? { wardCode: query.wardCode } : {}),
            },
          ],
        },
      });
    if (query.budgetMin !== undefined)
      filters.push({
        showBudget: true,
        OR: [
          { budgetMax: { gte: query.budgetMin } },
          { budgetMax: null, budgetMin: { not: null } },
        ],
      });
    if (query.budgetMax !== undefined)
      filters.push({
        showBudget: true,
        OR: [
          { budgetMin: { lte: query.budgetMax } },
          { budgetMin: null, budgetMax: { not: null } },
        ],
      });
    for (const key of [
      'sleepSchedule',
      'smokingPreference',
      'petPreference',
      'quietLevel',
    ] as const)
      if (query[key]) filters.push({ showLifestyle: true, [key]: query[key] });
    where.AND = filters;
    const [profiles, total, viewer] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { userId: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.profile.count({ where }),
      viewerId
        ? this.prisma.profile.findUnique({ where: { userId: viewerId } })
        : null,
    ]);
    const userIds = profiles.map((profile) => profile.userId);
    const connections =
      viewerId && userIds.length
        ? await this.prisma.connection.findMany({
            where: {
              OR: [
                { senderId: viewerId, receiverId: { in: userIds } },
                { receiverId: viewerId, senderId: { in: userIds } },
              ],
            },
          })
        : [];
    const connectionsByUser = new Map(
      connections.map((item) => [
        item.senderId === viewerId ? item.receiverId : item.senderId,
        item,
      ]),
    );
    return this.page(
      profiles.map((profile) =>
        this.person(profile, viewer, connectionsByUser.get(profile.userId)),
      ),
      total,
      query,
    );
  }

  async getPerson(targetId: string, viewerId?: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: targetId },
      include: { user: { select: { emailVerifiedAt: true } } },
    });
    if (
      !profile ||
      (!profile.user.emailVerifiedAt && targetId !== viewerId) ||
      (profile.visibility !== 'PUBLIC' && targetId !== viewerId)
    )
      this.unavailable();
    if (viewerId && (await this.isBlocked(this.prisma, viewerId, targetId)))
      this.unavailable();
    const [viewer, connection] = await Promise.all([
      viewerId
        ? this.prisma.profile.findUnique({ where: { userId: viewerId } })
        : null,
      viewerId && targetId !== viewerId
        ? this.prisma.connection.findUnique({
            where: { pairKey: this.getPairKey(viewerId, targetId) },
          })
        : null,
    ]);
    return this.person(profile, viewer, connection ?? undefined);
  }

  async send(userId: string, dto: SendConnectionDto) {
    const targetId = dto.targetId.toLowerCase();
    this.assertDifferentUsers(userId, targetId);
    return this.withUserLocks(userId, targetId, async (tx) => {
      const profiles = await tx.profile.findMany({
        where: { userId: { in: [userId, targetId] } },
        include: { user: { select: { emailVerifiedAt: true } } },
      });
      const myProfile = profiles.find((profile) => profile.userId === userId);
      const target = profiles.find((profile) => profile.userId === targetId);
      if (
        !target ||
        target.visibility !== 'PUBLIC' ||
        !target.user.emailVerifiedAt ||
        (await this.isBlocked(tx, userId, targetId))
      )
        this.unavailable();
      if (!myProfile || myProfile.visibility !== 'PUBLIC')
        throw new BadRequestException({
          code: 'PROFILE_PRIVATE',
          message: 'Công khai hồ sơ trước khi gửi lời kết nối',
        });
      const pairKey = this.getPairKey(userId, targetId);
      const existing = await tx.connection.findUnique({ where: { pairKey } });
      if (existing?.status === 'PENDING' || existing?.status === 'ACCEPTED')
        throw new ConflictException({
          code: 'CONNECTION_EXISTS',
          message: 'Hai bạn đã có lời mời hoặc kết nối',
        });
      const now = new Date();
      if (
        existing &&
        now.getTime() - existing.updatedAt.getTime() < 24 * 60 * 60_000
      )
        throw new ConflictException({
          code: 'CONNECTION_COOLDOWN',
          message: 'Chờ 24 giờ trước khi gửi lại',
        });
      // Both users are locked: concurrent requests cannot bypass this database limit.
      const attempts = await tx.connectionAttempt.findMany({
        where: {
          senderId: userId,
          createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
        select: { createdAt: true },
      });
      if (
        attempts.length >= 30 ||
        attempts.filter(
          (item) => now.getTime() - item.createdAt.getTime() < 60 * 60_000,
        ).length >= 10
      )
        this.rateLimit();
      await tx.connectionAttempt.deleteMany({
        where: {
          senderId: userId,
          createdAt: { lte: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
      });
      await tx.connectionAttempt.create({ data: { senderId: userId } });
      const connection = existing
        ? await tx.connection.update({
            where: { id: existing.id },
            data: {
              senderId: userId,
              receiverId: targetId,
              status: 'PENDING',
              message: dto.message,
              createdAt: now,
              version: { increment: 1 },
            },
          })
        : await tx.connection.create({
            data: {
              pairKey,
              senderId: userId,
              receiverId: targetId,
              message: dto.message,
            },
          });
      return this.connectionView(connection, userId);
    });
  }

  async respond(
    userId: string,
    id: string,
    version: number,
    action: 'accept' | 'decline' | 'cancel',
  ) {
    const existing = await this.prisma.connection.findUnique({ where: { id } });
    if (
      !existing ||
      (existing.senderId !== userId && existing.receiverId !== userId)
    )
      this.unavailable();
    const targetId =
      existing.senderId === userId ? existing.receiverId : existing.senderId;
    return this.withUserLocks(userId, targetId, async (tx) => {
      if (await this.isBlocked(tx, userId, targetId)) this.unavailable();
      const role =
        action === 'cancel' ? { senderId: userId } : { receiverId: userId };
      const statuses = {
        accept: 'ACCEPTED',
        decline: 'DECLINED',
        cancel: 'CANCELLED',
      } as const;
      const result = await tx.connection.updateMany({
        where: { id, version, status: 'PENDING', ...role },
        data: { status: statuses[action], version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException({
          code: 'CONNECTION_CHANGED',
          message:
            'Lời mời đã thay đổi hoặc bạn không thể thực hiện thao tác này',
        });
      const updated = await tx.connection.findUniqueOrThrow({ where: { id } });
      return this.connectionView(updated, userId);
    });
  }

  async listConnections(userId: string, query: ConnectionQuery) {
    const participant: Prisma.ConnectionWhereInput = {
      OR: [{ senderId: userId }, { receiverId: userId }],
    };
    const visible: Prisma.ConnectionWhereInput = {
      sender: {
        blockedUsers: { none: { targetId: userId } },
        blockedBy: { none: { blockerId: userId } },
      },
      receiver: {
        blockedUsers: { none: { targetId: userId } },
        blockedBy: { none: { blockerId: userId } },
      },
    };
    const received = {
      receiverId: userId,
      status: 'PENDING' as const,
      ...visible,
    };
    const sent: Prisma.ConnectionWhereInput = {
      senderId: userId,
      status: { in: ['PENDING', 'DECLINED', 'CANCELLED'] },
      ...visible,
    };
    const accepted = {
      ...participant,
      status: 'ACCEPTED' as const,
      ...visible,
    };
    const [receivedCount, sentCount, acceptedCount, blockedCount, viewer] =
      await Promise.all([
        this.prisma.connection.count({ where: received }),
        this.prisma.connection.count({ where: sent }),
        this.prisma.connection.count({ where: accepted }),
        this.prisma.userBlock.count({ where: { blockerId: userId } }),
        query.tab === 'blocked'
          ? null
          : this.prisma.profile.findUnique({ where: { userId } }),
      ]);
    const counts = {
      received: receivedCount,
      sent: sentCount,
      accepted: acceptedCount,
      blocked: blockedCount,
    };
    if (query.tab === 'blocked') {
      const blocks = await this.prisma.userBlock.findMany({
        where: { blockerId: userId },
        include: {
          target: { select: { profile: { select: { displayName: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { targetId: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      const items = blocks.map((block) => ({
        userId: block.targetId,
        displayName: block.target.profile?.displayName ?? 'Người dùng',
        createdAt: block.createdAt,
      }));
      return { ...this.page(items, blockedCount, query), counts };
    }
    const filters = { received, sent, accepted };
    const where = filters[query.tab];
    const rows = await this.prisma.connection.findMany({
      where,
      include: {
        sender: { select: { profile: true } },
        receiver: { select: { profile: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const items = rows.map((row) => {
      const other =
        row.senderId === userId ? row.receiver.profile : row.sender.profile;
      const connection = this.connectionView(row, userId);
      return other && other.visibility === 'PUBLIC'
        ? this.person(other, viewer, row)
        : {
            userId: row.senderId === userId ? row.receiverId : row.senderId,
            displayName: 'Hồ sơ riêng tư',
            avatarUrl: null,
            bio: null,
            visibility: 'PRIVATE',
            match: null,
            connection,
          };
    });
    return {
      ...this.page(items, counts[query.tab], query),
      counts,
    };
  }

  async block(userId: string, targetId: string) {
    this.assertDifferentUsers(userId, targetId);
    return this.withUserLocks(userId, targetId, async (tx) => {
      await tx.userBlock.createMany({
        data: [{ blockerId: userId, targetId }],
        skipDuplicates: true,
      });
      await tx.connection.updateMany({
        where: {
          pairKey: this.getPairKey(userId, targetId),
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
      return { blocked: true };
    });
  }

  async unblock(userId: string, targetId: string) {
    return this.withUserLocks(userId, targetId, async (tx) => {
      await tx.userBlock.deleteMany({ where: { blockerId: userId, targetId } });
      return { blocked: false };
    });
  }

  async report(userId: string, targetId: string, dto: ReportUserDto) {
    this.assertDifferentUsers(userId, targetId);
    return this.withUserLocks(userId, targetId, async (tx) => {
      const existing = await tx.userReport.findUnique({
        where: { reporterId_targetId: { reporterId: userId, targetId } },
      });
      if (existing)
        throw new ConflictException({
          code: 'REPORT_EXISTS',
          message: 'Bạn đã báo cáo người dùng này',
        });
      const count = await tx.userReport.count({
        where: {
          reporterId: userId,
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) },
        },
      });
      if (count >= 5) this.rateLimit();
      const report = await tx.userReport.create({
        data: {
          reporterId: userId,
          targetId,
          reason: dto.reason,
          details: dto.details,
        },
      });
      return { id: report.id, status: report.status };
    });
  }

  private person(
    profile: Profile,
    viewer: Profile | null,
    connection?: Connection,
  ) {
    return {
      ...publicProfile(profile, this.locations),
      match:
        viewer?.userId === profile.userId
          ? null
          : matchProfiles(viewer, profile),
      connection:
        connection && viewer
          ? this.connectionView(connection, viewer.userId)
          : null,
    };
  }
  private connectionView(connection: Connection, userId: string) {
    return {
      id: connection.id,
      status: connection.status,
      version: connection.version,
      message: connection.message,
      direction: connection.senderId === userId ? 'sent' : 'received',
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
  private getPairKey(userId: string, targetId: string) {
    return [userId.toLowerCase(), targetId.toLowerCase()].sort().join(':');
  }
  private async isBlocked(
    tx: Prisma.TransactionClient,
    userId: string,
    targetId: string,
  ) {
    return Boolean(
      await tx.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, targetId },
            { blockerId: targetId, targetId: userId },
          ],
        },
        select: { blockerId: true },
      }),
    );
  }
  private async withUserLocks<T>(
    userId: string,
    targetId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock two indexed user rows in a stable order for send/block/accept races.
      const users = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE id IN (${userId}::uuid, ${targetId}::uuid) ORDER BY id FOR UPDATE`;
      if (users.length !== 2) this.unavailable();
      return work(tx);
    });
  }
  private page<T>(
    items: T[],
    total: number,
    query: { page: number; limit: number },
  ) {
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    };
  }
  private assertDifferentUsers(userId: string, targetId: string) {
    if (userId.toLowerCase() === targetId.toLowerCase())
      throw new BadRequestException({
        code: 'SELF_CONNECTION',
        message: 'Không thể thực hiện với chính mình',
      });
  }
  private unavailable(): never {
    throw new NotFoundException({
      code: 'PERSON_UNAVAILABLE',
      message: 'Không thể truy cập hồ sơ hoặc kết nối',
    });
  }
  private rateLimit(): never {
    throw new HttpException(
      {
        code: 'RATE_LIMITED',
        message: 'Bạn đã thao tác quá nhiều. Vui lòng thử lại sau',
      },
      429,
    );
  }
}
