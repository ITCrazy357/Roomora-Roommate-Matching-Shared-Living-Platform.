import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../communications/notifications.service.js';
import { MomoGatewayService } from './momo-gateway.service.js';
import { PayosGatewayService } from './payos-gateway.service.js';
import type { PaymentNotification } from './billing-types.js';
import { RefundRulesService } from './refund-rules.service.js';
import type { ServiceOrder } from '../../generated/prisma/client.js';
import { aiCreditPlan } from '../ai-credits/ai-credits.service.js';

@Injectable()
export class ServicePaymentsService {
  private readonly syncing = new Map<
    string,
    ReturnType<PayosGatewayService['read']>
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MomoGatewayService,
    private readonly payos: PayosGatewayService,
    private readonly notifications: NotificationsService,
    private readonly refunds: RefundRulesService,
  ) {}

  async notify(input: unknown) {
    return this.apply({
      ...this.gateway.verifyNotification(input),
      provider: 'MOMO_SANDBOX',
    });
  }

  async notifyPayos(input: unknown) {
    return this.apply(this.payos.verifyNotification(input));
  }

  async syncPayos(order: ServiceOrder) {
    const pending = this.syncing.get(order.id);
    if (pending) return pending;
    const task = this.payos.read(order).then(async (link) => {
      if (link.payment) await this.apply(link.payment);
      return link;
    });
    this.syncing.set(order.id, task);
    try {
      return await task;
    } finally {
      if (this.syncing.get(order.id) === task) this.syncing.delete(order.id);
    }
  }

  private async apply(event: PaymentNotification) {
    const initial = await this.prisma.serviceOrder.findUnique({
      where: event.orderId
        ? { id: event.orderId }
        : { providerOrderCode: event.providerOrderCode },
    });
    if (!initial) {
      // payOS verifies webhook setup with a signed sample order, and a channel
      // can send events for other apps. Acknowledge unknown signed codes only.
      if (event.provider === 'PAYOS') return;
      throw new NotFoundException();
    }
    await this.prisma.$transaction(async (tx) => {
      // Shared lock order with purchases; two orders cannot overwrite one listing's expiry.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${initial.userId}::uuid FOR UPDATE`;
      if (initial.listingId)
        await tx.$queryRaw`SELECT id FROM listings WHERE id = ${initial.listingId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM service_orders WHERE id = ${initial.id}::uuid FOR UPDATE`;
      const order = await tx.serviceOrder.findUniqueOrThrow({
        where: { id: initial.id },
      });
      if (
        order.provider !== event.provider ||
        order.amount !== event.amount ||
        (event.orderInfo !== undefined && order.planName !== event.orderInfo) ||
        (event.responseTime !== undefined &&
          event.responseTime < order.createdAt.getTime() - 5000) ||
        (order.providerLinkId !== null &&
          event.paymentLinkId !== undefined &&
          order.providerLinkId !== event.paymentLinkId)
      ) {
        throw new BadRequestException({
          code: 'PAYMENT_ORDER_MISMATCH',
          message: 'Thông báo không khớp đơn hàng',
        });
      }
      if (
        await tx.servicePaymentEvent.findUnique({
          where: { signature: event.signature },
        })
      )
        return;
      if (
        order.status === 'PAID' &&
        event.resultCode === 0 &&
        order.providerTransId !== event.transId
      ) {
        throw new ConflictException({
          code: 'PAYMENT_TRANSACTION_CHANGED',
          message: 'Đơn đã ghi nhận giao dịch khác',
        });
      }
      if (event.resultCode === 0) {
        const duplicate = await tx.serviceOrder.findUnique({
          where: {
            provider_providerTransId: {
              provider: order.provider,
              providerTransId: event.transId,
            },
          },
        });
        if (duplicate && duplicate.id !== order.id)
          throw new ConflictException({
            code: 'PAYMENT_TRANSACTION_REUSED',
            message: 'Mã giao dịch đã được sử dụng',
          });
      }
      await tx.servicePaymentEvent.create({
        data: {
          orderId: order.id,
          signature: event.signature,
          resultCode: event.resultCode,
          transId: event.transId,
        },
      });
      if (order.status === 'PAID') return; // A late failure never removes a confirmed payment.
      if (event.provider === 'PAYOS' && event.resultCode !== 0) return;
      if ([1000, 7000, 7002, 9000].includes(event.resultCode)) return; // Pending or authorized is not captured.
      if (event.resultCode !== 0) {
        if (order.status === 'FAILED' && order.resultCode === event.resultCode)
          return;
        await tx.serviceOrder.update({
          where: { id: order.id },
          data: { status: 'FAILED', resultCode: event.resultCode },
        });
        await this.notifications.create(
          tx,
          order.userId,
          'SERVICE',
          'Thanh toán dịch vụ chưa thành công',
          '/dich-vu?tab=history',
        );
        return;
      }
      const now = new Date();
      const paid = order.listingId
        ? await tx.serviceOrder.findFirst({
            where: {
              listingId: order.listingId,
              postingRound: order.postingRound,
              status: 'PAID',
            },
            select: { id: true },
          })
        : null;
      await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          resultCode: 0,
          paidAt: now,
          providerTransId: event.transId,
          ...(event.payer
            ? {
                payerBankId: event.payer.bankId,
                payerBankName: event.payer.bankName,
                payerAccount: event.payer.accountNumber,
                payerName: event.payer.accountName,
              }
            : {}),
          payUrl: null,
        },
      });
      if (order.planCode === aiCreditPlan.code) {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: order.userId },
        });
        if (user.role !== 'USER' || user.lockedAt || user.closedAt) {
          await this.refunds.create(
            tx,
            await tx.serviceOrder.findUniqueOrThrow({
              where: { id: order.id },
            }),
            'Tài khoản không còn khả dụng khi nhận thanh toán gói AI. Cần đối soát hoàn tiền.',
            'SYSTEM',
            null,
          );
        } else {
          await tx.aiCreditPack.create({
            data: {
              orderId: order.id,
              userId: order.userId,
              credits: order.creditAmount!,
            },
          });
          await this.notifications.create(
            tx,
            order.userId,
            'SERVICE',
            'Đã cộng 50 lượt AI vào tài khoản',
            '/dich-vu?tab=services',
          );
        }
        return;
      }
      if (!order.listingId)
        throw new BadRequestException({ code: 'PAYMENT_ORDER_MISMATCH' });
      const listing = await tx.listing.findUniqueOrThrow({
        where: { id: order.listingId },
        include: { owner: { select: { lockedAt: true } } },
      });
      await tx.serviceOrder.updateMany({
        where: {
          listingId: listing.id,
          postingRound: order.postingRound,
          status: 'PENDING',
        },
        data: { status: 'EXPIRED', payUrl: null },
      });
      if (
        listing.status !== 'PUBLISHED' ||
        listing.postingRound !== order.postingRound ||
        paid !== null ||
        listing.isFull ||
        listing.owner.lockedAt
      ) {
        await this.refunds.create(
          tx,
          await tx.serviceOrder.findUniqueOrThrow({ where: { id: order.id } }),
          paid
            ? 'Tin đã thanh toán trong cùng đợt đăng. Giao dịch đến muộn cần đối soát và hoàn tiền.'
            : 'Thanh toán đến sau khi tin không còn đủ điều kiện đẩy. Cần đối soát và hoàn tiền.',
          'SYSTEM',
          null,
        );
        await this.notifications.create(
          tx,
          order.userId,
          'SERVICE',
          'Đã nhận thanh toán; tin không đủ điều kiện, đã tạo yêu cầu hoàn tiền',
          '/dich-vu?tab=history',
        );
        return;
      }
      // One benefit per posting round; late duplicate payments are refunded above.
      const startsAt = now;
      const endsAt = new Date(
        startsAt.getTime() + order.durationDays * 86400000,
      );
      await tx.listingBoost.create({
        data: { orderId: order.id, listingId: listing.id, startsAt, endsAt },
      });
      await tx.listing.update({
        where: { id: listing.id },
        data: { boostUntil: endsAt },
      });
      await this.notifications.create(
        tx,
        order.userId,
        'SERVICE',
        'Đã kích hoạt ' + order.planName,
        '/dich-vu?tab=services',
      );
    });
  }
}
