import { Injectable } from '@nestjs/common';
import { type MessageFiles } from './message-media.js';
import type {
  PageQuery,
  MessageQuery,
  SendMessageDto,
  EditMessageDto,
  MessageVersionDto,
  AppointmentDto,
  AppointmentQuery,
  ChangeAppointmentDto,
  TypingDto,
} from './dto/communications.dto.js';
import { ConversationMessagesService } from './conversation-messages.service.js';
import { ConversationQueriesService } from './conversation-queries.service.js';
import { ConversationAppointmentsService } from './conversation-appointments.service.js';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly messageService: ConversationMessagesService,
    private readonly queries: ConversationQueriesService,
    private readonly appointmentService: ConversationAppointmentsService,
  ) {}

  typing(userId: string, id: string, dto: TypingDto) {
    return this.messageService.typing(userId, id, dto);
  }

  list(userId: string, query: PageQuery) {
    return this.queries.list(userId, query);
  }

  detail(userId: string, id: string) {
    return this.queries.detail(userId, id);
  }

  messages(userId: string, id: string, query: MessageQuery) {
    return this.messageService.messages(userId, id, query);
  }

  send(
    userId: string,
    id: string,
    dto: SendMessageDto,
    files: MessageFiles = {},
  ) {
    return this.messageService.send(userId, id, dto, files);
  }

  editMessage(
    userId: string,
    id: string,
    messageId: string,
    dto: EditMessageDto,
  ) {
    return this.messageService.editMessage(userId, id, messageId, dto);
  }

  deleteMessage(
    userId: string,
    id: string,
    messageId: string,
    dto: MessageVersionDto,
  ) {
    return this.messageService.deleteMessage(userId, id, messageId, dto);
  }

  attachment(userId: string, id: string, attachmentId: string) {
    return this.messageService.attachment(userId, id, attachmentId);
  }

  read(userId: string, id: string, number: number) {
    return this.messageService.read(userId, id, number);
  }

  propose(userId: string, id: string, dto: AppointmentDto) {
    return this.appointmentService.propose(userId, id, dto);
  }

  change(
    userId: string,
    id: string,
    appointmentId: string,
    dto: ChangeAppointmentDto,
  ) {
    return this.appointmentService.change(userId, id, appointmentId, dto);
  }

  appointments(userId: string, query: AppointmentQuery) {
    return this.appointmentService.appointments(userId, query);
  }
}
