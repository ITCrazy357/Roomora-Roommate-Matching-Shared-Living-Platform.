import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from './house-access.service.js';
import type {
  CreateHousePollDto,
  VoteHousePollDto,
} from './dto/house-poll.dto.js';
import { select } from './house-chat-views.js';
import { HouseChatMessagesService } from './house-chat-messages.service.js';

@Injectable()
export class HouseChatPollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly messages: HouseChatMessagesService,
  ) {}

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
        return this.messages.view(existing, house.ownerId, userId);
      }
      await this.messages.checkSendLimit(tx, userId);
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
      await this.messages.signal(tx, houseId);
      return this.messages.view(row, house.ownerId, userId);
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
        return this.messages.view(row, house.ownerId, userId);
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
      await this.messages.signal(tx, houseId);
      return this.messages.view(updated, house.ownerId, userId);
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
      if (row.poll.closedAt)
        return this.messages.view(row, house.ownerId, userId);
      const updated = await tx.houseMessage.update({
        where: { id },
        data: {
          version: { increment: 1 },
          poll: { update: { closedAt: new Date() } },
        },
        select,
      });
      await this.messages.signal(tx, houseId);
      return this.messages.view(updated, house.ownerId, userId);
    });
  }
}
