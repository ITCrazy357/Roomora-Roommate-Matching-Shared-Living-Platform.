import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CommunicationsModule } from '../communications/communications.module.js';
import { HousesController } from './houses.controller.js';
import { HousesService } from './houses.service.js';

@Module({
  imports: [PrismaModule, AuthModule, CommunicationsModule],
  controllers: [HousesController],
  providers: [HousesService],
})
export class HousesModule {}
