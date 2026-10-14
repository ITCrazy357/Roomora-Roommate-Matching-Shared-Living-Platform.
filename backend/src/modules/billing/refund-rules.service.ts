import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  Prisma,
  ServiceOrder,
  ServiceRefundRequest,
  ServiceRefundStatus,
  ServiceRefundSource,
} from '../../generated/prisma/client.js';
import { NotificationsService } from '../communications/notifications.service.js';
import { aiCreditPlan } from '../ai-credits/ai-credits.service.js';

export const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;
const refundLabels: Record<ServiceRefundStatus, string> = {
  PENDING: 'Chờ kiểm tra',
  APPROVED: 'Đã duyệt, chưa hoàn tiền',
  REJECTED: 'Đã từ chối',
  PROCESSING: 'Đang xử lý hoàn tiền',
  COMPLETED: 'Đã hoàn tiền',
  FAILED: 'Xử lý thất bại, cần kiểm tra lại',
};
export const refundDeadline = (paidAt: Date | null) =>
  paidAt ? new Date(paidAt.getTime() + REFUND_WINDOW_MS) : null;
export function withinRefundWindow(paidAt: Date | null, now: Date) {
  return (
    paidAt !== null &&
    now >= paidAt &&
    now.getTime() - paidAt.getTime() <= REFUND_WINDOW_MS
  );
}
export const refundDetails = {
  order: true,
  actions: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      actor: {
        select: { id: true, profile: { select: { displayName: true } } },
      },
    },
  },
  proofs: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, mimeType: true, uploadedById: true },
  },
} satisfies Prisma.ServiceRefundRequestInclude;
export type Refund = Prisma.ServiceRefundRequestGetPayload<{
  include: typeof refundDetails;
}>;

@Injectable()
export class RefundRulesService {
  constructor(private readonly notifications: NotificationsService) {}

