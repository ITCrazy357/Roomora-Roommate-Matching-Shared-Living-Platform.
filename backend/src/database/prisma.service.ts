import { createHash } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient<
    Prisma.PrismaClientOptions & { log: [{ emit: 'event'; level: 'query' }] }
  >
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      connectionTimeoutMillis: 5_000,
      query_timeout: 5_000,
      max: config.get<number>('DATABASE_POOL_SIZE', 10),
    });

    super({ adapter, log: [{ emit: 'event', level: 'query' }] });
    const slowQueryMs = config.get<number>('DATABASE_SLOW_QUERY_MS', 500);
    this.$on('query', (event) => {
      if (event.duration < slowQueryMs) return;
      // SQL text and parameters may contain private data; keep only a stable fingerprint.
      this.logger.warn({
        event: 'slow_query',
        durationMs: event.duration,
        queryId: createHash('sha256')
          .update(event.query)
          .digest('hex')
          .slice(0, 16),
      });
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
    this.logger.log('PostgreSQL connected');
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
