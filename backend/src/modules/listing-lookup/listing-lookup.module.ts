import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { ListingLookupService } from './listing-lookup.service.js';
import { LookupChatService } from './lookup-chat.service.js';
import { LookupController } from './lookup.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, ListingsModule, LocationsModule],
  controllers: [LookupController],
  providers: [ListingLookupService, LookupChatService],
  exports: [ListingLookupService],
})
export class ListingLookupModule {}
