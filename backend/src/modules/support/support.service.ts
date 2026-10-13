import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { adminPage, adminUserSelect } from '../admin/admin-views.js';
import type {
  CreateTicketDto,
  HandleTicketDto,
  ReplyTicketDto,
  SupportQuery,
} from './dto/support.dto.js';

const ticketInclude = {
  user: { select: adminUserSelect },
  order: { select: { id: true, status: true, amount: true, planName: true } },
} satisfies Prisma.SupportTicketInclude;

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string | undefined, query: SupportQuery) {
    const where: Prisma.SupportTicketWhereInput = {
      userId,
      status: query.status,
      subject: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.supportTicket.findMany({
          where,
          include: ticketInclude,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.supportTicket.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return adminPage(items, total, query);
  }

  async detail(userId: string | undefined, id: string) {
    // Owner filtering precedes returning messages; knowing an ID grants no access.
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, userId },
      include: {
        ...ticketInclude,
        messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!ticket) throw new NotFoundException({ code: 'TICKET_NOT_FOUND' });
    return ticket;
  }

  async create(userId: string, dto: CreateTicketDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.lockedAt)
        throw new BadRequestException({ code: 'ACCOUNT_LOCKED' });
      if (
        dto.orderId &&
        !(await tx.serviceOrder.count({ where: { id: dto.orderId, userId } }))
      )
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
      const count = await tx.supportTicket.count({
        where: {
          userId,
          createdAt: { gt: new Date(Date.now() - 86400000) },
        },
      });
      if (count >= 5) throw new HttpException({ code: 'RATE_LIMITED' }, 429);
      return tx.supportTicket.create({
        data: {
          userId,
          subject: dto.subject,
          orderId: dto.orderId,
          messages: { create: { authorId: userId, body: dto.body } },
        },
        include: ticketInclude,
      });
    });
  }

  async reply(
    actorId: string,
    id: string,
    dto: ReplyTicketDto | HandleTicketDto,
    admin: boolean,
    close = false,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorId}::uuid FOR UPDATE`;
      const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
      if (actor.lockedAt || (admin && actor.role !== 'ADMIN'))
        throw new BadRequestException({ code: 'ACCOUNT_LOCKED' });
      const ticket = await tx.supportTicket.findFirst({
        where: { id, userId: admin ? undefined : actorId },
      });
      if (!ticket) throw new NotFoundException({ code: 'TICKET_NOT_FOUND' });
      let status = ticket.status;
      if (admin) status = (dto as HandleTicketDto).status;
      else if (close) status = 'CLOSED';
      else if (ticket.status === 'RESOLVED') status = 'OPEN';
      else if (ticket.status === 'WAITING_USER') status = 'IN_PROGRESS';
      const changed = await tx.supportTicket.updateMany({
        where: { id, version: dto.version, status: { not: 'CLOSED' } },
        data: { status, version: { increment: 1 } },
      });
      if (!changed.count)
        throw new ConflictException({ code: 'ADMIN_VERSION_CONFLICT' });
      await tx.supportMessage.create({
        data: {
          ticketId: id,
          authorId: actorId,
          fromAdmin: admin,
          body: dto.body,
        },
      });
      if (admin)
        await tx.adminAction.create({
          data: {
            actorId,
            entityId: id,
            action: `SUPPORT_${status}`,
            reason: dto.body.slice(0, 1000),
            snapshot: {
              fromStatus: ticket.status,
              status,
              version: dto.version + 1,
            },
          },
        });
      await tx.$executeRaw`SELECT pg_notify('roomora_updates', ${JSON.stringify([ticket.userId])})`;
      return { id, status, version: dto.version + 1 };
    });
  }
}
