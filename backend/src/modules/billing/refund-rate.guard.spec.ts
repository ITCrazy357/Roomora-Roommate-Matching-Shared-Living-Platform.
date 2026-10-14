import type { ExecutionContext } from '@nestjs/common';
import { RefundRateGuard } from './refund-rate.guard.js';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';

describe('Refund mutation rate limit', () => {
  const context = (role: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ auth: { userId: role, role } }),
      }),
    }) as unknown as ExecutionContext;
  it('limits user mutations, keeps admin capacity independent, and resets after one minute', async () => {
    const guard = new RefundRateGuard(
      new RateLimitService(new RedisService(new ConfigService())),
    );
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    for (let i = 0; i < 20; i++)
      expect(await guard.canActivate(context('USER'))).toBe(true);
    await expect(guard.canActivate(context('USER'))).rejects.toThrow();
    for (let i = 0; i < 60; i++)
      expect(await guard.canActivate(context('ADMIN'))).toBe(true);
    await expect(guard.canActivate(context('ADMIN'))).rejects.toThrow();
    clock.mockReturnValue(61000);
    expect(await guard.canActivate(context('USER'))).toBe(true);
    clock.mockRestore();
  });
});
