import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { NotificationsService } from '../communications/notifications.service.js';
import { calculateHouseBalances } from './expense-ledger.js';
import { settlementTransfers } from './expense-calculations.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const money = (amount: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);

@Injectable()
export class ExpenseRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpenseRemindersService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  // Called under the house lock in each financial transaction, including payments.
  async sync(tx: Prisma.TransactionClient, houseId: string, now = new Date()) {
    const balances = await calculateHouseBalances(tx, houseId);
    const available = settlementTransfers(
      balances.map((row) => ({
        ...row,
        balance: row.balance + row.pendingSent - row.pendingReceived,
      })),
    );
    const promises = await tx.repaymentPromise.findMany({ where: { houseId } });
    const validPromises: typeof promises = [];
    for (const promise of promises) {
      const payer = balances.find((row) => row.id === promise.payerId);
      const recipient = balances.find((row) => row.id === promise.recipientId);
      const transfer = available.find(
        (row) =>
          row.payerId === promise.payerId &&
          row.recipientId === promise.recipientId,
      );
      if (
        !payer ||
        !recipient ||
        payer.balance >= 0 ||
        recipient.balance <= 0 ||
        (transfer && transfer.amount > promise.amount)
      ) {
        await tx.repaymentPromise.delete({
          where: {
            houseId_payerId_recipientId: {
              houseId,
              payerId: promise.payerId,
              recipientId: promise.recipientId,
            },
          },
        });
      } else validPromises.push(promise);
    }
    const states = await tx.debtReminder.findMany({ where: { houseId } });
    for (const person of balances) {
      if (!person.userId) continue;
      const previous = states.find((row) => row.participantId === person.id);
      if (person.balance >= 0) {
        if (previous) {
          await tx.debtReminder.update({
            where: { id: previous.id },
            data: {
              debtSinceAt: null,
              lastReminderAt: null,
              nextReminderAt: null,
              pausedUntil: null,
              unpaidAmount: 0,
            },
          });
          await this.cancelQueued(tx, previous.id);
        }
        continue;
      }
      const unpaidAmount = Math.max(0, -person.balance - person.pendingSent);
      const transfers = available.filter((row) => row.payerId === person.id);
      const dates = transfers.map(
        (row) =>
          validPromises.find(
            (promise) =>
              promise.payerId === row.payerId &&
              promise.recipientId === row.recipientId &&
              promise.amount >= row.amount &&
              promise.remindAfter > now,
          )?.remindAfter,
      );
      const pausedUntil =
        dates.length && dates.every((date) => !!date)
          ? new Date(Math.min(...dates.map((date) => date!.getTime())))
          : null;
      const debtSinceAt = previous?.debtSinceAt ?? now;
      const regularDue = new Date(
        (previous?.lastReminderAt ?? debtSinceAt).getTime() + WEEK,
      );
      const nextReminderAt =
        unpaidAmount > 0
          ? new Date(
              Math.max(regularDue.getTime(), pausedUntil?.getTime() ?? 0),
            )
          : null;
      const state = await tx.debtReminder.upsert({
        where: { houseId_participantId: { houseId, participantId: person.id } },
        create: {
          houseId,
          participantId: person.id,
          debtSinceAt,
          unpaidAmount,
          pausedUntil,
          nextReminderAt,
        },
        update: { debtSinceAt, unpaidAmount, pausedUntil, nextReminderAt },
      });
      if (
        !unpaidAmount ||
        pausedUntil ||
        (previous && previous.unpaidAmount !== unpaidAmount)
      )
        await this.cancelQueued(tx, state.id);
    }
  }

  private async cancelQueued(tx: Prisma.TransactionClient, id: string) {
    await tx.notification.updateMany({
      where: { debtReminderId: id, emailSentAt: null, emailRequired: true },
      data: { emailRequired: false },
    });
  }

  async runDue(now = new Date(), houseId?: string) {
    if (this.running) return;
    this.running = true;
    try {
      // Bounded batches; the house lock prevents duplicate queues across instances.
      const due = await this.prisma.debtReminder.findMany({
        where: {
          nextReminderAt: { lte: now },
          debtSinceAt: { not: null },
          ...(houseId ? { houseId } : {}),
        },
        select: { houseId: true },
        distinct: ['houseId'],
        orderBy: { nextReminderAt: 'asc' },
        take: 100,
      });
      for (const { houseId } of due)
        await this.prisma.$transaction(async (tx) => {
          await this.access.lock(tx, houseId);
          await this.sync(tx, houseId, now);
          const house = await tx.house.findUniqueOrThrow({
            where: { id: houseId },
            select: { name: true },
          });
          const states = await tx.debtReminder.findMany({
            where: {
              houseId,
              nextReminderAt: { lte: now },
              unpaidAmount: { gt: 0 },
            },
            include: { participant: { select: { userId: true } } },
          });
          for (const state of states) {
            if (!state.participant.userId) continue;
            // Retire any exhausted older mail before creating this week's reminder.
            await this.cancelQueued(tx, state.id);
            await this.notifications.create(
              tx,
              state.participant.userId,
              'HOUSE',
              `Bạn còn cần trả ${money(state.unpaidAmount)} tại ${house.name.slice(0, 100)}. Vui lòng kiểm tra công nợ.`,
              `/nha-chung/${houseId}/chi-phi`,
              true,
              state.id,
            );
            await tx.debtReminder.update({
              where: { id: state.id },
              data: {
                lastReminderAt: now,
                nextReminderAt: new Date(now.getTime() + WEEK),
              },
            });
          }
        });
    } finally {
      this.running = false;
    }
  }

  private async initialize() {
    let cursor: string | undefined;
    while (true) {
      const houses = await this.prisma.house.findMany({
        where: { expenses: { some: { status: { not: 'CANCELLED' } } } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const house of houses)
        await this.prisma.$transaction(async (tx) => {
          await this.access.lock(tx, house.id);
          await this.sync(tx, house.id);
        });
      if (houses.length < 100) break;
      cursor = houses.at(-1)!.id;
    }
    await this.runDue();
  }

  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    void this.initialize().catch(() =>
      this.logger.warn('Cannot initialize debt reminders'),
    );
    if (this.config.get('SMTP_HOST')) {
      this.timer = setInterval(() => {
        void this.runDue().catch(() =>
          this.logger.warn('Cannot queue debt reminders'),
        );
      }, 60000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
