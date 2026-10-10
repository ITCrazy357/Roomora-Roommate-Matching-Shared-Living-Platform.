import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { NotificationsService } from '../communications/notifications.service.js';
import { ExpenseEventsService } from './expense-events.service.js';
import { calculateHouseBalances } from './expense-ledger.js';
import { settlementTransfers } from './expense-calculations.js';
import type {
  ExpenseVersionDto,
  RepaymentPromiseDto,
} from './dto/expenses.dto.js';

export const vietnamDate = (date = new Date()) =>
  new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

@Injectable()
export class ExpensePromisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly events: ExpenseEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  async save(userId: string, houseId: string, dto: RepaymentPromiseDto) {
    const now = new Date();
    if (
      dto.payOn < vietnamDate(now) ||
      dto.payOn > vietnamDate(new Date(now.getTime() + 30 * 86400000))
    )
      throw new BadRequestException({ code: 'REPAYMENT_DATE_INVALID' });
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.finance(tx, userId, houseId);
      const balances = await calculateHouseBalances(tx, houseId);
      const payer = balances.find((row) => row.userId === userId);
      const recipient = balances.find((row) => row.id === dto.recipientId);
      const transfer = settlementTransfers(
        balances.map((row) => ({
          ...row,
          balance: row.balance + row.pendingSent - row.pendingReceived,
        })),
      ).find(
        (row) =>
          row.payerId === payer?.id && row.recipientId === dto.recipientId,
      );
      if (!payer || !recipient || !transfer)
        throw new BadRequestException({ code: 'REPAYMENT_DEBT_CHANGED' });
      const key = { houseId, payerId: payer.id, recipientId: recipient.id };
      const previous = await tx.repaymentPromise.findUnique({
        where: { houseId_payerId_recipientId: key },
      });
      const payOn = new Date(`${dto.payOn}T00:00:00.000Z`);
      if (
        previous?.payOn.getTime() === payOn.getTime() &&
        previous.amount === transfer.amount
      )
        return previous;
      if (previous && dto.version !== previous.version)
        throw new ConflictException({ code: 'REPAYMENT_PROMISE_CHANGED' });
      const remindAfter = new Date(`${dto.payOn}T23:59:59.999+07:00`);
      const promise = await tx.repaymentPromise.upsert({
        where: { houseId_payerId_recipientId: key },
        create: { ...key, amount: transfer.amount, payOn, remindAfter },
        update: {
          amount: transfer.amount,
          payOn,
          remindAfter,
          version: { increment: 1 },
        },
      });
      const targetId = recipient.userId ?? house.ownerId;
      await this.notifications.create(
        tx,
        targetId,
        'HOUSE',
        `${payer.displayName.slice(0, 70)} hẹn trả tiền ngày ${dto.payOn.split('-').reverse().join('/')} tại ${house.name.slice(0, 70)}.`,
        `/nha-chung/${houseId}/chi-phi`,
      );
      await this.events.signal(tx, houseId, [userId, targetId]);
      return promise;
    });
  }

  async cancel(
    userId: string,
    houseId: string,
    recipientId: string,
    dto: ExpenseVersionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.finance(tx, userId, houseId);
      const payer = await tx.houseParticipant.findUnique({
        where: { houseId_userId: { houseId, userId } },
      });
      if (!payer)
        throw new BadRequestException({ code: 'REPAYMENT_DEBT_CHANGED' });
      const key = { houseId, payerId: payer.id, recipientId };
      const promise = await tx.repaymentPromise.findUnique({
        where: { houseId_payerId_recipientId: key },
        include: { recipient: true },
      });
      if (!promise) return { cancelled: true };
      if (promise.version !== dto.version)
        throw new ConflictException({ code: 'REPAYMENT_PROMISE_CHANGED' });
      await tx.repaymentPromise.delete({
        where: { houseId_payerId_recipientId: key },
      });
      const targetId = promise.recipient.userId ?? house.ownerId;
      await this.notifications.create(
        tx,
        targetId,
        'HOUSE',
        `${payer.displayName.slice(0, 70)} đã hủy ngày hẹn trả tiền tại ${house.name.slice(0, 90)}.`,
        `/nha-chung/${houseId}/chi-phi`,
      );
      await this.events.signal(tx, houseId, [userId, targetId]);
      return { cancelled: true };
    });
  }
}
