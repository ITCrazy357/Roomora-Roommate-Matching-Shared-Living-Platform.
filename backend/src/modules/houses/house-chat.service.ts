import { Injectable } from '@nestjs/common';
import { type MessageFiles } from '../communications/message-media.js';
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
import { HouseChatMessagesService } from './house-chat-messages.service.js';
import { HouseChatPollsService } from './house-chat-polls.service.js';

@Injectable()
export class HouseChatService {
  constructor(
    private readonly messages: HouseChatMessagesService,
    private readonly polls: HouseChatPollsService,
  ) {}

  list(userId: string, houseId: string, query: MessageQuery) {
    return this.messages.list(userId, houseId, query);
  }

  send(
    userId: string,
    houseId: string,
    dto: SendMessageDto,
    files: MessageFiles = {},
  ) {
    return this.messages.send(userId, houseId, dto, files);
  }

  change(
    userId: string,
    houseId: string,
    id: string,
    dto: MessageVersionDto | EditMessageDto,
    remove: boolean,
  ) {
    return this.messages.change(userId, houseId, id, dto, remove);
  }

  attachment(userId: string, houseId: string, attachmentId: string) {
    return this.messages.attachment(userId, houseId, attachmentId);
  }

  createPoll(userId: string, houseId: string, dto: CreateHousePollDto) {
    return this.polls.createPoll(userId, houseId, dto);
  }

  vote(userId: string, houseId: string, id: string, dto: VoteHousePollDto) {
    return this.polls.vote(userId, houseId, id, dto);
  }

  closePoll(userId: string, houseId: string, id: string) {
    return this.polls.closePoll(userId, houseId, id);
  }
}
