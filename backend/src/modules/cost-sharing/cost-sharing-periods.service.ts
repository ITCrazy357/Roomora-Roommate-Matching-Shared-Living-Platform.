import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ExpenseCategory } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { NotificationsService } from '../communications/notifications.service.js';
import {
  currentSharingMonth,
  periodInclude,
  roundInclude,
  sharingDeadline,
  sharingHash,
  sharingMembers,
  sharingMonth,
  sharingRoundView,
  type SharingFallback,
  type SharingMember,
  type SharingPeriod,
  type SharingShare,
} from './cost-sharing-types.js';
import type {
  SharingDefaultDto,
  SharingReopenDto,
  SharingSettingDto,
} from './dto/cost-sharing.dto.js';
import type { ExpenseQueryDto } from '../expenses/dto/expenses.dto.js';

@Injectable()
export class CostSharingPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async signal(tx: Prisma.TransactionClient, houseId: string, title?: string) {
    const members = await tx.houseMember.findMany({
      where: { houseId, leftAt: null },
      select: { userId: true },
    });
    if (title)
      for (const member of members)
        await this.notifications.create(
          tx,
          member.userId,
          'HOUSE',
          title,
          `/nha-chung/${houseId}/chia-chi-phi`,
        );
    else
      await this.notifications.signal(
        tx,
        members.map((row) => row.userId),
      );
  }
  async get(tx: Prisma.TransactionClient, houseId: string, id: string) {
    const row = await tx.costSharingPeriod.findFirst({
      where: { id, houseId },
      include: periodInclude,
    });
    if (!row) throw new NotFoundException({ code: 'SHARING_NOT_FOUND' });
    return row;
  }
  async refresh(
    tx: Prisma.TransactionClient,
    row: SharingPeriod,
    now = new Date(),
  ) {
    if (row.status !== 'OPEN') return row;
    const hash = sharingHash(await sharingMembers(tx, row.houseId));
    if (hash !== row.rounds[0].memberHash) {
      await tx.costSharingPeriod.update({
        where: { id: row.id },
        data: { status: 'NEEDS_REVIEW' },
      });
      await this.signal(tx, row.houseId);
      return this.get(tx, row.houseId, row.id);
    }
    if (row.deadlineAt <= now) {
      const fallback =
        row.fallbackSnapshot as unknown as SharingFallback | null;
      const valid = row.kind === 'MONTHLY' && fallback?.memberHash === hash;
      await tx.costSharingPeriod.update({
        where: { id: row.id },
        data: valid
          ? {
              status: 'FALLBACK',
              resultMode: fallback.mode,
              resultShares: fallback.shares as unknown as Prisma.InputJsonValue,
              resultMemberHash: hash,
              decidedAt: now,
            }
          : { status: 'UNRESOLVED', decidedAt: now },
      });
      await tx.costSharingRound.update({
        where: { id: row.rounds[0].id },
        data: { status: valid ? 'FALLBACK' : 'UNRESOLVED', resolvedAt: now },
      });
      await this.signal(
        tx,
        row.houseId,
        valid
          ? 'Kỳ chia chi phí dùng phương án dự phòng đã thống nhất.'
          : 'Kỳ chia chi phí hết hạn nhưng chưa thống nhất.',
      );
      return this.get(tx, row.houseId, row.id);
    }
    return row;
  }
  async open(
    tx: Prisma.TransactionClient,
    houseId: string,
    category: ExpenseCategory,
    month: string,
    kind: 'MONTHLY' | 'DEFAULT',
    deadlineAt: Date,
    now: Date,
  ) {
    const members = await sharingMembers(tx, houseId),
      hash = sharingHash(members);
    if (!members.length || members.length > 100)
      throw new BadRequestException({ code: 'SHARING_MEMBERS_INVALID' });
    const fallback =
      kind === 'MONTHLY'
        ? await tx.costSharingPeriod.findFirst({
            where: {
              houseId,
              category,
              kind: 'DEFAULT',
              status: 'AGREED',
              resultMemberHash: hash,
              decidedAt: { lt: now },
            },
            orderBy: { decidedAt: 'desc' },
          })
        : null;
    const row = await tx.costSharingPeriod.create({
      data: {
        houseId,
        category,
        month,
        kind,
        deadlineAt,
        createdAt: now,
        ...(fallback
          ? {
              fallbackSnapshot: {
                periodId: fallback.id,
                mode: fallback.resultMode!,
                shares: fallback.resultShares!,
                memberHash: hash,
              } as Prisma.InputJsonValue,
            }
          : {}),
        rounds: {
          create: {
            number: 1,
            phase: 'PREFERENCE',
            memberHash: hash,
            members: members as unknown as Prisma.InputJsonValue,
          },
        },
      },
      include: periodInclude,
    });
    await this.signal(
      tx,
      houseId,
      kind === 'DEFAULT'
        ? 'Cùng thống nhất phương án chia chi phí dự phòng.'
        : `Bình chọn cách chia chi phí tháng ${month}.`,
    );
    return row;
  }
  async sync(tx: Prisma.TransactionClient, houseId: string, now = new Date()) {
    const month = currentSharingMonth(now);
    const settings = await tx.costSharingSetting.findMany({
      where: { houseId, enabled: true },
    });
    for (const setting of settings) {
      const existing = await tx.costSharingPeriod.findFirst({
        where: { houseId, month, category: setting.category, kind: 'MONTHLY' },
        include: periodInclude,
      });
      const row =
        existing ??
        (await this.open(
          tx,
          houseId,
          setting.category,
          month,
          'MONTHLY',
          sharingDeadline(month, setting.deadlineDay),
          now,
        ));
      await this.refresh(tx, row, now);
    }
    const expired = await tx.costSharingPeriod.findMany({
      where: { houseId, status: 'OPEN', deadlineAt: { lte: now } },
      include: periodInclude,
    });
    for (const row of expired) await this.refresh(tx, row, now);
  }
  async list(userId: string, houseId: string, month: string) {
    sharingMonth(month);
    return this.prisma.$transaction(
      async (tx) => {
        await this.access.lock(tx, houseId);
        await this.access.active(tx, userId, houseId);
        await this.sync(tx, houseId);
        const monthly = await tx.costSharingPeriod.findMany({
          where: { houseId, month, kind: 'MONTHLY' },
          include: periodInclude,
          orderBy: { category: 'asc' },
        });
        const defaults = await tx.costSharingPeriod.findMany({
          where: { houseId, kind: 'DEFAULT' },
          include: periodInclude,
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        const periods = [...monthly, ...defaults];
        const members = await sharingMembers(tx, houseId),
          hash = sharingHash(members),
          rows = [];
        for (const row of periods) {
          const current = await this.refresh(tx, row);
          rows.push({
            ...current,
            rounds: current.rounds.map((round) =>
              sharingRoundView(round, members),
            ),
            membershipChanged: current.rounds[0].memberHash !== hash,
          });
        }
        return {
          settings: await tx.costSharingSetting.findMany({
            where: { houseId },
          }),
          periods: rows,
          members,
        };
      },
      { timeout: 15000 },
    );
  }
  async history(
    userId: string,
    houseId: string,
    id: string,
    query: ExpenseQueryDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.active(tx, userId, houseId);
      await this.get(tx, houseId, id);
      const items = await tx.costSharingRound.findMany({
        where: { periodId: id },
        include: {
          ...roundInclude,
          events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
        orderBy: { number: 'desc' },
        take: query.limit,
        skip: (query.page - 1) * query.limit,
      });
      const total = await tx.costSharingRound.count({
        where: { periodId: id },
      });
      const memberIds = [
        ...new Set(
          items.flatMap((round) =>
            (round.members as unknown as SharingMember[]).map(
              (member) => member.userId,
            ),
          ),
        ),
      ];
      const profiles = await tx.profile.findMany({
        where: { userId: { in: memberIds } },
        select: { userId: true, avatarUrl: true },
      });
      return {
        items: items.map((round) => sharingRoundView(round, profiles)),
        total,
        page: query.page,
        pages: Math.ceil(total / query.limit),
      };
    });
  }
  async setting(
    userId: string,
    houseId: string,
    category: ExpenseCategory,
    dto: SharingSettingDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.access.lock(tx, houseId);
        const house = await this.access.active(tx, userId, houseId);
        if (house.ownerId !== userId)
          throw new ForbiddenException({ code: 'SHARING_OWNER_REQUIRED' });
        const values = { enabled: dto.enabled, deadlineDay: dto.deadlineDay };
        const row = await tx.costSharingSetting.upsert({
          where: { houseId_category: { houseId, category } },
          create: { houseId, category, ...values },
          update: values,
        });
        await this.sync(tx, houseId);
        await this.signal(tx, houseId);
        return row;
      },
      { timeout: 15000 },
    );
  }
  private deadline(value: string, month?: string) {
    const date = new Date(value),
      now = new Date();
    if (
      date <= now ||
      date.getTime() > now.getTime() + 31 * 86400000 ||
      (month && currentSharingMonth(date) !== month)
    )
      throw new BadRequestException({ code: 'SHARING_DEADLINE_INVALID' });
    return date;
  }
  async openDefault(userId: string, houseId: string, dto: SharingDefaultDto) {
    const deadline = this.deadline(dto.deadlineAt);
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      if (house.ownerId !== userId)
        throw new ForbiddenException({ code: 'SHARING_OWNER_REQUIRED' });
      const existing = await tx.costSharingPeriod.findFirst({
        where: {
          houseId,
          category: dto.category,
          kind: 'DEFAULT',
          status: 'OPEN',
        },
        include: periodInclude,
      });
      if (existing && (await this.refresh(tx, existing)).status === 'OPEN')
        return existing;
      const now = new Date();
      return this.open(
        tx,
        houseId,
        dto.category,
        currentSharingMonth(now),
        'DEFAULT',
        deadline,
        now,
      );
    });
  }
  async reopen(
    userId: string,
    houseId: string,
    id: string,
    dto: SharingReopenDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      if (house.ownerId !== userId)
        throw new ForbiddenException({ code: 'SHARING_OWNER_REQUIRED' });
      const row = await this.get(tx, houseId, id);
      const members = await sharingMembers(tx, houseId),
        hash = sharingHash(members);
      if (row.currentRound >= 100)
        throw new ConflictException({ code: 'SHARING_ROUND_LIMIT' });
      if (
        (row.resultMode && row.resultMemberHash === hash) ||
        row.rounds[0].id !== dto.roundId
      )
        throw new ConflictException({ code: 'SHARING_ROUND_CLOSED' });
      if (
        row.kind === 'DEFAULT' &&
        (await tx.costSharingPeriod.findFirst({
          where: {
            houseId,
            category: row.category,
            kind: 'DEFAULT',
            status: 'OPEN',
            id: { not: id },
          },
        }))
      )
        throw new ConflictException({ code: 'SHARING_DEFAULT_ALREADY_OPEN' });
      const deadline = this.deadline(
        dto.deadlineAt,
        row.kind === 'MONTHLY' ? row.month : undefined,
      );
      if (row.rounds[0].status === 'OPEN')
        await tx.costSharingRound.update({
          where: { id: row.rounds[0].id },
          data: { status: 'SUPERSEDED', resolvedAt: new Date() },
        });
      await tx.costSharingRound.create({
        data: {
          periodId: id,
          number: row.currentRound + 1,
          phase: 'PREFERENCE',
          memberHash: hash,
          members: members as unknown as Prisma.InputJsonValue,
          createdById: userId,
        },
      });
      await tx.costSharingPeriod.update({
        where: { id },
        data: {
          currentRound: { increment: 1 },
          deadlineAt: deadline,
          status: 'OPEN',
          decidedAt: null,
          resultMode: null,
          resultShares: Prisma.JsonNull,
          resultMemberHash: null,
        },
      });
      await this.signal(
        tx,
        houseId,
        'Kỳ chia chi phí mở vòng mới; hãy bình chọn lại.',
      );
      return this.get(tx, houseId, id);
    });
  }
  assertOpen(row: SharingPeriod, roundId: string, members: SharingMember[]) {
    if (
      row.status !== 'OPEN' ||
      row.deadlineAt <= new Date() ||
      row.rounds[0].id !== roundId
    )
      throw new ConflictException({ code: 'SHARING_ROUND_CLOSED' });
    if (row.rounds[0].memberHash !== sharingHash(members))
      throw new ConflictException({ code: 'SHARING_MEMBERS_CHANGED' });
  }
  async agree(
    tx: Prisma.TransactionClient,
    row: SharingPeriod,
    mode: 'EQUAL' | 'WEIGHTED',
    shares: SharingShare[],
  ) {
    await tx.costSharingRound.update({
      where: { id: row.rounds[0].id },
      data: {
        status: 'AGREED',
        mode,
        shares: shares as unknown as Prisma.InputJsonValue,
        resolvedAt: new Date(),
      },
    });
    await tx.costSharingPeriod.update({
      where: { id: row.id },
      data: {
        status: 'AGREED',
        resultMode: mode,
        resultShares: shares as unknown as Prisma.InputJsonValue,
        resultMemberHash: row.rounds[0].memberHash,
        decidedAt: new Date(),
      },
    });
    await this.signal(
      tx,
      row.houseId,
      'Cả nhà đã thống nhất cách chia chi phí.',
    );
  }
}
