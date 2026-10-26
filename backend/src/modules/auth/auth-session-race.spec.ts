import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { PrismaService } from '../../database/prisma.service.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { AuthAccountsService } from './auth-accounts.service.js';
import type { AuthOtpService } from './auth-otp.service.js';
import { AuthSupportService } from './auth-support.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

function loginFixture() {
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'session-race@example.test',
    passwordHash: 'verified-password-hash' as string | null,
    emailVerifiedAt: new Date(),
    lockedAt: null as Date | null,
    closedAt: null as Date | null,
    profile: null,
  };
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: {
      findUniqueOrThrow: vi
        .fn()
        .mockImplementation(({ select }: { select: Record<string, boolean> }) =>
          Promise.resolve(
            Object.fromEntries(
              Object.keys(select).map((key) => [
                key,
                user[key as keyof typeof user],
              ]),
            ),
          ),
        ),
    },
    session: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    user: {
      findUnique: vi
        .fn()
        .mockImplementation(() => Promise.resolve({ ...user })),
    },
    $transaction: vi
      .fn()
      .mockImplementation((action: (tx: typeof transaction) => Promise<void>) =>
        action(transaction),
      ),
  } as unknown as PrismaService;
  const config = new ConfigService({ NODE_ENV: 'test' });
  const support = new AuthSupportService(
    config,
    new RateLimitService(new RedisService(config)),
  );
  const passwords = new PasswordService();
  const verification = vi.spyOn(passwords, 'verify').mockResolvedValue(true);
  const sessions = new SessionService(prisma, config);
  const accounts = new AuthAccountsService(
    prisma,
    passwords,
    sessions,
    support,
    {} as AuthOtpService,
  );
  const request = { ip: '127.0.0.1', headers: {} } as Request;
  const cookie = vi.fn();
  const response = { cookie } as unknown as Response;
  const login = () =>
    accounts.login(
      { email: user.email, password: 'Mat-khau-truoc-reset-2026' },
      request,
      response,
    );
  return {
    user,
    transaction,
    verification,
    sessions,
    request,
    response,
    cookie,
    login,
  };
}

describe('Password login and concurrent credential changes', () => {
  it.each(['replacement-password-hash', null])(
    'rejects a verified password when its stored hash changes to %s before session creation',
    async (changedHash) => {
      const fixture = loginFixture();
      fixture.verification.mockImplementationOnce(() => {
        // Reset commits after the login read/verification, before its transaction.
        fixture.user.passwordHash = changedHash;
        return Promise.resolve(true);
      });

      await expect(fixture.login()).rejects.toMatchObject({
        status: 401,
        response: { code: 'INVALID_CREDENTIALS' },
      });
      expect(fixture.transaction.session.create).not.toHaveBeenCalled();
      expect(fixture.cookie).not.toHaveBeenCalled();
    },
  );

  it('creates a session when the verified password is still current', async () => {
    const fixture = loginFixture();

    await expect(fixture.login()).resolves.toMatchObject({
      user: { id: fixture.user.id, hasPassword: true },
    });
    expect(fixture.transaction.session.create).toHaveBeenCalledOnce();
    expect(fixture.cookie).toHaveBeenCalledOnce();
  });

  it('rejects an incorrect password without creating a session', async () => {
    const fixture = loginFixture();
    fixture.verification.mockResolvedValueOnce(false);

    await expect(fixture.login()).rejects.toMatchObject({
      status: 401,
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(fixture.transaction.session.create).not.toHaveBeenCalled();
    expect(fixture.cookie).not.toHaveBeenCalled();
  });

  it.each([
    { field: 'lockedAt', code: 'ACCOUNT_LOCKED' },
    { field: 'closedAt', code: 'ACCOUNT_CLOSED' },
  ] as const)(
    'rejects an account that becomes $field before session creation',
    async ({ field, code }) => {
      const fixture = loginFixture();
      fixture.verification.mockImplementationOnce(() => {
        fixture.user[field] = new Date();
        return Promise.resolve(true);
      });

      await expect(fixture.login()).rejects.toMatchObject({
        status: 403,
        response: { code },
      });
      expect(fixture.transaction.session.create).not.toHaveBeenCalled();
      expect(fixture.cookie).not.toHaveBeenCalled();
    },
  );

  it('still allows a passwordless session for independently verified Google or OTP authentication', async () => {
    const fixture = loginFixture();
    fixture.user.passwordHash = null;

    await expect(
      fixture.sessions.create(
        fixture.user.id,
        fixture.request,
        fixture.response,
      ),
    ).resolves.toBeUndefined();
    expect(fixture.transaction.session.create).toHaveBeenCalledOnce();
    expect(fixture.cookie).toHaveBeenCalledOnce();
  });
});
