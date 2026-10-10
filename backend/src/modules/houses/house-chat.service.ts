import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { HouseAccessService } from './house-access.service.js';
import { NotificationsService } from '../communications/notifications.service.js';
import {
  prepareMessageMedia,
  type MessageFiles,
} from '../communications/message-media.js';
import type {
  MessageQuery,
  SendMessageDto,
  EditMessageDto,
  MessageVersionDto,
} from '../communications/dto/communications.dto.js';
import type {
  CreateHousePollDto,
  VoteHousePollDto,
} from './dto/house-poll.dto.js';
const select = {
  id: true,
  houseId: true,
  senderId: true,
  clientId: true,
  number: true,
  text: true,
  version: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  attachments: {
    select: {
      id: true,
      kind: true,
      mimeType: true,
      byteSize: true,
      fileName: true,
      width: true,
      height: true,
    },
    orderBy: { position: 'asc' },
  },
  sender: {
    select: { profile: { select: { displayName: true, avatarUrl: true } } },
  },
  poll: {
    select: {
      question: true,
      closedAt: true,
      options: {
        select: { id: true, text: true },
        orderBy: { position: 'asc' },
      },
      votes: { select: { userId: true, optionId: true } },
    },
  },
} as const;
type Row = Prisma.HouseMessageGetPayload<{ select: typeof select }>;

