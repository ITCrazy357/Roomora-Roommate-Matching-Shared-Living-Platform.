import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AiCreditsService } from './ai-credits.service.js';
@Module({
  imports: [PrismaModule],
  providers: [AiCreditsService],
  exports: [AiCreditsService],
})
export class AiCreditsModule {}
