import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  check() {
    return {
      status: 'ok',
      service: 'roomora-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    const [database, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.status(),
    ]);
    const redisStatus = redis.status === 'fulfilled' ? redis.value : 'down';
    const ready = database.status === 'fulfilled' && redisStatus !== 'down';
    const result = {
      status: ready ? 'ok' : 'error',
      service: 'roomora-api',
      database: database.status === 'fulfilled' ? 'up' : 'down',
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    };
    if (!ready) throw new ServiceUnavailableException(result);
    return result;
  }
}
