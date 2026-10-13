import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminGuard } from '../listings/admin.guard.js';
import {
  AdminSupportController,
  SupportController,
} from './support.controller.js';
import { SupportService } from './support.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, AdminGuard],
})
export class SupportModule {}
