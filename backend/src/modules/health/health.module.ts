import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { RedisModule } from '../../redis/redis.module.js';
import { WebVitalsController } from './web-vitals.controller.js';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController, WebVitalsController],
})
export class HealthModule {}
