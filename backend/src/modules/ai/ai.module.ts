import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HousesModule } from '../houses/houses.module.js';
import { HouseholdModule } from '../household/household.module.js';
import { PeopleModule } from '../people/people.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { AiController } from './ai.controller.js';
import { AiProviderService } from './ai-provider.service.js';
import { AiListingsService } from './ai-listings.service.js';
import { AiReceiptsService } from './ai-receipts.service.js';
import { AiInsightsService } from './ai-insights.service.js';
import { AiCreditsModule } from '../ai-credits/ai-credits.module.js';
import { AiSummariesService } from './ai-summaries.service.js';
import { AiUsageModule } from '../ai-usage/ai-usage.module.js';
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HousesModule,
    HouseholdModule,
    PeopleModule,
    LocationsModule,
    AiCreditsModule,
    AiUsageModule,
  ],
  controllers: [AiController],
  providers: [
    AiProviderService,
    AiListingsService,
    AiReceiptsService,
    AiInsightsService,
    AiSummariesService,
  ],
})
export class AiModule {}