@Injectable()
export class HouseChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly notifications: NotificationsService,
  ) {}
  private view(
    row: Row & { contentHash?: string },
    ownerId: string,
    userId: string,
  ) {
    const { sender, poll, contentHash: _hash, ...message } = row;
    return {
      ...message,
      poll:
        poll && !row.deletedAt
          ? {
              question: poll.question,
              closedAt: poll.closedAt,
              totalVotes: poll.votes.length,
              myOptionId:
                poll.votes.find((vote) => vote.userId === userId)?.optionId ??
                null,
              options: poll.options.map((option) => ({
                ...option,
                votes: poll.votes.filter((vote) => vote.optionId === option.id)
                  .length,
              })),
            }
          : null,
      sender: {
        displayName: sender.profile?.displayName ?? 'Thành viên Roomora',
        avatarUrl: sender.profile?.avatarUrl ?? null,
        role: row.senderId === ownerId ? 'OWNER' : 'MEMBER',
      },
    };
  }
  private async signal(tx: Prisma.TransactionClient, houseId: string) {
    const members = await tx.houseMember.findMany({
      where: { houseId, leftAt: null },
      select: { userId: true },
    });
    await this.notifications.signal(
      tx,
      members.map((member) => member.userId),
    );
  }
  async list(userId: string, houseId: string, query: MessageQuery) {
    const house = await this.access.active(this.prisma, userId, houseId);
    if (query.before !== undefined && query.after !== undefined)
      throw new BadRequestException();
    const ascending = query.after !== undefined;
    const rows = await this.prisma.houseMessage.findMany({
      where: { houseId, number: { lt: query.before, gt: query.after } },
      orderBy: { number: ascending ? 'asc' : 'desc' },
      take: 41,
      select,
    });
    const items = rows.slice(0, 40);
    if (!ascending) items.reverse();
    return {
      items: items.map((row) => this.view(row, house.ownerId, userId)),
      hasMore: rows.length > 40,
    };
  }
  async send(
    userId: string,
    houseId: string,
    dto: SendMessageDto,
    files: MessageFiles = {},
  ) {
    await this.access.active(this.prisma, userId, houseId);
    const { contentHash, attachments } = await prepareMessageMedia(
      dto.text,
      files,
    );
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const existing = await tx.houseMessage.findUnique({
        where: {
          houseId_senderId_clientId: {
            houseId,
            senderId: userId,
            clientId: dto.clientId,
          },
        },
        select: { ...select, contentHash: true },
      });
      if (existing) {
        const legacyTextRetry =
          !attachments.length &&
          existing.contentHash ===
            createHash('sha256').update(dto.text).digest('hex');
        if (existing.contentHash !== contentHash && !legacyTextRetry)
          throw new ConflictException({ code: 'MESSAGE_CHANGED' });
        return this.view(existing, house.ownerId, userId);
      }
      await this.checkSendLimit(tx, userId);
      const updated = await tx.house.update({
        where: { id: houseId },
        data: { lastMessageNumber: { increment: 1 } },
      });
      const row = await tx.houseMessage.create({
        data: {
          houseId,
          senderId: userId,
          clientId: dto.clientId,
          text: dto.text,
          number: updated.lastMessageNumber,
          contentHash,
          attachments: {
            create: attachments.map((file, position) => ({
              ...file,
              position,
            })),
          },
        },
        select,
      });
      await this.signal(tx, houseId);
      return this.view(row, house.ownerId, userId);
    });
  }
  async change(
    userId: string,
    houseId: string,
    id: string,
    dto: MessageVersionDto | EditMessageDto,
    remove: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const row = await tx.houseMessage.findFirst({
        where: { id, houseId, senderId: userId },
        select,
      });
      if (!row) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND' });
      if (remove && row.deletedAt) return this.view(row, house.ownerId, userId);
      if (row.deletedAt || row.version !== dto.version)
        throw new ConflictException({ code: 'MESSAGE_UPDATED' });
      const text = remove ? '' : (dto as EditMessageDto).text;
      if (!remove && row.poll)
        throw new BadRequestException({ code: 'POLL_IMMUTABLE' });
      if (!remove && !text && !row.attachments.length)
        throw new BadRequestException({ code: 'MESSAGE_EMPTY' });
      if (remove) {
        await tx.houseMessageAttachment.deleteMany({
          where: { messageId: id },
        });
        await tx.housePoll.deleteMany({ where: { messageId: id } });
      }
      const updated = await tx.houseMessage.update({
        where: { id },
        data: {
          text,
          version: { increment: 1 },
          ...(remove ? { deletedAt: new Date() } : { editedAt: new Date() }),
        },
        select,
      });
      await this.signal(tx, houseId);
      return this.view(updated, house.ownerId, userId);
    });
  }

  async attachment(userId: string, houseId: string, attachmentId: string) {
    await this.access.active(this.prisma, userId, houseId);
    const file = await this.prisma.houseMessageAttachment.findFirst({
      where: { id: attachmentId, message: { houseId, deletedAt: null } },
      select: { data: true, mimeType: true, kind: true, fileName: true },
    });
    if (!file) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND' });
    return file;
  }

  private async checkSendLimit(tx: Prisma.TransactionClient, userId: string) {
    if (
      (await tx.houseMessage.count({
        where: {
          senderId: userId,
          createdAt: { gt: new Date(Date.now() - 60000) },
        },
      })) >= 30
    )
      throw new HttpException({ code: 'RATE_LIMITED' }, 429);
  }

  async createPoll(userId: string, houseId: string, dto: CreateHousePollDto) {
    if (
      new Set(dto.options.map((text) => text.toLocaleLowerCase('vi-VN')))
        .size !== dto.options.length
    )
      throw new BadRequestException({ code: 'POLL_DUPLICATE_OPTIONS' });
    const contentHash = createHash('sha256')
      .update(
        JSON.stringify({
          poll: { question: dto.question, options: dto.options },
        }),
      )
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const existing = await tx.houseMessage.findUnique({
        where: {
          houseId_senderId_clientId: {
            houseId,
            senderId: userId,
            clientId: dto.clientId,
          },
        },
        select: { ...select, contentHash: true },
      });
      if (existing) {
        if (existing.contentHash !== contentHash)
          throw new ConflictException({ code: 'MESSAGE_CHANGED' });
        return this.view(existing, house.ownerId, userId);
      }
      await this.checkSendLimit(tx, userId);
      const updated = await tx.house.update({
        where: { id: houseId },
        data: { lastMessageNumber: { increment: 1 } },
      });
      const row = await tx.houseMessage.create({
        data: {
          houseId,
          senderId: userId,
          clientId: dto.clientId,
          number: updated.lastMessageNumber,
          text: '',
          contentHash,
          poll: {
            create: {
              question: dto.question,
              options: {
                create: dto.options.map((text, position) => ({
                  text,
                  position,
                })),
              },
            },
          },
        },
        select,
      });
      await this.signal(tx, houseId);
      return this.view(row, house.ownerId, userId);
    });
  }

  async vote(
    userId: string,
    houseId: string,
    id: string,
    dto: VoteHousePollDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const row = await tx.houseMessage.findFirst({
        where: { id, houseId, deletedAt: null },
        select,
      });
      if (!row?.poll) throw new NotFoundException({ code: 'POLL_NOT_FOUND' });
      if (row.poll.closedAt)
        throw new ConflictException({ code: 'POLL_CLOSED' });
      if (
        dto.optionId &&
        !row.poll.options.some((option) => option.id === dto.optionId)
      )
        throw new BadRequestException({ code: 'POLL_OPTION_INVALID' });
      const previous =
        row.poll.votes.find((vote) => vote.userId === userId)?.optionId ?? null;
      if (previous === (dto.optionId ?? null))
        return this.view(row, house.ownerId, userId);
      if (dto.optionId)
        await tx.housePollVote.upsert({
          where: { pollId_userId: { pollId: id, userId } },
          create: { pollId: id, userId, optionId: dto.optionId },
          update: { optionId: dto.optionId },
        });
      else await tx.housePollVote.deleteMany({ where: { pollId: id, userId } });
      const updated = await tx.houseMessage.update({
        where: { id },
        data: { version: { increment: 1 } },
        select,
      });
      await this.signal(tx, houseId);
      return this.view(updated, house.ownerId, userId);
    });
  }

  async closePoll(userId: string, houseId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const row = await tx.houseMessage.findFirst({
        where: { id, houseId, deletedAt: null },
        select,
      });
      if (!row?.poll) throw new NotFoundException({ code: 'POLL_NOT_FOUND' });
      if (row.senderId !== userId)
        throw new ForbiddenException({ code: 'POLL_CREATOR_ONLY' });
      if (row.poll.closedAt) return this.view(row, house.ownerId, userId);
      const updated = await tx.houseMessage.update({
        where: { id },
        data: {
          version: { increment: 1 },
          poll: { update: { closedAt: new Date() } },
        },
        select,
      });
      await this.signal(tx, houseId);
      return this.view(updated, house.ownerId, userId);
    });
  }
}
