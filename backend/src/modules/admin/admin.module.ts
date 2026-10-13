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
import { ListingReportsController } from './listing-reports.controller.js';
import { ListingReportsService } from './listing-reports.service.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { AdminAuditService } from './admin-audit.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    AdminController,
    SystemAnnouncementsController,
    ListingReportsController,
  ],
  providers: [
    AdminGuard,
    AdminService,
    AdminUsersService,
    AdminReportsService,
    AdminAnnouncementsService,
    ListingReportsService,
    AdminOrdersService,
    AdminAuditService,
  ],
})
export class AdminModule {}
