import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { ListingQueriesService } from './listing-queries.service.js';
import { ListingManagementService } from './listing-management.service.js';
import { ListingPhotosService } from './listing-photos.service.js';
import { ListingRulesService } from './listing-rules.service.js';
import { ListingQuotaService } from './listing-quota.service.js';
import { AdminGuard } from './admin.guard.js';
import {
  ListingsController,
  ListingModerationController,
} from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CloudinaryModule,
    LocationsModule,
    IdentityModule,
  ],
  controllers: [ListingsController, ListingModerationController],
  providers: [
    ListingsService,
    ListingQueriesService,
    ListingManagementService,
    ListingPhotosService,
    ListingRulesService,
    ListingQuotaService,
    AdminGuard,
  ],
})
export class ListingsModule {}
