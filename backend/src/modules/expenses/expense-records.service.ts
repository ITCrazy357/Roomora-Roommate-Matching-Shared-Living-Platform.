import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { ExpenseEventsService } from './expense-events.service.js';
import { ExpenseAccessService } from './expense-access.service.js';
import type {
  CreateExpenseDto,
  UpdateExpenseDto,
  CancelExpenseDto,
  ExpenseQueryDto,
} from './dto/expenses.dto.js';
import { expenseSplits } from './expense-calculations.js';
import { vietnamDate } from './expense-promises.service.js';
import { CostSharingRulesService } from '../cost-sharing/cost-sharing-rules.service.js';
import {
  sharingAmounts,
  type SharingShare,
} from '../cost-sharing/cost-sharing-types.js';
import {
  expenseInclude,
  expenseView,
  type ExpenseRow,
} from './expense-views.js';

@Injectable()
export class ExpenseRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly events: ExpenseEventsService,
    private readonly expenseAccess: ExpenseAccessService,
    private readonly sharing: CostSharingRulesService,
  ) {}

  private async validatePeople(
    tx: Prisma.TransactionClient,
    houseId: string,
    payerId: string,
    splits: { participantId: string; amount: number }[],
    previous?: ExpenseRow,
  ) {
    const ids = [
      ...new Set([payerId, ...splits.map((split) => split.participantId)]),
    ];
    const people = await tx.houseParticipant.findMany({
      where: { houseId, id: { in: ids } },
      select: { id: true, leftAt: true },
    });
    const historical = new Set(
      previous
        ? [
            previous.payerId,
            ...previous.splits.map((split) => split.participantId),
          ]
        : [],
    );
    if (
      people.length !== ids.length ||
      people.some((person) => person.leftAt && !historical.has(person.id))
    )
      throw new BadRequestException({ code: 'EXPENSE_MEMBER_NOT_ACTIVE' });
  }

  async create(userId: string, houseId: string, dto: CreateExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      return this.createInTransaction(tx, userId, houseId, dto);
    });
  }

  // Recurring draft confirmation must commit the expense and draft together.
  async createInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    houseId: string,
    dto: CreateExpenseDto,
    createdById = userId,
  ) {
    const splits = expenseSplits(dto);
    const data = {
      title: dto.title,
      description: dto.description,
      payerId: dto.payerId,
      amount: dto.amount,
      receiptUrl: dto.receiptUrl ?? null,
      splitMode: dto.splitMode,
    };
    const contentHash = createHash('sha256')
      .update(
        JSON.stringify({
          ...data,
          splits,
          ...(dto.category ? { category: dto.category } : {}),
          ...(dto.spentOn ? { spentOn: dto.spentOn } : {}),
        }),
      )
      .digest('hex');
    await this.access.active(tx, userId, houseId);
    const existing = await tx.expense.findUnique({
      where: {
        houseId_createdById_clientId: {
          houseId,
          createdById,
          clientId: dto.clientId,
        },
      },
      include: expenseInclude,
    });
    if (existing) {
      if (existing.contentHash !== contentHash)
        throw new ConflictException({ code: 'EXPENSE_RETRY_CHANGED' });
      return expenseView(existing);
    }
    await this.expenseAccess.noPending(tx, houseId);
    const category = dto.category ?? 'OTHER';
    const spentOn = dto.spentOn ?? vietnamDate(new Date());
    const rule = await this.sharing.apply(
      tx,
      houseId,
      spentOn.slice(0, 7),
      category,
      dto.amount,
    );
    const actualSplits = rule?.splits ?? splits;
    await this.validatePeople(tx, houseId, dto.payerId, actualSplits);
    const row = await tx.expense.create({
      data: {
        ...data,
        category,
        spentOn: new Date(`${spentOn}T00:00:00Z`),
        ...(rule
          ? {
              splitMode: rule.mode === 'EQUAL' ? 'EQUAL' : 'CUSTOM',
              sharingPeriodId: rule.periodId,
              sharingSnapshot: rule.snapshot,
            }
          : {}),
        houseId,
        createdById,
        clientId: dto.clientId,
        contentHash,
        splits: {
          create: actualSplits.map((split) => ({ ...split, houseId })),
        },
      },
      include: expenseInclude,
    });
    await this.events.record(tx, userId, null, row, 'CREATE', 'Ghi khoản chi');
    await this.events.signal(tx, houseId);
    return expenseView(row);
  }

  async update(
    userId: string,
    houseId: string,
    id: string,
    dto: UpdateExpenseDto,
  ) {
    const splits = expenseSplits(dto);
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const previous = await this.expenseAccess.expense(
        tx,
        userId,
        houseId,
        id,
      );
      this.expenseAccess.editable(userId, house.ownerId, previous, dto.version);
      await this.expenseAccess.noPending(tx, houseId);
      const category = dto.category ?? previous.category;
      const spentOn =
        dto.spentOn ?? previous.spentOn.toISOString().slice(0, 10);
      const samePeriod =
        category === previous.category &&
        spentOn.slice(0, 7) === previous.spentOn.toISOString().slice(0, 7);
      const snapshot = previous.sharingSnapshot as unknown as {
        mode: 'EQUAL' | 'WEIGHTED';
        shares: SharingShare[];
      } | null;
      const rule = samePeriod
        ? snapshot
          ? {
              periodId: previous.sharingPeriodId!,
              mode: snapshot.mode,
              snapshot: previous.sharingSnapshot as Prisma.InputJsonValue,
              splits: sharingAmounts(
                dto.amount,
                snapshot.mode,
                snapshot.shares,
              ),
            }
          : null
        : await this.sharing.apply(
            tx,
            houseId,
            spentOn.slice(0, 7),
            category,
            dto.amount,
          );
      const actualSplits = rule?.splits ?? splits;
      await this.validatePeople(
        tx,
        houseId,
        dto.payerId,
        actualSplits,
        previous,
      );
      await tx.expenseSplit.deleteMany({ where: { expenseId: id } });
      const updated = await tx.expense.update({
        where: { id },
        data: {
          title: dto.title,
          category,
          spentOn: dto.spentOn
            ? new Date(`${dto.spentOn}T00:00:00Z`)
            : previous.spentOn,
          description: dto.description,
          payerId: dto.payerId,
          amount: dto.amount,
          receiptUrl: dto.receiptUrl ?? previous.receiptUrl,
          splitMode: rule
            ? rule.mode === 'EQUAL'
              ? 'EQUAL'
              : 'CUSTOM'
            : dto.splitMode,
          sharingPeriodId: rule?.periodId ?? null,
          sharingSnapshot: rule?.snapshot ?? Prisma.JsonNull,
          status: 'ACTIVE',
          version: { increment: 1 },
          splits: {
            create: actualSplits.map((split) => ({ ...split, houseId })),
          },
        },
        include: expenseInclude,
      });
      await this.events.record(
        tx,
        userId,
        previous,
        updated,
        previous.status === 'SETTLED' ? 'ADJUST_SETTLED' : 'EDIT',
        dto.reason,
      );
      await this.events.signal(tx, houseId);
      return expenseView(updated);
    });
  }

  async cancel(
    userId: string,
    houseId: string,
    id: string,
    dto: CancelExpenseDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const previous = await this.expenseAccess.expense(
        tx,
        userId,
        houseId,
        id,
      );
      this.expenseAccess.editable(userId, house.ownerId, previous, dto.version);
      await this.expenseAccess.noPending(tx, houseId);
      const updated = await tx.expense.update({
        where: { id },
        data: { status: 'CANCELLED', version: { increment: 1 } },
        include: expenseInclude,
      });
      await this.events.record(
        tx,
        userId,
        previous,
        updated,
        previous.status === 'SETTLED' ? 'CANCEL_SETTLED' : 'CANCEL',
        dto.reason,
      );
      await this.events.signal(tx, houseId);
      return expenseView(updated);
    });
  }

  async list(userId: string, houseId: string, query: ExpenseQueryDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const house = await this.access.finance(tx, userId, houseId);
        const where: Prisma.ExpenseWhereInput = {
          houseId,
          ...(!house.active
            ? {
                OR: [
                  { payer: { userId } },
                  { createdById: userId },
                  { splits: { some: { participant: { userId } } } },
                ],
              }
            : {}),
        };
        const items = await tx.expense.findMany({
          where,
          include: expenseInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });
        const total = await tx.expense.count({ where });
        return {
          items: items.map((row) => expenseView(row)),
          total,
          page: query.page,
          pages: Math.ceil(total / query.limit),
          active: house.active,
          ownerId: house.ownerId,
          houseName: house.name,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async adjustments(userId: string, houseId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.expenseAccess.expense(tx, userId, houseId, id);
      return tx.expenseAdjustment.findMany({
        where: { expenseId: id },
        orderBy: [{ version: 'asc' }, { createdAt: 'asc' }],
        include: {
          createdBy: { select: { profile: { select: { displayName: true } } } },
        },
      });
    });
  }
}
