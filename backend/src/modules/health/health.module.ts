import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { RedisModule } from '../../redis/redis.module.js';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
