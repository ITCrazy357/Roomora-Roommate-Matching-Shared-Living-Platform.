import type { ExecutionContext } from '@nestjs/common';
import { RefundRateGuard } from './refund-rate.guard.js';

describe('Refund mutation rate limit', () => {
  const context = (role: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ auth: { userId: role, role } }),
      }),
    }) as unknown as ExecutionContext;
  it('limits user mutations, keeps admin capacity independent, and resets after one minute', () => {
    const guard = new RefundRateGuard();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    for (let i = 0; i < 20; i++)
      expect(guard.canActivate(context('USER'))).toBe(true);
    expect(() => guard.canActivate(context('USER'))).toThrow();
    for (let i = 0; i < 60; i++)
      expect(guard.canActivate(context('ADMIN'))).toBe(true);
    expect(() => guard.canActivate(context('ADMIN'))).toThrow();
    clock.mockReturnValue(61000);
    expect(guard.canActivate(context('USER'))).toBe(true);
    clock.mockRestore();
  });
});
