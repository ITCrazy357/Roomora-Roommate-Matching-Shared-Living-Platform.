import type { ExecutionContext } from '@nestjs/common';
import { ChatRateGuard } from './chat.controller.js';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';

describe('Chat request limit', () => {
  it('limits repeated requests, separates clients and expires the window', async () => {
    const guard = new ChatRateGuard(
      new RateLimitService(new RedisService(new ConfigService())),
    );
    let now = 1000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const context = (ip: string) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ ip }) }),
      }) as unknown as ExecutionContext;
    try {
      for (let i = 0; i < 20; i++)
        expect(await guard.canActivate(context('first'))).toBe(true);
      await expect(guard.canActivate(context('first'))).rejects.toThrow();
      expect(await guard.canActivate(context('second'))).toBe(true);
      now += 60000;
      expect(await guard.canActivate(context('first'))).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
});
