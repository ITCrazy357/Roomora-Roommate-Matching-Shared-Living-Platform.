import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AiUsageService } from './ai-usage.service.js';

@Module({
  imports: [PrismaModule],
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
