import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CommunicationsController } from './communications.controller.js';
import { ConversationsService } from './conversations.service.js';
import { NotificationsService } from './notifications.service.js';
import { UpdatesService } from './updates.service.js';
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CommunicationsController],
  providers: [ConversationsService, NotificationsService, UpdatesService],
  exports: [NotificationsService],
})
export class CommunicationsModule {}
