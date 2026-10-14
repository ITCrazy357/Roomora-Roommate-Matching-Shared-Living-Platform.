import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { RedisService } from './redis.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { LocationMapsService } from '../modules/locations/location-maps.service.js';

// Uses only a unique prefix; never FLUSHDB, even on a dedicated test database.
describe.skipIf(!process.env.REDIS_TEST_URL)(
  'Redis integration (real server)',
  () => {
    const prefix = `test-${randomUUID()}`;
    const config = new ConfigService({
      REDIS_URL: process.env.REDIS_TEST_URL,
      REDIS_KEY_PREFIX: prefix,
      GEOAPIFY_API_KEY: 'private-test-map-key',
    });
    const first = new RedisService(config);
    const second = new RedisService(config);
    const admin = createClient({ url: process.env.REDIS_TEST_URL });
    admin.on('error', () => {});
    const rates = [new RateLimitService(first), new RateLimitService(second)];

    beforeAll(async () => {
      await Promise.all([
        first.onModuleInit(),
        second.onModuleInit(),
        admin.connect(),
      ]);
    });
    afterAll(async () => {
      first.onModuleDestroy();
      second.onModuleDestroy();
      if (admin.isReady) {
        const keys = await admin.keys(`${prefix}:*`);
        if (keys.length) await admin.del(keys);
      }
      if (admin.isOpen) admin.destroy();
    });
    afterEach(() => vi.restoreAllMocks());

    it('enforces one limit atomically across two instances under concurrency', async () => {
      const outcomes = await Promise.allSettled(
        Array.from({ length: 80 }, (_, i) =>
          rates[i % 2].check('auth:login:private@example.test', 20, 60000),
        ),
      );
      expect(
        outcomes.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(20);
      for (const result of outcomes)
        if (result.status === 'rejected')
          expect(result.reason).toMatchObject({ status: 429 });
      const keys = await admin.keys(`${prefix}:rate:*`);
      expect(keys).toHaveLength(1);
      expect(keys[0]).not.toContain('private@example.test');
      expect(await admin.pTTL(keys[0])).toBeGreaterThan(0);
      await expect(
        rates[1].check('chat:private@example.test', 20, 60000),
      ).resolves.toBeUndefined();
    });

    it('expires a window without extending it on blocked attempts', async () => {
      await rates[0].check('expiry', 1, 120);
      await expect(rates[1].check('expiry', 1, 120)).rejects.toMatchObject({
        status: 429,
      });
      await new Promise((resolve) => setTimeout(resolve, 180));
      await expect(rates[1].check('expiry', 1, 120)).resolves.toBeUndefined();
    });

    it('shares binary tiles between services, sets TTL and bypasses the provider', async () => {
      const data = Buffer.from([137, 80, 78, 71, 0, 255]);
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(
          async () =>
            new Response(data, { headers: { 'Content-Type': 'image/png' } }),
        );
      const mapA = new LocationMapsService(config, first);
      const mapB = new LocationMapsService(config, second);
      expect(await mapA.tile(6, 50, 29, false)).toEqual(data);
      expect(await mapB.tile(6, 50, 29, false)).toEqual(data);
      expect(fetch).toHaveBeenCalledTimes(1);
      const keys = (await admin.keys(`${prefix}:*map-tiles*`)).filter(
        (key) => !key.endsWith(':index'),
      );
      expect(keys).toHaveLength(1);
      expect(await admin.pTTL(keys[0])).toBeGreaterThan(0);
      await admin.pExpire(keys[0], 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(await second.getTile('6/50/29.png')).toBeUndefined();
    });

    it('bounds the shared cache and does not cache oversized tiles', async () => {
      for (let i = 0; i < 140; i++)
        await first.setTile(`tile-${i}`, Buffer.from([i]));
      const index = `${prefix}:{map-tiles}:v1:index`;
      expect(await admin.zCard(index)).toBe(128);
      expect(await first.getTile('tile-0')).toBeUndefined();
      expect(await second.getTile('tile-139')).toEqual(Buffer.from([139]));
      await first.setTile('oversized', Buffer.alloc(512 * 1024 + 1));
      expect(await second.getTile('oversized')).toBeUndefined();
    });

    it('keeps readiness down and rate limits closed after connection loss, but map requests work', async () => {
      second.onModuleDestroy();
      expect(await second.status()).toBe('down');
      await expect(rates[1].check('outage', 10, 60000)).rejects.toMatchObject({
        status: 503,
        response: { code: 'RATE_LIMIT_UNAVAILABLE' },
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () =>
          new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { 'Content-Type': 'image/png' },
          }),
      );
      const map = new LocationMapsService(config, second);
      expect(await map.tile(6, 51, 29, false)).toEqual(
        Buffer.from([137, 80, 78, 71]),
      );
    });
  },
);
