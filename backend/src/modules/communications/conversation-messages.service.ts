import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { prepareMessageMedia, type MessageFiles } from './message-media.js';
import { NotificationsService } from './notifications.service.js';
import { UpdatesService } from './updates.service.js';
import type {
  MessageQuery,
  SendMessageDto,
  EditMessageDto,
  MessageVersionDto,
  TypingDto,
} from './dto/communications.dto.js';
import { messageSelect } from './conversation-views.js';
import { ConversationAccessService } from './conversation-access.service.js';

@Injectable()
export class ConversationMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly updates: UpdatesService,
    private readonly conversationAccess: ConversationAccessService,
  ) {}

  async typing(userId: string, id: string, dto: TypingDto) {
    return this.conversationAccess.withConversation(
      userId,
      id,
      async (tx, row) => {
        await this.updates.typing(
          tx,
          this.conversationAccess.otherUser(row, userId),
          id,
          dto.typing,
        );
        return { typing: dto.typing };
      },
    );
  }

  async messages(userId: string, id: string, query: MessageQuery) {
    await this.conversationAccess.access(this.prisma, userId, id);
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

  async send(
    userId: string,
    id: string,
    dto: SendMessageDto,
    files: MessageFiles = {},
  ) {
    const images = files?.images ?? [];
    const audio = files?.audio ?? [];
    const documents = files?.files ?? [];
    if (!dto.text && !images.length && !audio.length && !documents.length)
      throw new BadRequestException({ code: 'MESSAGE_EMPTY' });
    if (images.length > 4 || audio.length > 1 || documents.length > 4)
      throw new BadRequestException({ code: 'MESSAGE_MEDIA_LIMIT' });
    if (images.length || audio.length || documents.length)
      await this.conversationAccess.access(this.prisma, userId, id);
    const { contentHash, attachments } = await prepareMessageMedia(
      dto.text,
      files,
    );
    return this.conversationAccess.withConversation(
      userId,
      id,
      async (tx, row) => {
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
            !(
              existing.contentHash === '' &&
              existing.text === dto.text &&
              !attachments.length
            )
          )
            throw new ConflictException({ code: 'MESSAGE_CHANGED' });
          return tx.message.findUniqueOrThrow({
            where: { id: existing.id },
            select: messageSelect,
          });
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
              create: attachments.map((file, position) => ({
                ...file,
                position,
              })),
            },
          },
          select: messageSelect,
        });
        await this.notifications.create(
          tx,
          this.conversationAccess.otherUser(row, userId),
          'MESSAGE',
          'Bạn có tin nhắn mới',
          `/tin-nhan/${id}`,
        );
        await this.notifications.signal(tx, [userId]);
        return message;
      },
    );
  }

  async editMessage(
    userId: string,
    id: string,
    messageId: string,
    dto: EditMessageDto,
  ) {
    return this.conversationAccess.withConversation(
      userId,
      id,
      async (tx, row) => {
        const message = await tx.message.findFirst({
          where: { id: messageId, conversationId: id, senderId: userId },
          select: { ...messageSelect, contentHash: true },
        });
        if (!message) this.conversationAccess.unavailable();
        if (message.deletedAt || message.version !== dto.version)
          throw new ConflictException({ code: 'MESSAGE_UPDATED' });
        if (!dto.text && !message.attachments.length)
          throw new BadRequestException({ code: 'MESSAGE_EMPTY' });
        if (message.text === dto.text) {
          const { contentHash: _contentHash, ...view } = message;
          return view;
        }
        const updated = await tx.message.update({
          where: { id: messageId },
          // Keep the original hash so retries of the original send stay idempotent.
          data: {
            text: dto.text,
            contentHash:
              message.contentHash || this.originalTextHash(message.text),
            editedAt: new Date(),
            version: { increment: 1 },
          },
          select: messageSelect,
        });
        await this.notifications.signal(tx, [
          userId,
          this.conversationAccess.otherUser(row, userId),
        ]);
        return updated;
      },
    );
  }

  async deleteMessage(
    userId: string,
    id: string,
    messageId: string,
    dto: MessageVersionDto,
  ) {
    return this.conversationAccess.withConversation(
      userId,
      id,
      async (tx, row) => {
        const message = await tx.message.findFirst({
          where: { id: messageId, conversationId: id, senderId: userId },
          select: { ...messageSelect, contentHash: true },
        });
        if (!message) this.conversationAccess.unavailable();
        if (message.deletedAt) {
          const { contentHash: _contentHash, ...view } = message;
          return view;
        }
        if (message.version !== dto.version)
          throw new ConflictException({ code: 'MESSAGE_UPDATED' });
        await tx.messageAttachment.deleteMany({ where: { messageId } });
        const deleted = await tx.message.update({
          where: { id: messageId },
          // Preserve the sequence and client ID; a retried send cannot restore deleted media.
          data: {
            text: '',
            contentHash:
              message.contentHash || this.originalTextHash(message.text),
            deletedAt: new Date(),
            version: { increment: 1 },
          },
          select: messageSelect,
        });
        await this.notifications.signal(tx, [
          userId,
          this.conversationAccess.otherUser(row, userId),
        ]);
        return deleted;
      },
    );
  }

  private originalTextHash(text: string) {
    // Messages sent before media support did not have a content hash.
    return createHash('sha256')
      .update(JSON.stringify({ text, images: 0, audio: 0 }))
      .digest('hex');
  }

  async attachment(userId: string, id: string, attachmentId: string) {
    await this.conversationAccess.access(this.prisma, userId, id);
    const file = await this.prisma.messageAttachment.findFirst({
      where: {
        id: attachmentId,
        message: { conversationId: id, deletedAt: null },
      },
      select: { data: true, mimeType: true, kind: true, fileName: true },
    });
    if (!file) this.conversationAccess.unavailable();
    return file;
  }

  async read(userId: string, id: string, number: number) {
    return this.conversationAccess.withConversation(
      userId,
      id,
      async (tx, row) => {
        if (number > row.lastNumber) throw new BadRequestException();
        const field =
          row.connection.senderId === userId ? 'senderRead' : 'receiverRead';
        const result = await tx.conversation.updateMany({
          where: { id, [field]: { lt: number } },
          data: { [field]: number, updatedAt: row.updatedAt },
        });
        if (result.count) await this.notifications.signal(tx, [userId]);
        return { read: true };
      },
    );
  }
}
