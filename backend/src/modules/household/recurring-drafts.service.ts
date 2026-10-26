import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { ExpenseRecordsService } from '../expenses/expense-records.service.js';
import type { ExpenseVersionDto } from '../expenses/dto/expenses.dto.js';
import { HouseholdAccessService } from './household-access.service.js';
import type {
  ActivityQueryDto,
  ConfirmRecurringDraftDto,
} from './dto/household.dto.js';

@Injectable()
export class RecurringDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly rules: HouseholdAccessService,
    private readonly expenses: ExpenseRecordsService,
  ) {}
  async list(userId: string, houseId: string, query: ActivityQueryDto) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.access.active(tx, userId, houseId);
        const where = { rule: { houseId }, status: 'PENDING' as const };
        const items = await tx.recurringExpenseDraft.findMany({
          where,
          include: { rule: { select: { createdById: true } } },
          orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });
        const total = await tx.recurringExpenseDraft.count({ where });
        return {
          items,
          total,
          page: query.page,
          pages: Math.ceil(total / query.limit),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  private async get(tx: Prisma.TransactionClient, houseId: string, id: string) {
    const row = await tx.recurringExpenseDraft.findFirst({
      where: { id, rule: { houseId } },
      include: { rule: { select: { createdById: true } } },
    });
    if (!row) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND' });
    return row;
  }
  private async canConfirm(
    tx: Prisma.TransactionClient,
    userId: string,
    houseId: string,
    ownerId: string,
    row: Awaited<ReturnType<RecurringDraftsService['get']>>,
  ) {
    const payer = await tx.houseParticipant.findUnique({
      where: { houseId_id: { houseId, id: row.payerId } },
    });
    if (
      userId !== ownerId &&
      userId !== row.rule.createdById &&
      userId !== payer?.userId
    )
      throw new ForbiddenException({ code: 'HOUSEHOLD_FORBIDDEN' });
  }
  async confirm(
    userId: string,
    houseId: string,
    id: string,
    dto: ConfirmRecurringDraftDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId),
        row = await this.get(tx, houseId, id);
      await this.canConfirm(tx, userId, houseId, house.ownerId, row);
      if (row.status === 'SKIPPED')
        throw new ConflictException({ code: 'HOUSEHOLD_CLOSED' });
      // Retry by any authorized person returns the same expense; changes are rejected.
      const input = {
        title: dto.title,
        description: dto.description,
        payerId: dto.payerId,
        amount: dto.amount,
        paidAmount: dto.paidAmount,
        splitMode: dto.splitMode,
        participantIds: dto.participantIds,
        splits: dto.splits,
        receiptUrl: dto.receiptUrl,
        category: dto.category ?? row.category,
        spentOn: dto.spentOn ?? row.dueOn.toISOString().slice(0, 10),
        clientId: `recurring:${id}`,
      };
      if (row.status === 'CONFIRMED') {
        const previous = await tx.expense.findUniqueOrThrow({
          where: { id: row.expenseId! },
          select: { createdById: true },
        });
        return this.expenses.createInTransaction(
          tx,
          userId,
          houseId,
          input,
          previous.createdById,
        );
      }
      this.rules.version(row.version, dto.version);
      const expense = await this.expenses.createInTransaction(
        tx,
        userId,
        houseId,
        input,
      );
      await tx.recurringExpenseDraft.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          expenseId: expense.id,
          version: { increment: 1 },
        },
      });
      return expense;
    });
  }
  async skip(
    userId: string,
    houseId: string,
    id: string,
    dto: ExpenseVersionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId),
        row = await this.get(tx, houseId, id);
      await this.canConfirm(tx, userId, houseId, house.ownerId, row);
      if (row.status === 'SKIPPED') return { skipped: true };
      this.rules.version(row.version, dto.version);
      if (row.status !== 'PENDING')
        throw new ConflictException({ code: 'HOUSEHOLD_CLOSED' });
      await tx.recurringExpenseDraft.update({
        where: { id },
        data: { status: 'SKIPPED', version: { increment: 1 } },
      });
      await this.rules.signal(tx, houseId);
      return { skipped: true };
    });
  }
}
