import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';
import { AuthAccountsService } from './auth-accounts.service.js';
import { AuthSupportService } from './auth-support.service.js';
import { PasswordService } from './password.service.js';
import type { AuthOtpService } from './auth-otp.service.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { SessionService } from './session.service.js';
import type { Request, Response } from 'express';

describe('Auth rate limits and password login', () => {
  afterEach(() => vi.useRealTimers());

  const supportService = () =>
    new AuthSupportService(
      new ConfigService(),
      new RateLimitService(new RedisService(new ConfigService())),
    );

  it('limits attempts by source IP', async () => {
    const support = supportService();
    for (let index = 0; index < 20; index++)
      await support.checkRateLimit('otp-send:ip', 20, 3600000);
    await expect(
      support.checkRateLimit('otp-send:ip', 20, 3600000),
    ).rejects.toThrow(expect.objectContaining({ status: 429 }));
  });

  it('accepts requests again after the rate window expires', async () => {
    vi.useFakeTimers();
    const support = supportService();
    await support.checkRateLimit('key', 1, 3600000);
    await expect(support.checkRateLimit('key', 1, 3600000)).rejects.toThrow();
    vi.advanceTimersByTime(3600000);
    await expect(
      support.checkRateLimit('key', 1, 3600000),
    ).resolves.toBeUndefined();
  });

  it('rejects the dummy password for an unknown account', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const support = supportService();
    const accounts = new AuthAccountsService(
      prisma,
      new PasswordService(),
      {} as SessionService,
      support,
      {} as AuthOtpService,
    );
    await expect(
      accounts.login(
        {
          email: 'missing@example.test',
          password: 'roomora-invalid-account-password',
        },
        { ip: '127.0.0.1' } as Request,
        {} as Response,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});
