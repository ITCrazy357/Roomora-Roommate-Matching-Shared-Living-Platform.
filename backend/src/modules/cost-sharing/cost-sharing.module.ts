import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HousesModule } from '../houses/houses.module.js';
import { CommunicationsModule } from '../communications/communications.module.js';
import { CostSharingController } from './cost-sharing.controller.js';
import { CostSharingService } from './cost-sharing.service.js';
import { CostSharingPeriodsService } from './cost-sharing-periods.service.js';
import { CostSharingBallotsService } from './cost-sharing-ballots.service.js';
import { CostSharingRulesService } from './cost-sharing-rules.service.js';
import { CostSharingSchedulerService } from './cost-sharing-scheduler.service.js';
@Module({
  imports: [PrismaModule, AuthModule, HousesModule, CommunicationsModule],
  controllers: [CostSharingController],
  providers: [
    CostSharingService,
    CostSharingPeriodsService,
    CostSharingBallotsService,
    CostSharingRulesService,
    CostSharingSchedulerService,
  ],
  exports: [CostSharingRulesService],
})
export class CostSharingModule {}
