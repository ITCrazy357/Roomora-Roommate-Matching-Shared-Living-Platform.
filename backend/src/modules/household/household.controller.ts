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
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { ExpenseVersionDto } from '../expenses/dto/expenses.dto.js';
import {
  ActivityDto,
  ActivityQueryDto,
  ActivityStatusDto,
  UpdateActivityDto,
  RecurringRuleDto,
  UpdateRecurringRuleDto,
  RecurringEnabledDto,
  ConfirmRecurringDraftDto,
  ReportQueryDto,
} from './dto/household.dto.js';
import { HouseholdService } from './household.service.js';

function activityKind(path: string) {
  if (path === 'chores') return 'CHORE' as const;
  if (path === 'shopping') return 'SHOPPING' as const;
  throw new BadRequestException({ code: 'HOUSEHOLD_NOT_FOUND' });
}

@Controller('houses/:houseId/household')
@UseGuards(AuthGuard)
export class HouseholdController {
  constructor(private readonly household: HouseholdService) {}
  @Get('recurring') listRules(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.household.listRules(req.auth.userId, houseId);
  }
  @Post('recurring') createRule(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: RecurringRuleDto,
  ) {
    return this.household.createRule(req.auth.userId, houseId, dto);
  }
  @Patch('recurring/:id') updateRule(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringRuleDto,
  ) {
    return this.household.updateRule(req.auth.userId, houseId, id, dto);
  }
  @Post('recurring/:id/enabled') enabled(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecurringEnabledDto,
  ) {
    return this.household.ruleEnabled(req.auth.userId, houseId, id, dto);
  }
  @Get('drafts') listDrafts(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: ActivityQueryDto,
  ) {
    return this.household.listDrafts(req.auth.userId, houseId, query);
  }
  @Post('drafts/:id/confirm') confirm(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmRecurringDraftDto,
  ) {
    return this.household.confirmDraft(req.auth.userId, houseId, id, dto);
  }
  @Post('drafts/:id/skip') skip(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpenseVersionDto,
  ) {
    return this.household.skipDraft(req.auth.userId, houseId, id, dto);
  }
  @Get('reports') report(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: ReportQueryDto,
  ) {
    return this.household.report(req.auth.userId, houseId, query);
  }
  @Get('reports/export') async export(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.household.exportReport(
      req.auth.userId,
      houseId,
      query,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Roomora-${query.month}.csv"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  }
  @Get('reports/pdf') async exportPdf(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const pdf = await this.household.exportPdf(req.auth.userId, houseId, query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Roomora-${query.month}.pdf"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(pdf);
  }
  @Get(':kind') list(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('kind') kind: string,
    @Query() query: ActivityQueryDto,
  ) {
    return this.household.listActivities(
      req.auth.userId,
      houseId,
      activityKind(kind),
      query,
    );
  }
  @Post(':kind') create(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('kind') kind: string,
    @Body() dto: ActivityDto,
  ) {
    return this.household.createActivity(
      req.auth.userId,
      houseId,
      activityKind(kind),
      dto,
    );
  }
  @Patch(':kind/:id') update(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.household.updateActivity(
      req.auth.userId,
      houseId,
      activityKind(kind),
      id,
      dto,
    );
  }
  @Post(':kind/:id/status') status(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivityStatusDto,
  ) {
    return this.household.activityStatus(
      req.auth.userId,
      houseId,
      activityKind(kind),
      id,
      dto,
    );
  }
}
