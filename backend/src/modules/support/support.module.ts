import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminGuard } from '../listings/admin.guard.js';
import {
  AdminSupportController,
  SupportController,
} from './support.controller.js';
import { SupportService } from './support.service.js';
import { ChatController, ChatRateGuard } from './chat.controller.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SupportController, AdminSupportController, ChatController],
  providers: [SupportService, AdminGuard, ChatService, ChatRateGuard],
})
export class SupportModule {}
