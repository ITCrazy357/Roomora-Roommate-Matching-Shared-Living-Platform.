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
import {
  personSelect,
  participantView,
  expenseInclude,
} from './expense-views.js';
import { settlementTransfers } from './expense-calculations.js';

@Injectable()
export class ExpenseBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly events: ExpenseEventsService,
    private readonly expenseAccess: ExpenseAccessService,
  ) {}

  async calculate(tx: Prisma.TransactionClient, houseId: string) {
    const people = await tx.houseParticipant.findMany({
      where: { houseId },
      select: personSelect,
      orderBy: { id: 'asc' },
    });
    const expenses = await tx.expense.findMany({
      where: { houseId, status: { not: 'CANCELLED' } },
      select: {
        payerId: true,
        amount: true,
        splits: { select: { participantId: true, amount: true } },
      },
    });
    const payments = await tx.debtPayment.findMany({
      where: { houseId, status: { in: ['PENDING', 'CONFIRMED'] } },
    });
    const rows = new Map(
      people.map((person) => [
        person.id,
        {
          ...participantView(person),
          participantId: person.id,
          paid: 0,
          owed: 0,
          sent: 0,
          received: 0,
          pendingSent: 0,
          pendingReceived: 0,
          balance: 0,
        },
      ]),
    );
    for (const expense of expenses) {
      rows.get(expense.payerId)!.paid += expense.amount;
      for (const split of expense.splits)
        rows.get(split.participantId)!.owed += split.amount;
    }
    for (const payment of payments) {
      if (payment.status === 'CONFIRMED') {
        rows.get(payment.payerId)!.sent += payment.amount;
        rows.get(payment.recipientId)!.received += payment.amount;
      } else {
        rows.get(payment.payerId)!.pendingSent += payment.amount;
        rows.get(payment.recipientId)!.pendingReceived += payment.amount;
      }
    }
    for (const row of rows.values())
      row.balance = row.paid - row.owed + row.sent - row.received;
    return [...rows.values()];
  }

  async get(userId: string, houseId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const house = await this.access.finance(tx, userId, houseId);
        const all = await this.calculate(tx, houseId);
        const balances = house.active
          ? all
          : all.filter(
              (row) =>
                row.userId === userId ||
                (house.ownerId === userId && row.isGuest),
            );
        return {
          balances,
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
      await this.events.signal(tx, houseId);
      return { settled: rows.length };
    });
  }
}
