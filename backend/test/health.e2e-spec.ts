import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/modules/health/health.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';

describe('Health HTTP contract', () => {
  let app: INestApplication;
  const query = vi.fn();
  const redisStatus = vi.fn();

  beforeEach(async () => {
    query.mockReset().mockResolvedValue([{ schema_ready: true }]);
    redisStatus.mockReset().mockResolvedValue('disabled');
    const module = await Test.createTestingModule({ imports: [HealthModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRawUnsafe: query })
      .overrideProvider(RedisService)
      .useValue({ status: redisStatus })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('keeps liveness independent of the database', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(query).not.toHaveBeenCalled();
    expect(redisStatus).not.toHaveBeenCalled();
  });

  it('checks the release schema before reporting ready', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'up',
      schema: 'up',
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('LIMIT 0');
  });

  it('rejects a reachable database with missing release prerequisites', async () => {
    query.mockResolvedValue([{ schema_ready: false }]);
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);
    expect(response.body).toMatchObject({ database: 'up', schema: 'down' });
  });

  it('returns 503 without exposing database errors or credentials', async () => {
    query.mockRejectedValue(
      new Error('postgresql://private:secret@internal/db'),
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toEqual({
      status: 'error',
      service: 'roomora-api',
      database: 'down',
      schema: 'down',
      redis: 'disabled',
      timestamp: expect.any(String),
    });
    expect(response.text).not.toMatch(/private|secret|internal|postgresql/);
  });

  it('checks Redis before ready and returns 503 if configured Redis is down', async () => {
    redisStatus.mockResolvedValue('up');
    const healthy = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);
    expect(healthy.body.redis).toBe('up');
    redisStatus.mockResolvedValue('down');
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);
    expect(response.body).toMatchObject({
      status: 'error',
      database: 'up',
      redis: 'down',
    });
  });
});
