import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CommunicationsModule } from '../communications/communications.module.js';
import { HouseChatMessagesService } from './house-chat-messages.service.js';
import { HouseChatPollsService } from './house-chat-polls.service.js';
import { HouseDetailsService } from './house-details.service.js';
import { HouseMembershipsService } from './house-memberships.service.js';
import { HouseInvitesService } from './house-invites.service.js';
import { HouseAnnouncementsService } from './house-announcements.service.js';
import { HouseMembershipAccessService } from './house-membership-access.service.js';
import { HousesController } from './houses.controller.js';
import { HousesService } from './houses.service.js';
import { HouseAccessService } from './house-access.service.js';
import { HouseChatController } from './house-chat.controller.js';
import { HouseChatService } from './house-chat.service.js';

@Module({
  imports: [PrismaModule, AuthModule, CommunicationsModule, IdentityModule],
  controllers: [HousesController, HouseChatController],
  providers: [
    HousesService,
    HouseChatService,
    HouseChatMessagesService,
    HouseChatPollsService,
    HouseDetailsService,
    HouseMembershipsService,
    HouseInvitesService,
    HouseAnnouncementsService,
    HouseMembershipAccessService,
    HouseAccessService,
  ],
  exports: [HouseAccessService],
})
export class HousesModule {}
