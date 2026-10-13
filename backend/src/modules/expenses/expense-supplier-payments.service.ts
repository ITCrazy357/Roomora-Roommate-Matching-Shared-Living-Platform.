import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { ExpenseAccessService } from './expense-access.service.js';
import { ExpenseEventsService } from './expense-events.service.js';
import { expenseInclude, expenseView } from './expense-views.js';
import type { CreateSupplierPaymentDto } from './dto/expenses.dto.js';

@Injectable()
export class ExpenseSupplierPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly expenseAccess: ExpenseAccessService,
    private readonly events: ExpenseEventsService,
  ) {}

  async create(
    userId: string,
    houseId: string,
    expenseId: string,
    dto: CreateSupplierPaymentDto,
  ) {
    const contentHash = createHash('sha256')
      .update(
        JSON.stringify({
          userId,
          amount: dto.amount,
          method: dto.method,
          paidOn: dto.paidOn,
        }),
      )
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const previous = await this.expenseAccess.expense(
        tx,
        userId,
        houseId,
        expenseId,
      );
      // Check permissions even when this request has already committed.
      this.expenseAccess.authorized(
        userId,
        house.ownerId,
        previous,
        previous.version,
      );
      const existing = await tx.expenseSupplierPayment.findUnique({
        where: { expenseId_clientId: { expenseId, clientId: dto.clientId } },
      });
      if (existing) {
        if (existing.contentHash !== contentHash)
          throw new ConflictException({ code: 'EXPENSE_RETRY_CHANGED' });
        return expenseView(previous);
      }
      this.expenseAccess.editable(userId, house.ownerId, previous, dto.version);
      if (dto.amount > previous.amount - previous.paidAmount)
        throw new BadRequestException({
          code: 'EXPENSE_PAYMENT_EXCEEDS_REMAINING',
        });
      await tx.expenseSupplierPayment.create({
        data: {
          expenseId,
          clientId: dto.clientId,
          contentHash,
          amount: dto.amount,
          method: dto.method,
          paidOn: new Date(`${dto.paidOn}T00:00:00Z`),
        },
      });
      const updated = await tx.expense.update({
        where: { id: expenseId },
        data: {
          paidAmount: { increment: dto.amount },
          version: { increment: 1 },
        },
        include: expenseInclude,
      });
      await this.events.record(
        tx,
        userId,
        previous,
        updated,
        'SUPPLIER_PAYMENT',
        `Trả thêm ${dto.amount} VNĐ cho chủ phòng/người bán · ${dto.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'} · ${dto.paidOn}`,
      );
      await this.events.signal(tx, houseId);
      return expenseView(updated);
    });
  }
}
