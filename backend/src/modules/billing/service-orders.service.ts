import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma, ServiceOrder } from '../../generated/prisma/client.js';
import { randomInt } from 'node:crypto';
import { PaymentGatewayService } from './payment-gateway.service.js';
import { boostPlan, orderDetails } from './billing-types.js';
import type {
  CreateServiceOrderDto,
  ServiceOrderQueryDto,
} from './dto/billing.dto.js';

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayService,
  ) {}

  catalog() {
    return {
      plan: boostPlan,
      provider: this.gateway.provider(),
      sandbox: this.gateway.provider() === 'MOMO_SANDBOX',
      paymentAvailable: this.gateway.available(),
      providers: {
        MOMO_SANDBOX: this.gateway.available('MOMO_SANDBOX'),
        PAYOS: this.gateway.available('PAYOS'),
      },
    };
  }

  async eligibleListings(userId: string) {
    const listings = await this.prisma.listing.findMany({
      where: { ownerId: userId, status: 'PUBLISHED', isFull: false },
      select: {
        id: true,
        title: true,
        type: true,
        boostUntil: true,
        postingRound: true,
        serviceOrders: {
          where: { status: 'PAID' },
          select: { postingRound: true },
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return listings.map(({ serviceOrders, ...listing }) => ({
      ...listing,
      paymentCompleted: serviceOrders.some(
        (order) => order.postingRound === listing.postingRound,
      ),
    }));
  }

  async create(userId: string, input: CreateServiceOrderDto) {
    if (!this.gateway.available()) {
      // The gateway raises the same public configuration error before any write.
      throw new ServiceUnavailableException({
        code: 'PAYMENT_NOT_CONFIGURED',
        message: 'Chưa cấu hình cổng thanh toán',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${input.listingId}::uuid FOR UPDATE`;
      const previous = await tx.serviceOrder.findUnique({
        where: { userId_clientId: { userId, clientId: input.clientId } },
        include: orderDetails,
      });
      if (previous) {
        if (previous.listingId !== input.listingId)
          throw new ConflictException({
            code: 'ORDER_REQUEST_CHANGED',
            message: 'Mã yêu cầu đã dùng cho tin khác',
          });
        if (previous.status === 'PENDING')
          await this.requirePayable(tx, previous);
        return previous;
      }
      const listing = await tx.listing.findFirst({
        where: { id: input.listingId, ownerId: userId },
        include: { owner: { include: { profile: true } } },
      });
      if (!listing) throw new NotFoundException();
      if (
        listing.status !== 'PUBLISHED' ||
        listing.isFull ||
        listing.owner.lockedAt
      )
        throw new BadRequestException({
          code: 'LISTING_NOT_BOOSTABLE',
          message: 'Chỉ đẩy tin đang công khai và còn nhận người',
        });
      const now = new Date();
      await this.requireUnpaid(tx, listing.id, listing.postingRound);
      await tx.serviceOrder.updateMany({
        where: { userId, status: 'PENDING', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });
      const pending = await tx.serviceOrder.findFirst({
        where: {
          userId,
          listingId: listing.id,
          postingRound: listing.postingRound,
          status: 'PENDING',
        },
        include: orderDetails,
      });
      if (pending) return pending;
      return tx.serviceOrder.create({
        data: {
          userId,
          listingId: listing.id,
          postingRound: listing.postingRound,
          clientId: input.clientId,
          provider: this.gateway.provider(),
          providerOrderCode:
            this.gateway.provider() === 'PAYOS'
              ? String(randomInt(1_000_000_000_000, 9_999_999_999_999))
              : null,
          planCode: boostPlan.code,
          planName: boostPlan.name,
          amount: boostPlan.amount,
          durationDays: boostPlan.durationDays,
          buyerName: listing.owner.profile?.displayName ?? 'Thành viên Roomora',
          buyerEmail: listing.owner.email,
          listingTitle: listing.title,
          expiresAt: new Date(now.getTime() + 15 * 60000),
        },
        include: orderDetails,
      });
    });
  }

  async get(userId: string, id: string) {
    await this.prisma.serviceOrder.updateMany({
      where: { id, userId, status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, userId },
      include: orderDetails,
    });
    if (!order) throw new NotFoundException();
    return order;
  }

  async list(userId: string, query: ServiceOrderQueryDto) {
    await this.prisma.serviceOrder.updateMany({
      where: { userId, status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
    const where = {
      userId,
      ...(query.kind === 'boosts' ? { boost: { isNot: null } } : {}),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.serviceOrder.findMany({
          where,
          include: orderDetails,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.serviceOrder.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items,
      total,
      page: query.page,
      pages: Math.ceil(total / query.limit),
    };
  }

  async checkout(userId: string, id: string) {
    const initial = await this.get(userId, id);
    const lease = new Date();
    const order = await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, initial);
      const current = await tx.serviceOrder.findUniqueOrThrow({
        where: { id },
      });
      await this.requirePayable(tx, current);
      if (current.payUrl) return current;
      const claimed = await tx.serviceOrder.updateMany({
        where: {
          id,
          OR: [
            { checkoutLeaseAt: null },
            { checkoutLeaseAt: { lt: new Date(lease.getTime() - 45000) } },
          ],
        },
        data: { checkoutLeaseAt: lease },
      });
      if (!claimed.count)
        throw new ConflictException({
          code: 'CHECKOUT_IN_PROGRESS',
          message: 'Đang tạo liên kết thanh toán',
        });
      return current;
    });
    if (order.payUrl) return { payUrl: order.payUrl };
    try {
      const { payUrl, providerLinkId } = await this.gateway.create(order);
      const saved = await this.prisma.$transaction(async (tx) => {
        await this.lockOrder(tx, order);
        const current = await tx.serviceOrder.findUniqueOrThrow({
          where: { id },
        });
        await this.requirePayable(tx, current);
        return tx.serviceOrder.updateMany({
          where: {
            id,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
            checkoutLeaseAt: lease,
          },
          data: { payUrl, providerLinkId, checkoutLeaseAt: null },
        });
      });
      if (!saved.count)
        throw new ConflictException({
          code: 'ORDER_NOT_PENDING',
          message: 'Đơn đã đổi trạng thái',
        });
      return { payUrl };
    } finally {
      await this.prisma.serviceOrder.updateMany({
        where: { id, checkoutLeaseAt: lease },
        data: { checkoutLeaseAt: null },
      });
    }
  }

  private async lockOrder(tx: Prisma.TransactionClient, order: ServiceOrder) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${order.userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${order.listingId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM service_orders WHERE id = ${order.id}::uuid FOR UPDATE`;
  }

  private async requireUnpaid(
    tx: Prisma.TransactionClient,
    listingId: string,
    postingRound: number,
  ) {
    const paid = await tx.serviceOrder.findFirst({
      where: { listingId, postingRound, status: 'PAID' },
      select: { id: true },
    });
    if (paid)
      throw new ConflictException({
        code: 'LISTING_ALREADY_PAID',
        message: 'Tin đã thanh toán trong đợt đăng này',
      });
  }

  private async requirePayable(
    tx: Prisma.TransactionClient,
    order: ServiceOrder,
  ) {
    if (order.status !== 'PENDING' || order.expiresAt <= new Date())
      throw new ConflictException({
        code: 'ORDER_NOT_PENDING',
        message: 'Đơn không còn chờ thanh toán',
      });
    const listing = await tx.listing.findUniqueOrThrow({
      where: { id: order.listingId },
      include: { owner: { select: { lockedAt: true } } },
    });
    if (
      listing.status !== 'PUBLISHED' ||
      listing.isFull ||
      listing.owner.lockedAt ||
      listing.postingRound !== order.postingRound
    )
      throw new BadRequestException({
        code: 'LISTING_NOT_BOOSTABLE',
        message: 'Tin không còn đủ điều kiện đẩy',
      });
    await this.requireUnpaid(tx, listing.id, listing.postingRound);
  }
}
