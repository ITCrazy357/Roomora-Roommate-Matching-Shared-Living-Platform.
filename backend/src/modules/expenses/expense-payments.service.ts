import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { ExpenseEventsService } from './expense-events.service.js';
import type {
  CreateDebtPaymentDto,
  ExpenseQueryDto,
  PaymentActionDto,
} from './dto/expenses.dto.js';
import { paymentInclude, paymentView } from './expense-views.js';
import { ExpenseBalancesService } from './expense-balances.service.js';

@Injectable()
export class ExpensePaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly events: ExpenseEventsService,
    private readonly balances: ExpenseBalancesService,
  ) {}

  async create(userId: string, houseId: string, dto: CreateDebtPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.finance(tx, userId, houseId);
      const payerId = dto.payerId ?? userId;
      const body = {
        payerId,
        recipientId: dto.recipientId,
        amount: dto.amount,
        method: dto.method,
        note: dto.note,
      };
      const contentHash = createHash('sha256')
        .update(JSON.stringify(body))
        .digest('hex');
      const existing = await tx.debtPayment.findUnique({
        where: {
          houseId_payerId_clientId: {
            houseId,
            payerId,
            clientId: dto.clientId,
          },
        },
        include: paymentInclude,
      });
      if (existing) {
        if (
          existing.createdById !== userId ||
          existing.contentHash !== contentHash
        )
          throw new ConflictException({ code: 'PAYMENT_RETRY_CHANGED' });
        return paymentView(existing);
      }
      const balances = await this.balances.calculate(tx, houseId);
      const payer = balances.find((row) => row.id === payerId),
        recipient = balances.find((row) => row.id === dto.recipientId);
      if (!payer || !recipient || payerId === dto.recipientId)
        throw new BadRequestException({ code: 'PAYMENT_INVALID' });
      if (
        payer.userId !== userId &&
        !(payer.isGuest && house.ownerId === userId)
      )
        throw new ForbiddenException({ code: 'PAYMENT_FORBIDDEN' });
      if (
        dto.amount >
        Math.min(
          -payer.balance - payer.pendingSent,
          recipient.balance - recipient.pendingReceived,
        )
      )
        throw new ConflictException({ code: 'PAYMENT_AMOUNT_EXCEEDED' });
      const row = await tx.debtPayment.create({
        data: {
          ...body,
          houseId,
          clientId: dto.clientId,
          contentHash,
          createdById: userId,
        },
        include: paymentInclude,
      });
      await this.events.signal(tx, houseId, [
        userId,
        ...(recipient.userId ? [recipient.userId] : []),
      ]);
      return paymentView(row);
    });
  }

  async list(userId: string, houseId: string, query: ExpenseQueryDto) {
    const house = await this.access.finance(this.prisma, userId, houseId);
    const where: Prisma.DebtPaymentWhereInput = {
      houseId,
      ...(!house.active
        ? {
            OR: [
              { payer: { userId } },
              { recipient: { userId } },
              ...(house.ownerId === userId
                ? [{ payer: { userId: null } }, { recipient: { userId: null } }]
                : []),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.debtPayment.findMany({
        where,
        include: paymentInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.debtPayment.count({ where }),
    ]);
    return {
      items: items.map((row) => paymentView(row)),
      total,
      page: query.page,
      pages: Math.ceil(total / query.limit),
    };
  }

  async change(
    userId: string,
    houseId: string,
    id: string,
    dto: PaymentActionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.finance(tx, userId, houseId);
      const row = await tx.debtPayment.findFirst({
        where: { id, houseId },
        include: paymentInclude,
      });
      if (!row) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND' });
      const receiver =
        row.recipient.userId === userId ||
        (!row.recipient.userId && house.ownerId === userId);
      const payer =
        row.payer.userId === userId ||
        (!row.payer.userId && house.ownerId === userId);
      if (dto.action === 'cancel' ? !payer : !receiver)
        throw new ForbiddenException({ code: 'PAYMENT_FORBIDDEN' });
      const status =
        dto.action === 'confirm'
          ? 'CONFIRMED'
          : dto.action === 'reject'
            ? 'REJECTED'
            : 'CANCELLED';
      if (row.status === status) return paymentView(row);
      if (row.status !== 'PENDING' || row.version !== dto.version)
        throw new ConflictException({ code: 'PAYMENT_CHANGED' });
      if (status === 'CONFIRMED') {
        const balances = await this.balances.calculate(tx, houseId);
        const payerBalance = balances.find(
          (person) => person.id === row.payerId,
        )!;
        const recipientBalance = balances.find(
          (person) => person.id === row.recipientId,
        )!;
        if (
          row.amount >
          Math.min(
            -payerBalance.balance - payerBalance.pendingSent + row.amount,
            recipientBalance.balance -
              recipientBalance.pendingReceived +
              row.amount,
          )
        )
          throw new ConflictException({ code: 'PAYMENT_AMOUNT_EXCEEDED' });
      }
      const updated = await tx.debtPayment.update({
        where: { id },
        data: {
          status,
          version: { increment: 1 },
          ...(status === 'CONFIRMED'
            ? { confirmedAt: new Date(), confirmedById: userId }
            : {}),
        },
        include: paymentInclude,
      });
      await this.events.signal(tx, houseId, [
        userId,
        ...[row.payer.userId, row.recipient.userId].filter(
          (id): id is string => !!id,
        ),
      ]);
      return paymentView(updated);
    });
  }
}
