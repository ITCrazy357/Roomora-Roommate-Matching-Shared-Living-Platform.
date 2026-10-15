import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { AdminGuard } from '../listings/admin.guard.js';
import { IdentityService } from './identity.service.js';
import { IdentityCryptoService } from './identity-crypto.service.js';
import {
  AdminIdentityController,
  IdentityController,
} from './identity.controller.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [IdentityController, AdminIdentityController],
  providers: [IdentityService, IdentityCryptoService, AdminGuard],
  exports: [IdentityService],
})
export class IdentityModule {}
