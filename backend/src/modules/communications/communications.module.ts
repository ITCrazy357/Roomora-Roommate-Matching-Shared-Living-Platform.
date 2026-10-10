import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ConversationQueriesService } from './conversation-queries.service.js';
import { ConversationMessagesService } from './conversation-messages.service.js';
import { ConversationAppointmentsService } from './conversation-appointments.service.js';
import { ConversationAccessService } from './conversation-access.service.js';
import { CommunicationsController } from './communications.controller.js';
import { ConversationsService } from './conversations.service.js';
import { NotificationsService } from './notifications.service.js';
import { UpdatesService } from './updates.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CommunicationsController],
  providers: [
    ConversationsService,
    ConversationQueriesService,
    ConversationMessagesService,
    ConversationAppointmentsService,
    ConversationAccessService,
    NotificationsService,
    UpdatesService,
  ],
  exports: [NotificationsService],
})
export class CommunicationsModule {}
