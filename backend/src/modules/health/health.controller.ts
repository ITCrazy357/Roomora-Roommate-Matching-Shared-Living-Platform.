import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { schemaReadinessQuery } from '../../database/schema-readiness.js';

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
      this.prisma.$queryRawUnsafe<{ schema_ready: boolean }[]>(
        schemaReadinessQuery,
      ),
      this.redis.status(),
    ]);
    const redisStatus = redis.status === 'fulfilled' ? redis.value : 'down';
    const schemaReady =
      database.status === 'fulfilled' &&
      database.value[0]?.schema_ready === true;
    const ready = schemaReady && redisStatus !== 'down';
    const result = {
      status: ready ? 'ok' : 'error',
      service: 'roomora-api',
      database: database.status === 'fulfilled' ? 'up' : 'down',
      schema: schemaReady ? 'up' : 'down',
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    };
    if (!ready) throw new ServiceUnavailableException(result);
    return result;
  }
}
