import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
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
import { AdminOrdersService } from './admin-orders.service.js';
import { AdminAuditService } from './admin-audit.service.js';
import { AdminAiCostsService } from './admin-ai-costs.service.js';
import {
  AccountLockDto,
  AccountRestoreDto,
  AdminOrdersQuery,
  AdminAuditQuery,
  AdminPageQuery,
  AdminReportsQuery,
  AdminSummaryQuery,
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
    private readonly orders: AdminOrdersService,
    private readonly audit: AdminAuditService,
    private readonly aiCosts: AdminAiCostsService,
  ) {}
  @Get('orders') listOrders(@Query() query: AdminOrdersQuery) {
    return this.orders.list(query);
  }
  @Get('orders/:id') orderDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.detail(id);
  }
  @Get('audit') actions(@Query() query: AdminAuditQuery) {
    return this.audit.list(query);
  }
  @Get('summary') summary(@Query() query: AdminSummaryQuery) {
    return this.admin.summary(query);
  }
  @Get('ai-costs') aiUsage(@Query() query: AdminSummaryQuery) {
    return this.aiCosts.report(query);
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
  @Post('users/:id/restore') @HttpCode(200) restore(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountRestoreDto,
  ) {
    return this.users.restore(req.auth.userId, id, dto);
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
