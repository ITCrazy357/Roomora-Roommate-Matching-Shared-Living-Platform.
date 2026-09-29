import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Prisma, Conversation } from '../../generated/prisma/client.js';
import { NotificationsService } from './notifications.service.js';
import { UpdatesService } from './updates.service.js';
import type {
  PageQuery,
  MessageQuery,
  SendMessageDto,
  AppointmentDto,
  AppointmentQuery,
  ChangeAppointmentDto,
  TypingDto,
} from './communications.dto.js';

const participant = (userId: string): Prisma.ConnectionWhereInput => ({
  status: 'ACCEPTED',
  OR: [{ senderId: userId }, { receiverId: userId }],
  sender: {
    blockedUsers: { none: { targetId: userId } },
    blockedBy: { none: { blockerId: userId } },
  },
  receiver: {
    blockedUsers: { none: { targetId: userId } },
    blockedBy: { none: { blockerId: userId } },
  },
});
const personSelect = {
  profile: { select: { displayName: true, avatarUrl: true } },
} as const;
const connectionInclude = {
  sender: { select: personSelect },
  receiver: { select: personSelect },
} as const;
type ConversationRow = Prisma.ConversationGetPayload<{
  include: { connection: { include: typeof connectionInclude } };
}>;
const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  clientId: true,
  number: true,
  text: true,
  createdAt: true,
  attachments: {
    select: {
      id: true,
      kind: true,
      mimeType: true,
      byteSize: true,
      width: true,
      height: true,
    },
    orderBy: { position: 'asc' },
  },
} as const;
type MessageFiles = {
  images?: Express.Multer.File[];
  audio?: Express.Multer.File[];
};

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly updates: UpdatesService,
  ) {}

  async typing(userId: string, id: string, dto: TypingDto) {
    return this.withConversation(userId, id, async (tx, row) => {
      await this.updates.typing(tx, this.otherUser(row, userId), id, dto.typing);
      return { typing: dto.typing };
    });
  }

  async list(userId: string, query: PageQuery) {
    const where = { connection: participant(userId) };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: {
          connection: { include: connectionInclude },
          messages: { orderBy: { number: 'desc' }, take: 1, select: messageSelect },
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
      JOIN messages m ON m.conversation_id = c.id AND m.sender_id <> ${userId}::uuid
        AND m.number > CASE WHEN r.sender_id = ${userId}::uuid THEN c.sender_read ELSE c.receiver_read END
      WHERE r.status = 'ACCEPTED' AND (r.sender_id = ${userId}::uuid OR r.receiver_id = ${userId}::uuid)
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = r.sender_id AND b.target_id = r.receiver_id) OR (b.blocker_id = r.receiver_id AND b.target_id = r.sender_id))
      GROUP BY c.id`;
    const counts = new Map(unread.map((row) => [row.id, row.count]));
    return {
      items: rows.map((row) => ({
        ...this.view(row, userId),
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
      include: { connection: { include: connectionInclude } },
    });
    if (!row) this.unavailable();
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
      ...this.view(row, userId),
      appointments: appointments.map((item) => ({
        ...item,
        upcoming: item.startsAt.getTime() > Date.now(),
      })),
      listings: listings.map((listing) => ({
        ...listing,
        latitude: listing.latitude === null ? null : Math.round(listing.latitude * 100) / 100,
        longitude: listing.longitude === null ? null : Math.round(listing.longitude * 100) / 100,
      })),
    };
  }
  async messages(userId: string, id: string, query: MessageQuery) {
    await this.access(this.prisma, userId, id);
    if (query.before !== undefined && query.after !== undefined)
      throw new BadRequestException();
    const ascending = query.after !== undefined;
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        number: { lt: query.before, gt: query.after },
      },
      orderBy: { number: ascending ? 'asc' : 'desc' },
      take: 41,
      select: messageSelect,
    });
    const hasMore = rows.length > 40;
    const items = rows.slice(0, 40);
    if (!ascending) items.reverse();
    return { items, hasMore };
  }
  async send(userId: string, id: string, dto: SendMessageDto, files: MessageFiles = {}) {
    const images = files?.images ?? [];
    const audio = files?.audio ?? [];
    if (!dto.text && !images.length && !audio.length)
      throw new BadRequestException({ code: 'MESSAGE_EMPTY' });
    if (images.length > 4 || audio.length > 1)
      throw new BadRequestException({ code: 'MESSAGE_MEDIA_LIMIT' });
    if (images.length || audio.length) await this.access(this.prisma, userId, id);
    const hash = createHash('sha256').update(JSON.stringify({ text: dto.text, images: images.length, audio: audio.length }));
    const attachments: Array<{
      kind: 'IMAGE' | 'AUDIO';
      mimeType: string;
      byteSize: number;
      width?: number;
      height?: number;
      data: Uint8Array<ArrayBuffer>;
    }> = [];
    for (const file of images) {
      hash.update(String(file.buffer.length)).update(':').update(file.buffer);
      attachments.push(await this.prepareImage(file));
    }
    for (const file of audio) {
      hash.update(String(file.buffer.length)).update(':').update(file.buffer);
      attachments.push(this.prepareAudio(file));
    }
    if (attachments.reduce((total, file) => total + file.byteSize, 0) > 5 * 1024 * 1024)
      throw new BadRequestException({ code: 'MESSAGE_MEDIA_SIZE' });
    const contentHash = hash.digest('hex');
    return this.withConversation(userId, id, async (tx, row) => {
      const existing = await tx.message.findUnique({
        where: {
          conversationId_senderId_clientId: {
            conversationId: id,
            senderId: userId,
            clientId: dto.clientId,
          },
        },
        select: { id: true, text: true, contentHash: true },
      });
      if (existing) {
        if (
          existing.contentHash !== contentHash &&
          !(existing.contentHash === '' && existing.text === dto.text && !attachments.length)
        )
          throw new ConflictException({ code: 'MESSAGE_CHANGED' });
        return tx.message.findUniqueOrThrow({ where: { id: existing.id }, select: messageSelect });
      }
      const count = await tx.message.count({
        where: {
          senderId: userId,
          createdAt: { gt: new Date(Date.now() - 60000) },
        },
      });
      if (count >= 30) throw new HttpException({ code: 'RATE_LIMITED' }, 429);
      const updated = await tx.conversation.update({
        where: { id },
        data: { lastNumber: { increment: 1 } },
      });
      const message = await tx.message.create({
        data: {
          conversationId: id,
          senderId: userId,
          number: updated.lastNumber,
          clientId: dto.clientId,
          text: dto.text,
          contentHash,
          attachments: {
            create: attachments.map((file, position) => ({ ...file, position })),
          },
        },
        select: messageSelect,
      });
      await this.notifications.create(
        tx,
        this.otherUser(row, userId),
        'MESSAGE',
        'Bạn có tin nhắn mới',
        `/tin-nhan/${id}`,
      );
      await this.notifications.signal(tx, [userId]);
      return message;
    });
  }
  async attachment(userId: string, id: string, attachmentId: string) {
    await this.access(this.prisma, userId, id);
    const file = await this.prisma.messageAttachment.findFirst({
      where: { id: attachmentId, message: { conversationId: id } },
      select: { data: true, mimeType: true },
    });
    if (!file) this.unavailable();
    return file;
  }
  private async prepareImage(file: Express.Multer.File) {
    if (!file.buffer?.length || file.size > 5 * 1024 * 1024)
      throw new BadRequestException({ code: 'MESSAGE_IMAGE_SIZE' });
    try {
      const source = sharp(file.buffer, { limitInputPixels: 25_000_000, failOn: 'warning' });
      const metadata = await source.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1)
        throw new Error('Invalid image');
      const data = await source.rotate().resize(1600, 1200, {
        fit: 'inside', withoutEnlargement: true,
      }).jpeg({ quality: 82 }).toBuffer();
      if (data.length > 2 * 1024 * 1024) throw new Error('Image too large');
      const size = await sharp(data).metadata();
      return {
        kind: 'IMAGE' as const,
        mimeType: 'image/jpeg',
        byteSize: data.length,
        width: size.width,
        height: size.height,
        data: Uint8Array.from(data),
      };
    } catch {
      throw new BadRequestException({ code: 'MESSAGE_IMAGE_INVALID' });
    }
  }
  private prepareAudio(file: Express.Multer.File) {
    if (!file.buffer?.length || file.size > 2 * 1024 * 1024)
      throw new BadRequestException({ code: 'MESSAGE_AUDIO_SIZE' });
    const mimeType = file.mimetype.split(';')[0].toLowerCase();
    const webm = mimeType === 'audio/webm' && file.buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    const mp4 = mimeType === 'audio/mp4' && file.buffer.subarray(4, 8).toString() === 'ftyp';
    const ogg = mimeType === 'audio/ogg' && file.buffer.subarray(0, 4).toString() === 'OggS';
    if (!webm && !mp4 && !ogg)
      throw new BadRequestException({ code: 'MESSAGE_AUDIO_INVALID' });
    return { kind: 'AUDIO' as const, mimeType, byteSize: file.size, data: Uint8Array.from(file.buffer) };
  }
  async read(userId: string, id: string, number: number) {
    return this.withConversation(userId, id, async (tx, row) => {
      if (number > row.lastNumber) throw new BadRequestException();
      const field =
        row.connection.senderId === userId ? 'senderRead' : 'receiverRead';
      const result = await tx.conversation.updateMany({
        where: { id, [field]: { lt: number } },
        data: { [field]: number, updatedAt: row.updatedAt },
      });
      if (result.count) await this.notifications.signal(tx, [userId]);
      return { read: true };
    });
  }
  async propose(userId: string, id: string, dto: AppointmentDto) {
    const startsAt = this.futureDate(dto.startsAt);
    return this.withConversation(userId, id, async (tx, row) => {
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
        this.otherUser(row, userId),
        dto.listingId ? 'Có đề xuất lịch xem phòng mới' : 'Có đề xuất lịch gặp mới',
      );
      return item;
    });
  }
  async change(
    userId: string,
    id: string,
    appointmentId: string,
    dto: ChangeAppointmentDto,
  ) {
    return this.withConversation(userId, id, async (tx, row) => {
      const item = await tx.appointment.findFirst({
        where: { id: appointmentId, conversationId: id },
      });
      if (!item) this.unavailable();
      if (item.version !== dto.version || item.status === 'CANCELLED')
        throw new ConflictException({ code: 'APPOINTMENT_CHANGED' });
      let data: Prisma.AppointmentUpdateInput;
      let title: string;
      if (dto.action === 'cancel') {
        data = { status: 'CANCELLED' };
        title = item.listingId ? 'Lịch xem phòng đã được hủy' : 'Lịch gặp đã được hủy';
      } else {
        if (item.listingId) await this.availableListing(tx, item.listingId, row);
        if (dto.action === 'confirm') {
          if (item.status !== 'PENDING' || item.proposerId === userId)
            throw new ConflictException({ code: 'APPOINTMENT_CHANGED' });
          this.futureDate(item.startsAt.toISOString());
          data = { status: 'CONFIRMED' };
          title = item.listingId ? 'Lịch xem phòng đã được xác nhận' : 'Lịch gặp đã được xác nhận';
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
          title = item.listingId ? 'Có đề xuất đổi lịch xem phòng' : 'Có đề xuất đổi lịch gặp';
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
        this.otherUser(row, userId),
        title,
      );
      return updated;
    });
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
            include: { connection: { include: connectionInclude } },
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
        person: this.view(conversation, userId).person,
      })),
      total,
      page: query.page,
      pages: Math.ceil(total / query.limit),
    };
  }
  private async access(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const row = await tx.conversation.findFirst({
      where: { id, connection: participant(userId) },
      include: { connection: true },
    });
    if (!row) this.unavailable();
    return row;
  }
  private async withConversation<T>(
    userId: string,
    id: string,
    work: (
      tx: Prisma.TransactionClient,
      row: Conversation & {
        connection: { senderId: string; receiverId: string };
      },
    ) => Promise<T>,
  ) {
    const existing = await this.access(this.prisma, userId, id);
    return this.prisma.$transaction(async (tx) => {
      // Same lock order as connection/block operations. Recheck permission after locking.
      await tx.$queryRaw`SELECT id FROM users WHERE id IN (${existing.connection.senderId}::uuid, ${existing.connection.receiverId}::uuid) ORDER BY id FOR UPDATE`;
      const row = await this.access(tx, userId, id);
      return work(tx, row);
    });
  }
  private view(row: ConversationRow, userId: string) {
    const profile = (
      row.connection.senderId === userId
        ? row.connection.receiver
        : row.connection.sender
    ).profile;
    return {
      id: row.id,
      connectionId: row.connectionId,
      lastNumber: row.lastNumber,
      readNumber:
        row.connection.senderId === userId ? row.senderRead : row.receiverRead,
      person: {
        userId: this.otherUser(row, userId),
        displayName: profile?.displayName ?? 'Thành viên Roomora',
        avatarUrl: profile?.avatarUrl ?? null,
      },
    };
  }
  private otherUser(
    row: { connection: { senderId: string; receiverId: string } },
    userId: string,
  ) {
    return row.connection.senderId === userId
      ? row.connection.receiverId
      : row.connection.senderId;
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
  private unavailable(): never {
    throw new NotFoundException({ code: 'CONVERSATION_UNAVAILABLE' });
  }
}
