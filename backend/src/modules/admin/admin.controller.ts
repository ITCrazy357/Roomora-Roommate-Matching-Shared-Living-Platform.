import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AdminGuard } from '../listings/admin.guard.js';
import { AdminService } from './admin.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminReportsService } from './admin-reports.service.js';
import { AdminAnnouncementsService } from './admin-announcements.service.js';
import {
  AccountLockDto,
  AdminPageQuery,
  AdminReportsQuery,
  AdminUsersQuery,
  AdminVersionDto,
  AnnouncementDto,
  HandleReportDto,
  UpdateAnnouncementDto,
} from './dto/admin.dto.js';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly users: AdminUsersService,
    private readonly reports: AdminReportsService,
    private readonly announcements: AdminAnnouncementsService,
  ) {}
  @Get('summary') summary() {
    return this.admin.summary();
  }
  @Get('users') listUsers(@Query() query: AdminUsersQuery) {
    return this.users.list(query);
  }
  @Get('users/:id/history') userHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.history(id);
  }
  @Patch('users/:id/lock') lock(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountLockDto,
  ) {
    return this.users.setLock(req.auth.userId, id, dto);
  }
  @Get('reports') listReports(@Query() query: AdminReportsQuery) {
    return this.reports.list(query);
  }
  @Get('reports/:id/history') reportHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reports.history(id);
  }
  @Patch('reports/:id') handle(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandleReportDto,
  ) {
    return this.reports.handle(req.auth.userId, id, dto);
  }
  @Get('announcements') listAnnouncements(@Query() query: AdminPageQuery) {
    return this.announcements.list(query);
  }
  @Get('announcements/:id/history') announcementHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.announcements.history(id);
  }
  @Post('announcements') create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AnnouncementDto,
  ) {
    return this.announcements.create(req.auth.userId, dto);
  }
  @Patch('announcements/:id') update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcements.update(req.auth.userId, id, dto);
  }
  @Post('announcements/:id/publish') publish(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminVersionDto,
  ) {
    return this.announcements.publish(req.auth.userId, id, dto.version, true);
  }
  @Post('announcements/:id/withdraw') withdraw(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminVersionDto,
  ) {
    return this.announcements.publish(req.auth.userId, id, dto.version, false);
  }
}

@Controller('system/announcements')
export class SystemAnnouncementsController {
  constructor(private readonly announcements: AdminAnnouncementsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  active() {
    return this.announcements.active();
  }
}
