import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { WebVitalsController } from '../src/modules/health/web-vitals.controller.js';
import { OriginGuard } from '../src/common/origin.guard.js';
import { RateLimitService } from '../src/redis/rate-limit.service.js';

describe('anonymous Web Vitals ingestion', () => {
  let app: INestApplication;
  const check = vi.fn().mockResolvedValue(undefined);
  const metric = {
    id: 'v5-page-only-123',
    name: 'LCP',
    value: 1200,
    route: 'home',
    device: 'mobile',
  };
  const origin = 'http://localhost:3000';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WebVitalsController],
      providers: [
        { provide: RateLimitService, useValue: { check } },
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: origin }),
        },
        { provide: APP_GUARD, useClass: OriginGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });
  const post = (body: object, from = origin) =>
    request(app.getHttpServer())
      .post('/api/v1/telemetry/web-vitals')
      .set('Origin', from)
      .send(body);
  it('logs allowlisted measurements without a session and hashes the rate-limit IP', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    await post(metric).expect(204);
    expect(log).toHaveBeenCalledWith({ event: 'web_vital', ...metric });
    expect(check).toHaveBeenCalledWith(
      expect.stringMatching(/^web-vitals:[a-f0-9]{64}$/),
      120,
      60000,
    );
  });
  it('rejects cross-origin writes and does not accept private URLs or user attributes', async () => {
    await post(metric, 'https://other.example').expect(403);
    await post({ ...metric, url: '/tin-nhan/private?token=sensitive' }).expect(
      400,
    );
    await post({ ...metric, route: 'tin-nhan' }).expect(400);
    await post({ ...metric, value: -1 }).expect(400);
    await post({ ...metric, name: 'unknown' }).expect(400);
  });
});
