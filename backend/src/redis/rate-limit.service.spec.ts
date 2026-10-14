import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';
import { RateLimitService } from './rate-limit.service.js';

describe('Shared rate limit availability', () => {
  it('rejects protected actions when configured Redis is unavailable', async () => {
    const redis = new RedisService(
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    const rates = new RateLimitService(redis);
    await expect(rates.check('auth:login:ip', 10, 60000)).rejects.toMatchObject(
      {
        status: 503,
        response: { code: 'RATE_LIMIT_UNAVAILABLE' },
      },
    );
    expect(await redis.status()).toBe('down');
    expect(await redis.getTile('6/50/29.png')).toBeUndefined();
    await expect(
      redis.setTile('6/50/29.png', Buffer.from('tile')),
    ).resolves.toBeUndefined();
  });

  it('bounds local development counters without discarding an active window', async () => {
    const rates = new RateLimitService(new RedisService(new ConfigService()));
    for (let i = 0; i < 10000; i++) await rates.check(`client-${i}`, 2, 60000);
    await expect(rates.check('another-client', 2, 60000)).rejects.toMatchObject(
      { status: 429 },
    );
    await expect(rates.check('client-0', 2, 60000)).resolves.toBeUndefined();
    await expect(rates.check('client-0', 2, 60000)).rejects.toMatchObject({
      status: 429,
    });
  });
});
