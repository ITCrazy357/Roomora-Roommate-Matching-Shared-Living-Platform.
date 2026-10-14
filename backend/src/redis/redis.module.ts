import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service.js';
import { RateLimitService } from './rate-limit.service.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService, RateLimitService],
  exports: [RedisService, RateLimitService],
})
export class RedisModule {}
