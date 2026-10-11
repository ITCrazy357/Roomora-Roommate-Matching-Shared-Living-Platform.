import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Res,
  UseFilters,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard, AdminAccountAccess } from '../auth/auth.guard.js';
import { ConversationsService } from './conversations.service.js';
import { NotificationsService } from './notifications.service.js';
import { UpdatesService } from './updates.service.js';
import { PresenceService } from './presence.service.js';
import { sendMessageAttachment, type MessageFiles } from './message-media.js';
import { MessageUploadFilter } from './message-upload.filter.js';
import {
  AppointmentDto,
  AppointmentQuery,
  ChangeAppointmentDto,
  EditMessageDto,
  MessageVersionDto,
  MessageQuery,
  NotificationQuery,
  PageQuery,
  ReadMessagesDto,
  SendMessageDto,
  TypingDto,
  PresenceHeartbeatDto,
} from './dto/communications.dto.js';

@Controller()
@UseGuards(AuthGuard)
export class CommunicationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly notifications: NotificationsService,
    private readonly updates: UpdatesService,
    private readonly presence: PresenceService,
  ) {}
  @Sse('updates')
  @AdminAccountAccess()
  stream(@Req() req: AuthenticatedRequest) {
    return this.updates.stream(req.auth);
  }
  @Post('presence/heartbeat')
  heartbeat(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PresenceHeartbeatDto,
  ) {
    return this.presence.heartbeat(req.auth, dto.idleSeconds);
  }
  @Get('conversations') list(
    @Req() req: AuthenticatedRequest,
    @Query() query: PageQuery,
  ) {
    return this.conversations.list(req.auth.userId, query);
  }
  @Get('conversations/:id') detail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.detail(req.auth.userId, id);
  }
  @Get('conversations/:id/messages') messages(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MessageQuery,
  ) {
    return this.conversations.messages(req.auth.userId, id, query);
  }
  @Post('conversations/:id/messages')
  @UseFilters(MessageUploadFilter)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'images', maxCount: 4 },
        { name: 'audio', maxCount: 1 },
        { name: 'files', maxCount: 4 },
      ],
      { limits: { fileSize: 5 * 1024 * 1024, files: 9, fields: 2 } },
    ),
  )
  send(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @UploadedFiles()
    files?: MessageFiles,
  ) {
    return this.conversations.send(req.auth.userId, id, dto, files);
  }
  @Patch('conversations/:id/messages/:messageId') editMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.conversations.editMessage(req.auth.userId, id, messageId, dto);
  }
  @Delete('conversations/:id/messages/:messageId') deleteMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: MessageVersionDto,
  ) {
    return this.conversations.deleteMessage(
      req.auth.userId,
      id,
      messageId,
      dto,
    );
  }
  @Get('conversations/:id/attachments/:attachmentId') async attachment(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() response: Response,
  ) {
    const file = await this.conversations.attachment(
      req.auth.userId,
      id,
      attachmentId,
    );
    sendMessageAttachment(response, file);
  }
  @Post('conversations/:id/read') read(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReadMessagesDto,
  ) {
    return this.conversations.read(req.auth.userId, id, dto.number);
  }
  @Post('conversations/:id/typing') typing(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TypingDto,
  ) {
    return this.conversations.typing(req.auth.userId, id, dto);
  }
  @Post('conversations/:id/appointments') propose(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AppointmentDto,
  ) {
    return this.conversations.propose(req.auth.userId, id, dto);
  }
  @Post('conversations/:id/appointments/:appointmentId') change(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: ChangeAppointmentDto,
  ) {
    return this.conversations.change(req.auth.userId, id, appointmentId, dto);
  }
  @Get('appointments') appointments(
    @Req() req: AuthenticatedRequest,
    @Query() query: AppointmentQuery,
  ) {
    return this.conversations.appointments(req.auth.userId, query);
  }
  @Get('notifications') notices(
    @Req() req: AuthenticatedRequest,
    @Query() query: NotificationQuery,
  ) {
    return this.notifications.list(req.auth.userId, query);
  }
  @Post('notifications/read') readAll(@Req() req: AuthenticatedRequest) {
    return this.notifications.read(req.auth.userId);
  }
  @Post('notifications/:id/read') readOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.read(req.auth.userId, id);
  }
}
