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
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HousesModule,
    HouseholdModule,
    PeopleModule,
    LocationsModule,
  ],
  controllers: [AiController],
  providers: [
    AiProviderService,
    AiListingsService,
    AiReceiptsService,
    AiInsightsService,
  ],
})
export class AiModule {}
