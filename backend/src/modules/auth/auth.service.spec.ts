import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { MailService } from './mail.service.js';
import type { SessionService } from './session.service.js';
import type { Request, Response } from 'express';

describe('AuthService rate limits', () => {
  const createService = () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    const auth = new AuthService(
      prisma,
      new PasswordService(),
      {} as SessionService,
      {} as MailService,
      new ConfigService(),
    );
    return { auth, findUnique };
  };

  afterEach(() => vi.useRealTimers());

  it('limits a source IP even when each request uses a different email', async () => {
    const { auth, findUnique } = createService();
    const request = { ip: '127.0.0.1' } as Request;
    for (let index = 0; index < 20; index++) {
      await auth.forgotPassword(
        { email: `user-${index}@example.test` },
        request,
      );
    }
    await expect(
      auth.forgotPassword({ email: 'another@example.test' }, request),
    ).rejects.toMatchObject({ status: 429 });
    expect(findUnique).toHaveBeenCalledTimes(20);
  });

  it('accepts requests again after the rate window expires', async () => {
    vi.useFakeTimers();
    const { auth } = createService();
    const request = { ip: '127.0.0.1' } as Request;
    const dto = { email: 'user@example.test' };
    for (let index = 0; index < 5; index++)
      await auth.forgotPassword(dto, request);
    await expect(auth.forgotPassword(dto, request)).rejects.toMatchObject({
      status: 429,
    });
    vi.advanceTimersByTime(60 * 60 * 1000);
    await expect(auth.forgotPassword(dto, request)).resolves.toHaveProperty(
      'message',
    );
  });

  it('rejects the dummy password for an unknown account', async () => {
    const { auth } = createService();
    await expect(
      auth.login(
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
