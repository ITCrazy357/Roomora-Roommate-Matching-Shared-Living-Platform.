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
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Res,
  UseFilters,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  sendMessageAttachment,
  type MessageFiles,
} from '../communications/message-media.js';
import { CreateHousePollDto, VoteHousePollDto } from './dto/house-poll.dto.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import {
  EditMessageDto,
  MessageQuery,
  MessageVersionDto,
  SendMessageDto,
} from '../communications/dto/communications.dto.js';
import { HouseChatService } from './house-chat.service.js';
import { MessageUploadFilter } from '../communications/message-upload.filter.js';
@Controller('houses/:houseId')
@UseGuards(AuthGuard)
export class HouseChatController {
  constructor(private readonly chat: HouseChatService) {}
  @Get('messages') list(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: MessageQuery,
  ) {
    return this.chat.list(req.auth.userId, houseId, query);
  }
  @Post('messages')
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
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: SendMessageDto,
    @UploadedFiles() files?: MessageFiles,
  ) {
    return this.chat.send(req.auth.userId, houseId, dto, files);
  }
  @Patch('messages/:id') edit(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.chat.change(req.auth.userId, houseId, id, dto, false);
  }
  @Delete('messages/:id') remove(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageVersionDto,
  ) {
    return this.chat.change(req.auth.userId, houseId, id, dto, true);
  }
  @Get('attachments/:attachmentId') async attachment(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() response: Response,
  ) {
    const file = await this.chat.attachment(
      req.auth.userId,
      houseId,
      attachmentId,
    );
    sendMessageAttachment(response, file);
  }

  @Post('polls') createPoll(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: CreateHousePollDto,
  ) {
    return this.chat.createPoll(req.auth.userId, houseId, dto);
  }

  @Post('polls/:id/vote') vote(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoteHousePollDto,
  ) {
    return this.chat.vote(req.auth.userId, houseId, id, dto);
  }

  @Post('polls/:id/close') closePoll(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.closePoll(req.auth.userId, houseId, id);
  }
}
