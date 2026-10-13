import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { adminPage } from './admin-views.js';
import type { AdminOrdersQuery } from './dto/admin.dto.js';

// Payment URLs, signatures and bank details are unnecessary for order lookup.
const orderSelect = {
  id: true,
  userId: true,
  listingId: true,
  listingTitle: true,
  buyerName: true,
  buyerEmail: true,
  planName: true,
  amount: true,
  status: true,
  provider: true,
  providerOrderCode: true,
  providerTransId: true,
  createdAt: true,
  paidAt: true,
  refundedAt: true,
  refund: {
    select: { id: true, status: true, amount: true, completedAt: true },
  },
} satisfies Prisma.ServiceOrderSelect;

@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: AdminOrdersQuery) {
    const text = query.search;
    const uuid =
      text &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        text,
      );
    const where: Prisma.ServiceOrderWhereInput = {
      status: query.status,
      OR: text
        ? [
            ...(uuid ? [{ id: text }] : []),
            { buyerName: { contains: text, mode: 'insensitive' } },
            { buyerEmail: { contains: text, mode: 'insensitive' } },
            { providerOrderCode: { contains: text } },
            { providerTransId: { contains: text } },
            { listingTitle: { contains: text, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.serviceOrder.findMany({
          where,
          select: orderSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.serviceOrder.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return adminPage(items, total, query);
  }
  async detail(id: string) {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id },
      select: {
        ...orderSelect,
        events: {
          select: {
            id: true,
            resultCode: true,
            transId: true,
            receivedAt: true,
          },
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
          take: 50,
        },
        boost: { select: { startsAt: true, endsAt: true } },
      },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    return order;
  }
}
