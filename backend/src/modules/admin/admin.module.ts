import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminGuard } from '../listings/admin.guard.js';
import {
  AdminController,
  SystemAnnouncementsController,
} from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminReportsService } from './admin-reports.service.js';
import { AdminAnnouncementsService } from './admin-announcements.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminController, SystemAnnouncementsController],
  providers: [
    AdminGuard,
    AdminService,
    AdminUsersService,
    AdminReportsService,
    AdminAnnouncementsService,
  ],
})
export class AdminModule {}
