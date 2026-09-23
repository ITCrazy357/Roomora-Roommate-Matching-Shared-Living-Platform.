import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/modules/health/health.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Health HTTP contract', () => {
  let app: INestApplication;
  const query = vi.fn();

  beforeEach(async () => {
    query.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    const module = await Test.createTestingModule({ imports: [HealthModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: query })
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
  });

  it('executes SELECT 1 before reporting ready', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toEqual(['SELECT 1']);
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
      timestamp: expect.any(String),
    });
    expect(response.text).not.toMatch(/private|secret|internal|postgresql/);
  });
});
