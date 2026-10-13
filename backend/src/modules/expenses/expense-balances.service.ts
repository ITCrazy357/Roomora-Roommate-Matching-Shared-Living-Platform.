import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { ExpenseEventsService } from './expense-events.service.js';
import { ExpenseAccessService } from './expense-access.service.js';
import { expenseInclude } from './expense-views.js';
import { calculateHouseBalances } from './expense-ledger.js';
import { NotificationsService } from '../communications/notifications.service.js';
import { settlementTransfers } from './expense-calculations.js';

@Injectable()
export class ExpenseBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly events: ExpenseEventsService,
    private readonly expenseAccess: ExpenseAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  calculate(tx: Prisma.TransactionClient, houseId: string) {
    return calculateHouseBalances(tx, houseId);
  }

  async get(userId: string, houseId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const house = await this.access.finance(tx, userId, houseId);
        const all = await calculateHouseBalances(tx, houseId, true);
        const openExpenses = await tx.expense.count({
          where: {
            houseId,
            status: { in: ['ACTIVE', 'ADJUSTMENT_REQUIRED'] },
          },
        });
        const openCorrections = await tx.expenseCorrection.count({
          where: { houseId, settledAt: null },
        });
        const unsettledCount = openExpenses + openCorrections;
        const hasExpenses = await tx.expense.count({
          where: { houseId, status: { not: 'CANCELLED' } },
        });
        const promises = await tx.repaymentPromise.findMany({
          where: { houseId },
        });
        const reminders = await tx.debtReminder.findMany({
          where: { houseId },
        });
        const balances = house.active
          ? all
          : all.filter(
              (row) =>
                row.userId === userId ||
                (house.ownerId === userId && row.isGuest),
            );
        return {
          balances: balances.map((row) => ({
            ...row,
            reminderPausedUntil:
              reminders.find((state) => state.participantId === row.id)
                ?.pausedUntil ?? null,
          })),
          isSettled: hasExpenses > 0 && unsettledCount === 0,
          unsettledCount,
          repaymentPromises: promises
            .filter(
              (promise) =>
                house.active ||
                all.some(
                  (person) =>
                    person.userId === userId &&
                    [promise.payerId, promise.recipientId].includes(person.id),
                ) ||
                (house.ownerId === userId &&
                  all.some(
                    (person) =>
                      person.isGuest &&
                      [promise.payerId, promise.recipientId].includes(
                        person.id,
                      ),
                  )),
            )
            .map((promise) => ({
              ...promise,
              payerName: all.find((person) => person.id === promise.payerId)
                ?.displayName,
              recipientName: all.find(
                (person) => person.id === promise.recipientId,
              )?.displayName,
              payerUserId: all.find((person) => person.id === promise.payerId)
                ?.userId,
              payOn: promise.payOn.toISOString().slice(0, 10),
            })),
          totalBalance: balances.reduce((sum, row) => sum + row.balance, 0),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async settlements(userId: string, houseId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const house = await this.access.finance(tx, userId, houseId);
        const balances = await this.calculate(tx, houseId);
        // Pending transfers reserve their amounts without marking them paid.
        const available = balances.map((row) => ({
          ...row,
          balance: row.balance + row.pendingSent - row.pendingReceived,
        }));
        const transfers = settlementTransfers(available).map((row) => ({
          ...row,
          payerUserId: balances.find((person) => person.id === row.payerId)!
            .userId,
          recipientUserId: balances.find(
            (person) => person.id === row.recipientId,
          )!.userId,
        }));
        return house.active
          ? transfers
          : transfers.filter(
              (row) =>
                row.payerId === userId ||
                row.recipientId === userId ||
                (house.ownerId === userId &&
                  (!row.payerUserId || !row.recipientUserId)),
            );
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async settle(userId: string, houseId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      if (house.ownerId !== userId)
        throw new ForbiddenException({ code: 'EXPENSE_FORBIDDEN' });
      await this.expenseAccess.noPending(tx, houseId);
      if ((await this.calculate(tx, houseId)).some((row) => row.balance !== 0))
        throw new ConflictException({ code: 'HOUSE_HAS_DEBT' });
      const rows = await tx.expense.findMany({
        where: { houseId, status: { in: ['ACTIVE', 'ADJUSTMENT_REQUIRED'] } },
        include: expenseInclude,
      });
      const settledAt = new Date();
      if (rows.some((row) => row.paidAmount < row.amount))
        throw new ConflictException({ code: 'EXPENSE_SUPPLIER_UNPAID' });
      for (const previous of rows) {
        const updated = await tx.expense.update({
          where: { id: previous.id },
          data: { status: 'SETTLED', version: { increment: 1 } },
          include: expenseInclude,
        });
        await this.events.record(
          tx,
          userId,
          previous,
          updated,
          'SETTLE',
          'Quyết toán khi toàn bộ công nợ đã bằng 0',
        );
      }
      const corrections = await tx.expenseCorrection.updateMany({
        where: { houseId, settledAt: null },
        data: { settledAt },
      });
      if (rows.length || corrections.count) {
        await tx.debtPayment.updateMany({
          where: { houseId, status: 'CONFIRMED', settledAt: null },
          data: { settledAt },
        });
        const members = await tx.houseMember.findMany({
          where: { houseId, leftAt: null },
          select: { userId: true },
        });
        for (const member of members)
          await this.notifications.create(
            tx,
            member.userId,
            'HOUSE',
            `Đã chốt quyết toán tại ${house.name.slice(0, 120)}. Toàn bộ công nợ đã cân bằng.`,
            `/nha-chung/${houseId}/chi-phi`,
          );
      }
      await this.events.signal(tx, houseId);
      return { settled: rows.length + corrections.count };
    });
  }
}
