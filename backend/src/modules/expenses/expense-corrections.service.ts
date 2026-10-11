import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import {
  sharingAmounts,
  type SharingShare,
} from '../cost-sharing/cost-sharing-types.js';
import { ExpenseAccessService } from './expense-access.service.js';
import { ExpenseEventsService } from './expense-events.service.js';
import { expenseSplits } from './expense-calculations.js';
import { personSelect, participantView } from './expense-views.js';
import { vietnamDate } from './expense-promises.service.js';
import type {
  CreateExpenseCorrectionDto,
  ExpenseQueryDto,
} from './dto/expenses.dto.js';

export interface CorrectionSnapshot {
  amount: number;
  payerId: string;
  splitMode: 'EQUAL' | 'CUSTOM';
  splits: { participantId: string; amount: number }[];
}

export const correctionInclude = {
  expense: { select: { id: true, title: true, category: true } },
  createdBy: { select: { profile: { select: { displayName: true } } } },
  shares: {
    orderBy: { participantId: 'asc' },
    include: { participant: { select: personSelect } },
  },
} as const;

export function correctionView(
  row: Prisma.ExpenseCorrectionGetPayload<{
    include: typeof correctionInclude;
  }>,
) {
  const { contentHash: _hash, shares, createdBy, ...correction } = row;
  return {
    ...correction,
    createdByName: createdBy.profile?.displayName ?? 'Thành viên Roomora',
    shares: shares.map(({ participant, ...share }) => ({
      ...share,
      participant: participantView(participant),
    })),
  };
}

@Injectable()
export class ExpenseCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly expenseAccess: ExpenseAccessService,
    private readonly events: ExpenseEventsService,
  ) {}

  async create(
    userId: string,
    houseId: string,
    dto: CreateExpenseCorrectionDto,
  ) {
    const requestedSplits = expenseSplits(dto);
    const contentHash = createHash('sha256')
      .update(
        JSON.stringify({
          expenseId: dto.expenseId,
          expenseVersion: dto.expenseVersion,
          correctionVersion: dto.correctionVersion,
          reason: dto.reason,
          payerId: dto.payerId,
          amount: dto.amount,
          splitMode: dto.splitMode,
          splits: requestedSplits,
        }),
      )
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const expense = await this.expenseAccess.expense(
        tx,
        userId,
        houseId,
        dto.expenseId,
      );
      this.expenseAccess.authorized(
        userId,
        house.ownerId,
        expense,
        dto.expenseVersion,
      );
      if (expense.status !== 'SETTLED')
        throw new ConflictException({ code: 'EXPENSE_NOT_SETTLED' });

      // Check retries before latest-version/pending-payment checks.
      const existing = await tx.expenseCorrection.findUnique({
        where: {
          houseId_createdById_clientId: {
            houseId,
            createdById: userId,
            clientId: dto.clientId,
          },
        },
        include: correctionInclude,
      });
      if (existing) {
        if (existing.contentHash !== contentHash)
          throw new ConflictException({ code: 'CORRECTION_RETRY_CHANGED' });
        return correctionView(existing);
      }
      const latest = await tx.expenseCorrection.findFirst({
        where: { expenseId: expense.id },
        orderBy: { version: 'desc' },
      });
      if ((latest?.version ?? 0) !== dto.correctionVersion)
        throw new ConflictException({ code: 'CORRECTION_CHANGED' });
      await this.expenseAccess.noPending(tx, houseId);

      const previous: CorrectionSnapshot = latest
        ? (latest.newSnapshot as unknown as CorrectionSnapshot)
        : {
            amount: expense.amount,
            payerId: expense.payerId,
            splitMode: expense.splitMode,
            splits: expense.splits.map(({ participantId, amount }) => ({
              participantId,
              amount,
            })),
          };
      const rule = expense.sharingSnapshot as {
        mode: 'EQUAL' | 'WEIGHTED';
        shares: SharingShare[];
      } | null;
      const splits = rule
        ? sharingAmounts(dto.amount, rule.mode, rule.shares)
        : requestedSplits;
      const next: CorrectionSnapshot = {
        amount: dto.amount,
        payerId: dto.payerId,
        splitMode: rule
          ? rule.mode === 'EQUAL'
            ? 'EQUAL'
            : 'CUSTOM'
          : dto.splitMode,
        splits,
      };
      const people = await tx.houseParticipant.findMany({ where: { houseId } });
      const historical = new Set([
        expense.payerId,
        ...expense.splits.map((split) => split.participantId),
        previous.payerId,
        ...previous.splits.map((split) => split.participantId),
      ]);
      const affected = new Set([
        previous.payerId,
        next.payerId,
        ...previous.splits.map((split) => split.participantId),
        ...next.splits.map((split) => split.participantId),
      ]);
      for (const id of affected) {
        const person = people.find((row) => row.id === id);
        if (!person || (person.leftAt && !historical.has(id)))
          throw new BadRequestException({ code: 'EXPENSE_MEMBER_NOT_ACTIVE' });
      }
      const shares = [...affected]
        .map((participantId) => ({
          houseId,
          participantId,
          paidDelta:
            (next.payerId === participantId ? next.amount : 0) -
            (previous.payerId === participantId ? previous.amount : 0),
          owedDelta:
            (next.splits.find((split) => split.participantId === participantId)
              ?.amount ?? 0) -
            (previous.splits.find(
              (split) => split.participantId === participantId,
            )?.amount ?? 0),
        }))
        .filter((share) => share.paidDelta !== 0 || share.owedDelta !== 0);
      if (!shares.length)
        throw new BadRequestException({ code: 'CORRECTION_NO_CHANGE' });
      const correction = await tx.expenseCorrection.create({
        data: {
          houseId,
          expenseId: expense.id,
          createdById: userId,
          clientId: dto.clientId,
          contentHash,
          version: dto.correctionVersion + 1,
          reason: dto.reason,
          amountDelta: next.amount - previous.amount,
          oldSnapshot: previous as unknown as Prisma.InputJsonObject,
          newSnapshot: next as unknown as Prisma.InputJsonObject,
          recordedOn: new Date(`${vietnamDate(new Date())}T00:00:00.000Z`),
          shares: { create: shares },
        },
        include: correctionInclude,
      });
      await this.events.signal(
        tx,
        houseId,
        people
          .filter((person) => affected.has(person.id) && person.userId)
          .map((person) => person.userId!),
      );
      return correctionView(correction);
    });
  }

  async list(userId: string, houseId: string, query: ExpenseQueryDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const house = await this.access.finance(tx, userId, houseId);
        const where: Prisma.ExpenseCorrectionWhereInput = {
          houseId,
          ...(!house.active
            ? {
                OR: [
                  { createdById: userId },
                  { shares: { some: { participant: { userId } } } },
                  {
                    expense: {
                      OR: [
                        { payer: { userId } },
                        { createdById: userId },
                        { splits: { some: { participant: { userId } } } },
                      ],
                    },
                  },
                ],
              }
            : {}),
        };
        const items = await tx.expenseCorrection.findMany({
          where,
          include: correctionInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit,
          skip: (query.page - 1) * query.limit,
        });
        const total = await tx.expenseCorrection.count({ where });
        return {
          items: items.map(correctionView),
          total,
          page: query.page,
          pages: Math.ceil(total / query.limit),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
