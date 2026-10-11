import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { PageQuery } from './dto/communications.dto.js';
import {
  participant,
  connectionInclude,
  messageSelect,
} from './conversation-views.js';
import { ConversationAccessService } from './conversation-access.service.js';

@Injectable()
export class ConversationQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationAccess: ConversationAccessService,
  ) {}

  async list(userId: string, query: PageQuery) {
    const where = { connection: participant(userId) };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: {
          connection: { include: connectionInclude() },
          messages: {
            orderBy: { number: 'desc' },
            take: 1,
            select: messageSelect,
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    // Unread counts in one aggregate query, including conversations outside this page.
    const unread = await this.prisma.$queryRaw<{ id: string; count: number }[]>`
      SELECT c.id, COUNT(m.id)::int AS count FROM conversations c
      JOIN connections r ON r.id = c.connection_id
      JOIN messages m ON m.conversation_id = c.id AND m.sender_id <> ${userId}::uuid AND m.deleted_at IS NULL
        AND m.number > CASE WHEN r.sender_id = ${userId}::uuid THEN c.sender_read ELSE c.receiver_read END
      WHERE r.status = 'ACCEPTED' AND (r.sender_id = ${userId}::uuid OR r.receiver_id = ${userId}::uuid)
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = r.sender_id AND b.target_id = r.receiver_id) OR (b.blocker_id = r.receiver_id AND b.target_id = r.sender_id))
      GROUP BY c.id`;
    const counts = new Map(unread.map((row) => [row.id, row.count]));
    return {
      items: rows.map((row) => ({
        ...this.conversationAccess.view(row, userId),
        lastMessage: row.messages[0] ?? null,
        unread: counts.get(row.id) ?? 0,
      })),
      total,
      unread: unread.reduce((sum, row) => sum + row.count, 0),
      page: query.page,
      pages: Math.ceil(total / query.limit),
    };
  }

  async detail(userId: string, id: string) {
    const row = await this.prisma.conversation.findFirst({
      where: { id, connection: participant(userId) },
      include: { connection: { include: connectionInclude() } },
    });
    if (!row) this.conversationAccess.unavailable();
    const [appointments, listings] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { conversationId: id },
        include: {
          listing: { select: { id: true, title: true, status: true } },
          changes: { orderBy: { version: 'asc' } },
        },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        take: 30,
      }),
      this.prisma.listing.findMany({
        where: {
          ownerId: { in: [row.connection.senderId, row.connection.receiverId] },
          status: 'PUBLISHED',
          type: { not: 'ROOM_WANTED' },
        },
        select: {
          id: true,
          ownerId: true,
          title: true,
          rent: true,
          provinceName: true,
          wardName: true,
          latitude: true,
          longitude: true,
          photos: {
            orderBy: { position: 'asc' },
            take: 1,
            select: { url: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      ...this.conversationAccess.view(row, userId),
      appointments: appointments.map((item) => ({
        ...item,
        upcoming: item.startsAt.getTime() > Date.now(),
      })),
      listings: listings.map((listing) => ({
        ...listing,
        latitude:
          listing.latitude === null
            ? null
            : Math.round(listing.latitude * 100) / 100,
        longitude:
          listing.longitude === null
            ? null
            : Math.round(listing.longitude * 100) / 100,
      })),
    };
  }
}
