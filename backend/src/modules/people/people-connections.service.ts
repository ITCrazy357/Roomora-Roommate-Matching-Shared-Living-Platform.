import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../communications/notifications.service.js';
import type {
  ConnectionQuery,
  SendConnectionDto,
} from '../people/dto/people.dto.js';
import { PeopleViewsService } from './people-views.service.js';
import { PeopleAccessService } from './people-access.service.js';

@Injectable()
export class PeopleConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly views: PeopleViewsService,
    private readonly access: PeopleAccessService,
  ) {}

  async send(userId: string, dto: SendConnectionDto) {
    const targetId = dto.targetId.toLowerCase();
    this.access.assertDifferentUsers(userId, targetId);
    return this.access.withUserLocks(userId, targetId, async (tx) => {
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
        (await this.access.isBlocked(tx, userId, targetId))
      )
        this.access.unavailable();
      if (!myProfile || myProfile.visibility !== 'PUBLIC')
        throw new BadRequestException({
          code: 'PROFILE_PRIVATE',
          message: 'Công khai hồ sơ trước khi gửi lời kết nối',
        });
      const pairKey = this.access.getPairKey(userId, targetId);
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
        this.access.rateLimit();
      await tx.connectionAttempt.deleteMany({
        where: {
          senderId: userId,
          createdAt: { lte: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
      });
      await tx.connectionAttempt.create({ data: { senderId: userId } });
      if (existing && existing.senderId !== userId) {
        const conversation = await tx.conversation.findUnique({
          where: { connectionId: existing.id },
        });
        if (conversation)
          await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              senderRead: conversation.receiverRead,
              receiverRead: conversation.senderRead,
            },
          });
      }
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
      await this.notifications.create(
        tx,
        targetId,
        'CONNECTION',
        'Bạn có lời mời kết nối mới',
        '/ket-noi',
      );
      return this.views.connectionView(connection, userId);
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
      this.access.unavailable();
    const targetId =
      existing.senderId === userId ? existing.receiverId : existing.senderId;
    return this.access.withUserLocks(userId, targetId, async (tx) => {
      if (await this.access.isBlocked(tx, userId, targetId))
        this.access.unavailable();
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
      if (action === 'accept') {
        const conversation = await tx.conversation.upsert({
          where: { connectionId: id },
          create: { connectionId: id },
          update: {},
        });
        await this.notifications.create(
          tx,
          targetId,
          'CONNECTION',
          'Lời mời kết nối đã được chấp nhận',
          `/tin-nhan/${conversation.id}`,
          true,
        );
      }
      await this.notifications.signal(tx, [userId, targetId]);
      return this.views.connectionView(updated, userId);
    });
  }

  async disconnect(userId: string, id: string, version: number) {
    const existing = await this.prisma.connection.findUnique({ where: { id } });
    if (
      !existing ||
      (existing.senderId !== userId && existing.receiverId !== userId)
    )
      this.access.unavailable();
    const targetId =
      existing.senderId === userId ? existing.receiverId : existing.senderId;
    return this.access.withUserLocks(userId, targetId, async (tx) => {
      if (await this.access.isBlocked(tx, userId, targetId))
        this.access.unavailable();
      const result = await tx.connection.updateMany({
        where: { id, version, status: 'ACCEPTED' },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException({
          code: 'CONNECTION_CHANGED',
          message: 'Kết nối đã thay đổi. Vui lòng tải lại trang.',
        });

      await this.access.cancelAppointments(
        tx,
        userId,
        existing.pairKey,
        new Date(),
      );
      const profile = await tx.profile.findUnique({
        where: { userId },
        select: { displayName: true },
      });
      await this.notifications.create(
        tx,
        targetId,
        'CONNECTION',
        `${profile?.displayName ?? 'Người dùng'} đã ngắt kết nối với bạn`,
        '/ket-noi',
      );
      await this.notifications.signal(tx, [userId]);
      const updated = await tx.connection.findUniqueOrThrow({ where: { id } });
      return this.views.connectionView(updated, userId);
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
      return { ...this.views.page(items, blockedCount, query), counts };
    }
    const filters = { received, sent, accepted };
    const where = filters[query.tab];
    const rows = await this.prisma.connection.findMany({
      where,
      include: {
        sender: {
          select: {
            profile: {
              include: {
                user: {
                  select: { identityDeclaration: { select: { status: true } } },
                },
              },
            },
          },
        },
        receiver: {
          select: {
            profile: {
              include: {
                user: {
                  select: { identityDeclaration: { select: { status: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const items = rows.map((row) => {
      const other =
        row.senderId === userId ? row.receiver.profile : row.sender.profile;
      const connection = this.views.connectionView(row, userId);
      return other && other.visibility === 'PUBLIC'
        ? this.views.person(other, viewer, row)
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
      ...this.views.page(items, counts[query.tab], query),
      counts,
    };
  }
}
