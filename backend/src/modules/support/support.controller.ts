import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminGuard } from '../listings/admin.guard.js';
import {
  CreateTicketDto,
  HandleTicketDto,
  ReplyTicketDto,
  SupportQuery,
  TicketStatusDto,
} from './dto/support.dto.js';
import { SupportService } from './support.service.js';

@Controller('support/tickets')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: SupportQuery) {
    return this.support.list(req.auth.userId, query);
  }
  @Get(':id') detail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.support.detail(req.auth.userId, id);
  }
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTicketDto,
  ) {
    return this.support.create(req.auth.userId, dto);
  }
  @Post(':id/replies') reply(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.support.reply(req.auth.userId, id, dto, false);
  }
  @Post(':id/close') close(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.support.reply(req.auth.userId, id, dto, false, true);
  }
}

@Controller('admin/support/tickets')
@UseGuards(AdminGuard)
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}
  @Get() list(@Query() query: SupportQuery) {
    return this.support.list(undefined, query);
  }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.detail(undefined, id);
  }
  @Patch(':id') handle(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandleTicketDto,
  ) {
    return this.support.reply(req.auth.userId, id, dto, true);
  }
  @Patch(':id/status') changeStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketStatusDto,
  ) {
    return this.support.reply(req.auth.userId, id, dto, true);
  }
}
