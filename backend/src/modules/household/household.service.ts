import { Injectable } from '@nestjs/common';
import type { HouseActivityKind } from '../../generated/prisma/client.js';
import type { ExpenseVersionDto } from '../expenses/dto/expenses.dto.js';
import type {
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
import { HouseActivitiesService } from './house-activities.service.js';
import { RecurringRulesService } from './recurring-rules.service.js';
import { RecurringDraftsService } from './recurring-drafts.service.js';
import { HouseReportsService } from './house-reports.service.js';
import { HouseReportPdfService } from './house-report-pdf.service.js';

@Injectable()
export class HouseholdService {
  constructor(
    private readonly activities: HouseActivitiesService,
    private readonly rules: RecurringRulesService,
    private readonly drafts: RecurringDraftsService,
    private readonly reports: HouseReportsService,
    private readonly pdf: HouseReportPdfService,
  ) {}
  listActivities(
    userId: string,
    houseId: string,
    kind: HouseActivityKind,
    query: ActivityQueryDto,
  ) {
    return this.activities.list(userId, houseId, kind, query);
  }
  createActivity(
    userId: string,
    houseId: string,
    kind: HouseActivityKind,
    dto: ActivityDto,
  ) {
    return this.activities.create(userId, houseId, kind, dto);
  }
  updateActivity(
    userId: string,
    houseId: string,
    kind: HouseActivityKind,
    id: string,
    dto: UpdateActivityDto,
  ) {
    return this.activities.update(userId, houseId, kind, id, dto);
  }
  activityStatus(
    userId: string,
    houseId: string,
    kind: HouseActivityKind,
    id: string,
    dto: ActivityStatusDto,
  ) {
    return this.activities.status(userId, houseId, kind, id, dto);
  }
  listRules(userId: string, houseId: string) {
    return this.rules.list(userId, houseId);
  }
  createRule(userId: string, houseId: string, dto: RecurringRuleDto) {
    return this.rules.create(userId, houseId, dto);
  }
  updateRule(
    userId: string,
    houseId: string,
    id: string,
    dto: UpdateRecurringRuleDto,
  ) {
    return this.rules.update(userId, houseId, id, dto);
  }
  ruleEnabled(
    userId: string,
    houseId: string,
    id: string,
    dto: RecurringEnabledDto,
  ) {
    return this.rules.enabled(userId, houseId, id, dto);
  }
  listDrafts(userId: string, houseId: string, query: ActivityQueryDto) {
    return this.drafts.list(userId, houseId, query);
  }
  confirmDraft(
    userId: string,
    houseId: string,
    id: string,
    dto: ConfirmRecurringDraftDto,
  ) {
    return this.drafts.confirm(userId, houseId, id, dto);
  }
  skipDraft(
    userId: string,
    houseId: string,
    id: string,
    dto: ExpenseVersionDto,
  ) {
    return this.drafts.skip(userId, houseId, id, dto);
  }
  report(userId: string, houseId: string, query: ReportQueryDto) {
    return this.reports.get(userId, houseId, query);
  }
  exportReport(userId: string, houseId: string, query: ReportQueryDto) {
    return this.reports.export(userId, houseId, query);
  }
  exportPdf(userId: string, houseId: string, query: ReportQueryDto) {
    return this.pdf.export(userId, houseId, query);
  }
}
