import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from './notifications.service.js';
import type {
  AppointmentDto,
  AppointmentQuery,
  ChangeAppointmentDto,
} from './dto/communications.dto.js';
import { participant, connectionInclude } from './conversation-views.js';
import { ConversationAccessService } from './conversation-access.service.js';

@Injectable()
export class ConversationAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly conversationAccess: ConversationAccessService,
  ) {}

  async propose(userId: string, id: string, dto: AppointmentDto) {
    const startsAt = this.futureDate(dto.startsAt);
    return this.conversationAccess.withConversation(
      userId,
      id,
      async (tx, row) => {
        if (dto.listingId) await this.availableListing(tx, dto.listingId, row);
        const count = await tx.appointment.count({
          where: {
            conversationId: id,
            createdAt: { gt: new Date(Date.now() - 24 * 3600000) },
          },
        });
        if (count >= 10) throw new HttpException({ code: 'RATE_LIMITED' }, 429);
        const item = await tx.appointment.create({
          data: {
            listingId: dto.listingId ?? null,
            place: dto.place,
            note: dto.note,
            startsAt,
            conversationId: id,
            proposerId: userId,
          },
        });
        await this.appointmentEvent(
          tx,
          item,
          userId,
          this.conversationAccess.otherUser(row, userId),
          dto.listingId
            ? 'Có đề xuất lịch xem phòng mới'
            : 'Có đề xuất lịch gặp mới',
        );
        return item;
      },
    );
  }

  async change(
    userId: string,
    id: string,
    appointmentId: string,
    dto: ChangeAppointmentDto,
  ) {
    return this.conversationAccess.withConversation(
      userId,
      id,
      async (tx, row) => {
        const item = await tx.appointment.findFirst({
          where: { id: appointmentId, conversationId: id },
        });
        if (!item) this.conversationAccess.unavailable();
        if (item.version !== dto.version || item.status === 'CANCELLED')
          throw new ConflictException({ code: 'APPOINTMENT_CHANGED' });
        let data: Prisma.AppointmentUpdateInput;
        let title: string;
        if (dto.action === 'cancel') {
          data = { status: 'CANCELLED' };
          title = item.listingId
            ? 'Lịch xem phòng đã được hủy'
            : 'Lịch gặp đã được hủy';
        } else {
          if (item.listingId)
            await this.availableListing(tx, item.listingId, row);
          if (dto.action === 'confirm') {
            if (item.status !== 'PENDING' || item.proposerId === userId)
              throw new ConflictException({ code: 'APPOINTMENT_CHANGED' });
            this.futureDate(item.startsAt.toISOString());
            data = { status: 'CONFIRMED' };
            title = item.listingId
              ? 'Lịch xem phòng đã được xác nhận'
              : 'Lịch gặp đã được xác nhận';
          } else {
            if (!dto.startsAt || !dto.place) throw new BadRequestException();
            if (item.startsAt < new Date())
              throw new ConflictException({ code: 'APPOINTMENT_CHANGED' });
            data = {
              startsAt: this.futureDate(dto.startsAt),
              place: dto.place,
              note: dto.note ?? '',
              proposerId: userId,
              status: 'PENDING',
            };
            title = item.listingId
              ? 'Có đề xuất đổi lịch xem phòng'
              : 'Có đề xuất đổi lịch gặp';
          }
        }
        const updated = await tx.appointment.update({
          where: { id: item.id },
          data: { ...data, version: { increment: 1 } },
        });
        await this.appointmentEvent(
          tx,
          updated,
          userId,
          this.conversationAccess.otherUser(row, userId),
          title,
        );
        return updated;
      },
    );
  }

  async appointments(userId: string, query: AppointmentQuery) {
    const where: Prisma.AppointmentWhereInput = {
      conversation: { connection: participant(userId) },
    };
    const now = new Date();
    if (query.tab === 'upcoming') {
      where.status = 'CONFIRMED';
      where.startsAt = { gt: now };
    }
    if (query.tab === 'pending') {
      where.status = 'PENDING';
      where.startsAt = { gt: now };
    }
    if (query.tab === 'past')
      where.OR = [{ status: 'CANCELLED' }, { startsAt: { lte: now } }];
    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: {
          listing: { select: { id: true, title: true, status: true } },
          conversation: {
            include: { connection: { include: connectionInclude() } },
          },
          changes: { orderBy: { version: 'asc' } },
        },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return {
      items: items.map(({ conversation, ...item }) => ({
        ...item,
        upcoming: item.startsAt.getTime() > now.getTime(),
        person: this.conversationAccess.view(conversation, userId).person,
      })),
      total,
      page: query.page,
      pages: Math.ceil(total / query.limit),
    };
  }

  private futureDate(value: string) {
    // Require an explicit timezone to avoid interpreting local input on the server.
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(value))
      throw new BadRequestException({ code: 'APPOINTMENT_TIME' });
    const date = new Date(value);
    if (
      !Number.isFinite(date.getTime()) ||
      date.getTime() <= Date.now() ||
      date.getTime() > Date.now() + 180 * 24 * 3600000
    )
      throw new BadRequestException({ code: 'APPOINTMENT_TIME' });
    return date;
  }

  private async availableListing(
    tx: Prisma.TransactionClient,
    id: string,
    row: { connection: { senderId: string; receiverId: string } },
  ) {
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${id}::uuid FOR SHARE`;
    const listing = await tx.listing.findFirst({
      where: {
        id,
        status: 'PUBLISHED',
        type: { not: 'ROOM_WANTED' },
        hasRoom: true,
        ownerId: { in: [row.connection.senderId, row.connection.receiverId] },
      },
      select: { id: true },
    });
    if (!listing)
      throw new BadRequestException({ code: 'APPOINTMENT_LISTING' });
  }

  private async appointmentEvent(
    tx: Prisma.TransactionClient,
    item: {
      id: string;
      version: number;
      status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
      startsAt: Date;
      place: string;
      note: string;
      conversationId: string;
    },
    userId: string,
    targetId: string,
    title: string,
  ) {
    const { id, version, status, startsAt, place, note } = item;
    await tx.appointmentChange.create({
      data: {
        appointmentId: id,
        actorId: userId,
        version,
        status,
        startsAt,
        place,
        note,
      },
    });
    await this.notifications.create(
      tx,
      targetId,
      'APPOINTMENT',
      title,
      `/tin-nhan/${item.conversationId}`,
      true,
    );
    await this.notifications.signal(tx, [userId]);
  }
}