  async lock(tx: Prisma.TransactionClient, id: string) {
    const initial = await tx.serviceRefundRequest.findUnique({
      where: { id },
      include: { order: true },
    });
    if (!initial) throw new NotFoundException();
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${initial.order.userId}::uuid FOR UPDATE`;
    if (initial.order.listingId)
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${initial.order.listingId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM service_orders WHERE id = ${initial.orderId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM service_refund_requests WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.serviceRefundRequest.findUniqueOrThrow({
      where: { id },
      include: refundDetails,
    });
  }

  async admin(tx: Prisma.TransactionClient, actorId: string) {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: { role: true, lockedAt: true },
    });
    if (!actor || actor.role !== 'ADMIN' || actor.lockedAt)
      throw new ForbiddenException({ code: 'ADMIN_REQUIRED' });
  }

  requirePaid(order: ServiceOrder) {
    if (order.refundedAt)
      throw new ConflictException({ code: 'REFUND_ALREADY_COMPLETED' });
    if (order.status !== 'PAID' || !order.paidAt || !order.providerTransId)
      throw new BadRequestException({ code: 'REFUND_PAYMENT_REQUIRED' });
  }

  requireVersion(refund: ServiceRefundRequest, version: number) {
    if (refund.version !== version)
      throw new ConflictException({ code: 'REFUND_CHANGED' });
  }

  requireStatus(
    refund: ServiceRefundRequest,
    ...statuses: ServiceRefundStatus[]
  ) {
    if (!statuses.includes(refund.status))
      throw new ConflictException({ code: 'REFUND_STATE_INVALID' });
  }

  async create(
    tx: Prisma.TransactionClient,
    order: ServiceOrder,
    reason: string,
    source: ServiceRefundSource,
    actorId: string | null,
  ) {
    this.requirePaid(order);
    const pack =
      order.planCode === aiCreditPlan.code
        ? await tx.aiCreditPack.findUnique({
            where: { orderId: order.id },
          })
        : null;
    if (pack?.used)
      throw new ConflictException({
        code: 'AI_PACK_USED',
        message: 'Gói AI đã sử dụng, không thể yêu cầu hoàn toàn bộ gói.',
      });
    if (pack)
      await tx.aiCreditPack.update({
        where: { orderId: order.id },
        data: { held: true },
      });
    const hasOriginalRecipient =
      order.provider === 'PAYOS' &&
      order.payerBankId &&
      /^[a-zA-Z0-9_-]{2,50}$/.test(order.payerBankId) &&
      order.payerAccount &&
      /^\d{4,50}$/.test(order.payerAccount) &&
      order.payerBankName &&
      order.payerName;
    const refund = await tx.serviceRefundRequest.create({
      data: {
        orderId: order.id,
        amount: order.amount,
        method: order.provider === 'MOMO_SANDBOX' ? 'MOMO' : 'MANUAL_BANK',
        reason,
        source,
        ...(hasOriginalRecipient
          ? {
              bankId: order.payerBankId,
              bankName: order.payerBankName,
              accountNumber: order.payerAccount,
              accountName: order.payerName,
            }
          : {}),
      },
    });
    await this.audit(tx, refund, actorId, 'REQUESTED', null, reason);
    return refund;
  }

  async audit(
    tx: Prisma.TransactionClient,
    refund: ServiceRefundRequest,
    actorId: string | null,
    action: string,
    fromStatus: ServiceRefundStatus | null,
    note: string,
    details: Prisma.InputJsonObject = {},
  ) {
    try {
      await tx.serviceRefundAction.create({
        data: {
          refundId: refund.id,
          actorId,
          action,
          fromStatus,
          toStatus: refund.status,
          note,
          details: {
            version: refund.version,
            amount: refund.amount,
            method: refund.method,
            ...details,
          },
        },
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'REFUND_AUDIT_UNAVAILABLE',
        message:
          'Không ghi được lịch sử an toàn; chưa xác nhận hoàn tiền. Cần đối soát trước khi thử lại.',
      });
    }
  }

  async change(
    tx: Prisma.TransactionClient,
    refund: Refund,
    actorId: string,
    action: string,
    note: string,
    data: Prisma.ServiceRefundRequestUpdateInput,
    details: Prisma.InputJsonObject = {},
  ) {
    const updated = await tx.serviceRefundRequest.update({
      where: { id: refund.id },
      data: { ...data, version: { increment: 1 } },
    });
    if (
      updated.status === 'REJECTED' &&
      refund.order.planCode === aiCreditPlan.code
    )
      await tx.aiCreditPack.updateMany({
        where: { orderId: refund.orderId, revokedAt: null },
        data: { held: false },
      });
    await this.audit(
      tx,
      updated,
      actorId,
      action,
      refund.status,
      note,
      details,
    );
    await this.notifications.create(
      tx,
      refund.order.userId,
      'SERVICE',
      'Yêu cầu hoàn tiền đã cập nhật: ' + refundLabels[updated.status],
      '/dich-vu?tab=history',
    );
    return updated;
  }

  async complete(
    tx: Prisma.TransactionClient,
    refund: Refund,
    actorId: string,
    reference: string,
    transferredAt: Date,
    note: string,
    proofId?: string,
  ) {
    this.requireStatus(refund, 'PROCESSING');
    this.requirePaid(refund.order);
    if (refund.amount !== refund.order.amount)
      throw new ConflictException({ code: 'REFUND_AMOUNT_MISMATCH' });
    const used = await tx.serviceRefundRequest.findUnique({
      where: {
        method_refundReference: {
          method: refund.method,
          refundReference: reference,
        },
      },
    });
    if (used && used.id !== refund.id)
      throw new ConflictException({ code: 'REFUND_REFERENCE_REUSED' });
    const now = new Date();
    let updated: ServiceRefundRequest;
    try {
      updated = await this.change(
        tx,
        refund,
        actorId,
        'COMPLETED',
        note,
        {
          status: 'COMPLETED',
          completedAt: now,
          transferredAt,
          refundReference: reference,
          lastError: null,
          gatewayLeaseAt: null,
        },
        { reference, ...(proofId ? { proofId } : {}) },
      );
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ConflictException({ code: 'REFUND_REFERENCE_REUSED' });
      throw error;
    }
    await tx.serviceOrder.update({
      where: { id: refund.orderId },
      data: { refundedAt: now },
    });
    // A corrective refund without a boost must not remove another order's benefit.
    const boost = await tx.listingBoost.findUnique({
      where: { orderId: refund.orderId },
      select: { id: true },
    });
    if (boost && refund.order.listingId)
      await tx.listing.updateMany({
        where: {
          id: refund.order.listingId,
          postingRound: refund.order.postingRound,
        },
        data: { boostUntil: null },
      });
    if (refund.order.planCode === aiCreditPlan.code)
      await tx.aiCreditPack.updateMany({
        where: { orderId: refund.orderId },
        data: { revokedAt: now, held: false },
      });
    return updated;
  }
}
