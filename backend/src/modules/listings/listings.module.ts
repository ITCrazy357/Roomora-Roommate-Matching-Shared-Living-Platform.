import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { AdminGuard } from './admin.guard.js';
import {
  ListingsController,
  ListingModerationController,
} from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [PrismaModule, AuthModule, CloudinaryModule, LocationsModule],
  controllers: [ListingsController, ListingModerationController],
  providers: [ListingsService, AdminGuard],
})
export class ListingsModule {}
