import type { ExecutionContext } from '@nestjs/common';
import { ChatRateGuard } from './chat.controller.js';

describe('Chat request limit', () => {
  it('limits repeated requests, separates clients and expires the window', () => {
    const guard = new ChatRateGuard();
    let now = 1000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const context = (ip: string) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ ip }) }),
      }) as unknown as ExecutionContext;
    try {
      for (let i = 0; i < 20; i++)
        expect(guard.canActivate(context('first'))).toBe(true);
      expect(() => guard.canActivate(context('first'))).toThrow();
      expect(guard.canActivate(context('second'))).toBe(true);
      now += 60000;
      expect(guard.canActivate(context('first'))).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
});
