import { ConfigService } from '@nestjs/config';
import { AuthAccountsService } from './auth-accounts.service.js';
import { AuthSupportService } from './auth-support.service.js';
import { PasswordService } from './password.service.js';
import type { AuthOtpService } from './auth-otp.service.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { SessionService } from './session.service.js';
import type { Request, Response } from 'express';

describe('Auth rate limits and password login', () => {
  afterEach(() => vi.useRealTimers());

  it('limits attempts by source IP', () => {
    const support = new AuthSupportService(new ConfigService());
    for (let index = 0; index < 20; index++)
      support.checkRateLimit('otp-send:ip', 20, 3600000);
    expect(() => support.checkRateLimit('otp-send:ip', 20, 3600000)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
  });

  it('accepts requests again after the rate window expires', () => {
    vi.useFakeTimers();
    const support = new AuthSupportService(new ConfigService());
    support.checkRateLimit('key', 1, 3600000);
    expect(() => support.checkRateLimit('key', 1, 3600000)).toThrow();
    vi.advanceTimersByTime(3600000);
    expect(() => support.checkRateLimit('key', 1, 3600000)).not.toThrow();
  });

  it('rejects the dummy password for an unknown account', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const support = new AuthSupportService(new ConfigService());
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
