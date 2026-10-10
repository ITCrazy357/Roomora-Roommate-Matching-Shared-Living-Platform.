import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HousesModule } from '../houses/houses.module.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { CommunicationsModule } from '../communications/communications.module.js';
import { HouseholdController } from './household.controller.js';
import { HouseholdService } from './household.service.js';
import { HouseholdAccessService } from './household-access.service.js';
import { HouseActivitiesService } from './house-activities.service.js';
import { HouseReportsService } from './house-reports.service.js';
import { HouseReportPdfService } from './house-report-pdf.service.js';
import { RecurringRulesService } from './recurring-rules.service.js';
import { RecurringDraftsService } from './recurring-drafts.service.js';
import { RecurringSchedulerService } from './recurring-scheduler.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HousesModule,
    ExpensesModule,
    CommunicationsModule,
  ],
  controllers: [HouseholdController],
  providers: [
    HouseholdService,
    HouseholdAccessService,
    HouseActivitiesService,
    HouseReportsService,
    HouseReportPdfService,
    RecurringRulesService,
    RecurringDraftsService,
    RecurringSchedulerService,
  ],
})
export class HouseholdModule {}
