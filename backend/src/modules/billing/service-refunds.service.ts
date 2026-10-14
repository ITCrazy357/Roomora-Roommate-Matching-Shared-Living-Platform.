import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../communications/notifications.service.js';
import {
  refundDetails,
  RefundRulesService,
  withinRefundWindow,
} from './refund-rules.service.js';
import type { RefundRecipientDto } from './dto/refund.dto.js';
import { createHash } from 'node:crypto';
import { findRefundBank, refundBankId } from './refund-banks.js';

@Injectable()
export class ServiceRefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RefundRulesService,
    private readonly notifications: NotificationsService,
  ) {}

  async request(userId: string, orderId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const initial = await tx.serviceOrder.findFirst({
        where: { id: orderId, userId },
        select: { listingId: true },
      });
      if (!initial) throw new NotFoundException();
      if (initial.listingId)
        await tx.$queryRaw`SELECT id FROM listings WHERE id = ${initial.listingId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM service_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.serviceOrder.findFirst({
        where: { id: orderId, userId },
        include: { refund: true },
      });
      if (!order) throw new NotFoundException();
      this.rules.requirePaid(order);
      if (order.refund) {
        this.rules.requireStatus(order.refund, 'PENDING');
        return order.refund;
      }
      if (!withinRefundWindow(order.paidAt, new Date()))
        throw new ConflictException({
          code: 'REFUND_WINDOW_EXPIRED',
          message: 'Chỉ gửi yêu cầu trong 24 giờ kể từ thanh toán thành công',
        });
      const refund = await this.rules.create(tx, order, reason, 'USER', userId);
      await this.notifications.create(
        tx,
        userId,
        'SERVICE',
        'Đã tiếp nhận yêu cầu hoàn tiền để kiểm tra',
        '/dich-vu?tab=history',
      );
      return refund;
    });
  }

  async get(userId: string, orderId: string) {
    const refund = await this.prisma.serviceRefundRequest.findFirst({
      where: { orderId, order: { userId } },
      include: refundDetails,
    });
    if (!refund) throw new NotFoundException();
    return refund;
  }

  async recipient(userId: string, orderId: string, dto: RefundRecipientDto) {
    const initial = await this.get(userId, orderId);
    const bank = findRefundBank(dto.bankId);
    if (!bank) throw new BadRequestException({ code: 'REFUND_BANK_INVALID' });
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.rules.lock(tx, initial.id);
      if (refund.order.userId !== userId) throw new ForbiddenException();
      this.rules.requireVersion(refund, dto.version);
      this.rules.requireStatus(refund, 'APPROVED');
      this.rules.requirePaid(refund.order);
      if (refund.method !== 'MANUAL_BANK')
        throw new ConflictException({ code: 'REFUND_ORIGINAL_METHOD' });
      if (
        refund.order.payerAccount &&
        (refund.order.payerAccount !== dto.accountNumber ||
          (refund.order.payerBankId &&
            refundBankId(refund.order.payerBankId) !== bank.bin)) &&
        dto.differentAccountReason.trim().length < 10
      )
        throw new ConflictException({
          code: 'REFUND_DIFFERENT_ACCOUNT_REASON',
        });
      await this.rules.change(
        tx,
        refund,
        userId,
        'RECIPIENT_UPDATED',
        'Người dùng cập nhật tài khoản nhận tiền',
        {
          bankId: bank.bin,
          bankName: bank.name,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          differentAccountReason: dto.differentAccountReason || null,
          verifiedAt: null,
          verifiedById: null,
          verificationNote: null,
          verificationReference: null,
        },
        {
          bankId: bank.bin,
          bankName: bank.name,
          accountName: dto.accountName,
          accountLast4: dto.accountNumber.slice(-4),
          previousAccountLast4: refund.accountNumber?.slice(-4) ?? null,
          accountFingerprint: createHash('sha256')
            .update(bank.bin + ':' + dto.accountNumber)
            .digest('hex'),
          previousAccountFingerprint: refund.accountNumber
            ? createHash('sha256')
                .update(
                  (refundBankId(refund.bankId) ?? '') +
                    ':' +
                    refund.accountNumber,
                )
                .digest('hex')
            : null,
        },
      );
    });
    return this.get(userId, orderId);
  }
}
