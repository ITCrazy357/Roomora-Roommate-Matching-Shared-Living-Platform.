import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { OptionallyAuthenticatedRequest } from './request-context.js';
import { RateLimitService } from '../redis/rate-limit.service.js';
import { RedisService } from '../redis/redis.service.js';
import { AuthGuard, OptionalAuthGuard } from '../modules/auth/auth.guard.js';
import { ListingsController } from '../modules/listings/listings.controller.js';
import { ListingsService } from '../modules/listings/listings.service.js';
import { ListingQuotaService } from '../modules/listings/listing-quota.service.js';
import { PeopleController } from '../modules/people/people.controller.js';
import { PeopleService } from '../modules/people/people.service.js';

// Real routing, DTO validation and limiter; authentication and queries are fixtures.
// No database or production endpoint is involved.
describe('Public search HTTP admission limits', () => {
  let app: INestApplication;
  let rates: RateLimitService;
  const listings = vi.fn((_query: unknown, _userId?: string) => ({
    items: [],
    total: 0,
  }));
  const people = vi.fn((_query: unknown, _userId?: string) => ({
    items: [],
    total: 0,
  }));
  const auth: CanActivate = {
    canActivate(context: ExecutionContext) {
      const req = context
        .switchToHttp()
        .getRequest<OptionallyAuthenticatedRequest>();
      const userId = req.get('X-Fixture-User');
      if (userId)
        req.auth = {
          userId,
          sessionId: 'fixture-session',
          email: 'fixture@example.test',
          role: 'USER',
        };
      return true;
    },
  };

  beforeEach(async () => {
    listings.mockClear();
    people.mockClear();
    rates = new RateLimitService(new RedisService(new ConfigService()));
    const module = await Test.createTestingModule({
      controllers: [ListingsController, PeopleController],
      providers: [
        { provide: RateLimitService, useValue: rates },
        { provide: ListingsService, useValue: { listPublic: listings } },
        { provide: ListingQuotaService, useValue: {} },
        { provide: PeopleService, useValue: { search: people } },
      ],
    })
      .overrideGuard(OptionalAuthGuard)
      .useValue(auth)
      .overrideGuard(AuthGuard)
      .useValue(auth)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  const search = (index: number, user?: string) => {
    const path = index % 2 ? '/people' : '/listings';
    const query = request(app.getHttpServer())
      .get(`${path}?page=${index + 1}`)
      .set('X-Forwarded-For', `203.0.113.${(index % 200) + 1}`)
      .set('X-Real-IP', `198.51.100.${(index % 200) + 1}`);
    return user ? query.set('X-Fixture-User', user) : query;
  };

  it('shares the authenticated quota across endpoints, filters and trusted source IPs', async () => {
    // Simulate one explicitly trusted local proxy, as configured on the API.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    for (let index = 0; index < 60; index++)
      await search(index, 'verified-fixture-user').expect(200);
    for (const index of [60, 61]) {
      const blocked = await search(index, 'verified-fixture-user').expect(429);
      expect(blocked.body.code).toBe('RATE_LIMITED');
      expect(blocked.headers['retry-after']).toBe('60');
      expect(blocked.headers['cache-control']).toContain('no-store');
    }
    expect(listings.mock.calls.length + people.mock.calls.length).toBe(60);
    const allowed = await search(62, 'another-verified-user').expect(200);
    expect(allowed.headers['cache-control']).toContain('no-store');
    expect(people.mock.calls[0][1]).toBe('verified-fixture-user');
  });

  it('bounds anonymous attempts before querying or validation, ignores untrusted IP headers and resets', async () => {
    app.getHttpAdapter().getInstance().set('trust proxy', false);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    // Even a rejected DTO consumes an admission slot before expensive search.
    await request(app.getHttpServer())
      .get('/listings?page=invalid')
      .expect(400);
    for (let index = 1; index < 600; index++) await search(index).expect(200);
    await search(600).expect(429);
    await search(601).set('X-User-ID', 'unverified-header').expect(429);
    expect(listings.mock.calls.length + people.mock.calls.length).toBe(599);
    clock.mockReturnValue(61000);
    await search(602).expect(200);
  }, 10000);

  it('keeps trusted networks independent while sharing the network quota with signed-in visitors', async () => {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    for (let index = 0; index < 600; index++)
      await search(index).set('X-Forwarded-For', '203.0.113.10').expect(200);
    await search(600)
      .set('X-Forwarded-For', '203.0.113.10')
      .set('X-Fixture-User', 'verified-fixture-user')
      .expect(429);
    await search(601).set('X-Forwarded-For', '203.0.113.11').expect(200);
  }, 10000);

  it('propagates limiter outages without executing either query', async () => {
    vi.spyOn(rates, 'check').mockRejectedValue(
      new ServiceUnavailableException({ code: 'RATE_LIMIT_UNAVAILABLE' }),
    );
    for (const index of [0, 1]) {
      const response = await search(index).expect(503);
      expect(response.body.code).toBe('RATE_LIMIT_UNAVAILABLE');
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['retry-after']).toBeUndefined();
    }
    expect(listings).not.toHaveBeenCalled();
    expect(people).not.toHaveBeenCalled();
  });
});
