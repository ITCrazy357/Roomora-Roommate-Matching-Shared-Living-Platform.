import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthOtpService } from '../src/modules/auth/auth-otp.service.js';
import { AuthSupportService } from '../src/modules/auth/auth-support.service.js';
import { RateLimitService } from '../src/redis/rate-limit.service.js';
import { MailService } from '../src/modules/auth/mail.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { hashToken, randomToken } from '../src/modules/auth/token.utils.js';

describe('OTP authentication (PostgreSQL e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let otp: AuthOtpService;
  let mail: MailService;
  const prefix = `otp-${randomUUID()}`;
  const origin = 'http://localhost:3000';
  const codes = new Map<string, string>();
  const password = 'Mat-khau-an-toan-2026';
  let sequence = 0;
  const req = () => ({ ip: `192.0.2.${++sequence}` }) as Request;
  const post = (path: string, body: unknown) =>
    request(app.getHttpServer())
      .post(`/api/v1/auth/${path}`)
      .set('Origin', origin)
      .send(body);

  async function account(verified = true, googleOnly = false) {
    const email = `${prefix}-${++sequence}@example.test`;
    return prisma.user.create({
      data: {
        email,
        passwordHash: googleOnly
          ? null
          : await app.get(PasswordService).hash(password),
        emailVerifiedAt: verified ? new Date() : null,
        profile: { create: { displayName: 'OTP E2E' } },
        ...(googleOnly
          ? { googleAccount: { create: { googleId: randomUUID() } } }
          : {}),
      },
    });
  }
  async function challenge(
    email: string,
    type: 'PASSWORD_RESET' | 'EMAIL_VERIFICATION' = 'PASSWORD_RESET',
  ) {
    const result = await otp.issue(email, type, req());
    return { challengeId: result.challengeId, code: codes.get(email)! };
  }
  async function allowResend(
    email: string,
    type: 'PASSWORD_RESET' | 'EMAIL_VERIFICATION' = 'PASSWORD_RESET',
  ) {
    await prisma.authOtp.update({
      where: { email_type: { email, type } },
      data: { lastSentAt: new Date(Date.now() - 61000) },
    });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    prisma = app.get(PrismaService);
    otp = app.get(AuthOtpService);
    mail = app.get(MailService);
    vi.spyOn(mail, 'sendVerification').mockImplementation(
      async (email, code) => {
        codes.set(email, code);
      },
    );
    vi.spyOn(mail, 'sendPasswordReset').mockImplementation(
      async (email, code) => {
        codes.set(email, code);
      },
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  it('generates six digits, stores HMAC only, validates DTO, separates purpose and consumes once', async () => {
    const user = await account(false);
    const dto = await challenge(user.email, 'EMAIL_VERIFICATION');
    expect(dto.code).toMatch(/^[0-9]{6}$/);
    const saved = await prisma.authOtp.findUniqueOrThrow({
      where: { challengeId: dto.challengeId },
    });
    expect(saved.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.codeHash).not.toBe(hashToken(dto.code));
    await post('email-verification/confirm', { ...dto, code: 123456 }).expect(
      400,
    );
    await post('email-verification/confirm', { ...dto, role: 'ADMIN' }).expect(
      400,
    );
    await post('password/verify', dto).expect(403);
    const response = await post('email-verification/confirm', dto).expect(200);
    expect(response.body.user).toMatchObject({
      emailVerified: true,
      hasPassword: true,
    });
    expect(response.body.user.passwordHash).toBeUndefined();
    await post('email-verification/confirm', dto).expect(403);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it('persists five failed attempts across concurrent requests and backend instances', async () => {
    const user = await account();
    const dto = await challenge(user.email);
    const other = new AuthOtpService(
      prisma,
      app.get(ConfigService),
      new AuthSupportService(app.get(ConfigService), app.get(RateLimitService)),
      mail,
    );
    const wrong = { ...dto, code: dto.code === '000000' ? '000001' : '000000' };
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        (index % 2 ? other : otp).consume(
          wrong,
          'PASSWORD_RESET',
          req(),
          async () => true,
        ),
      ),
    );
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    const saved = await prisma.authOtp.findUniqueOrThrow({
      where: { challengeId: dto.challengeId },
    });
    expect(saved.attempts).toBe(5);
    expect(saved.consumedAt).not.toBeNull();
    await post('password/verify', dto).expect(403);
  });

  it('lets a newly registered user verify even if a dummy challenge used the send quota', async () => {
    const email = `${prefix}-registration@example.test`;
    const dummy = await otp.issue(email, 'EMAIL_VERIFICATION', req());
    await prisma.authOtp.update({
      where: { challengeId: dummy.challengeId },
      data: { sendCount: 5 },
    });
    const registration = await post('register', {
      email,
      password,
      displayName: 'Đăng ký OTP',
    }).expect(201);
    const current = await prisma.authOtp.findUniqueOrThrow({
      where: { challengeId: registration.body.challengeId },
    });
    expect(current.sendCount).toBe(1);
    expect(registration.body.emailSent).toBe(true);
    await post('email-verification/confirm', {
      challengeId: current.challengeId,
      code: codes.get(email),
    }).expect(200);
  });

  it('allows only one winner for concurrent correct OTP submissions', async () => {
    const user = await account();
    const dto = await challenge(user.email);
    const responses = await Promise.all([
      post('password/verify', dto),
      post('password/verify', dto),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 403]);
    expect(
      await prisma.authToken.count({
        where: {
          userId: user.id,
          type: 'PASSWORD_RESET_GRANT',
          consumedAt: null,
        },
      }),
    ).toBe(1);
  });

  it('enforces persistent cooldown and send limits, rotates challenges and rejects expired codes', async () => {
    const user = await account();
    const original = await challenge(user.email);
    await expect(
      otp.issue(user.email, 'PASSWORD_RESET', req()),
    ).rejects.toMatchObject({ status: 429 });
    await allowResend(user.email);
    const second = new AuthOtpService(
      prisma,
      app.get(ConfigService),
      new AuthSupportService(app.get(ConfigService), app.get(RateLimitService)),
      mail,
    );
    const issued = await Promise.allSettled([
      otp.issue(user.email, 'PASSWORD_RESET', req()),
      second.issue(user.email, 'PASSWORD_RESET', req()),
    ]);
    expect(
      issued.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      issued.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await post('password/verify', original).expect(403);
    for (let index = 0; index < 3; index++) {
      await allowResend(user.email);
      await challenge(user.email);
    }
    await allowResend(user.email);
    await expect(
      second.issue(user.email, 'PASSWORD_RESET', req()),
    ).rejects.toMatchObject({ status: 429 });
    const current = await prisma.authOtp.findUniqueOrThrow({
      where: { email_type: { email: user.email, type: 'PASSWORD_RESET' } },
    });
    await prisma.authOtp.update({
      where: { id: current.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await post('password/verify', {
      challengeId: current.challengeId,
      code: codes.get(user.email),
    }).expect(403);
    await prisma.authOtp.update({
      where: { id: current.id },
      data: { sendWindowAt: new Date(Date.now() - 3601000) },
    });
    await expect(
      second.issue(user.email, 'PASSWORD_RESET', req()),
    ).resolves.toHaveProperty('challengeId');
  });

  it('keeps unknown and Google-only responses generic and never creates a Google password', async () => {
    const google = await account(true, true);
    const missing = `${prefix}-missing@example.test`;
    const unknown = await post('password/forgot', { email: missing }).expect(
      200,
    );
    const onlyGoogle = await post('password/forgot', {
      email: google.email,
    }).expect(200);
    expect(Object.keys(onlyGoogle.body).sort()).toEqual(
      Object.keys(unknown.body).sort(),
    );
    expect(onlyGoogle.body.message).toBe(unknown.body.message);
    expect(onlyGoogle.body.emailSent).toBeUndefined();
    expect(onlyGoogle.body.developmentOtp).toBeUndefined();
    expect(codes.has(google.email)).toBe(false);
    await expect(
      otp.issue(missing, 'PASSWORD_RESET', req()),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      otp.issue(google.email, 'PASSWORD_RESET', req()),
    ).rejects.toMatchObject({ status: 429 });
    await post('password/verify', {
      challengeId: onlyGoogle.body.challengeId,
      code: '000000',
    }).expect(403);
    const token = randomToken();
    await prisma.authToken.create({
      data: {
        userId: google.id,
        type: 'PASSWORD_RESET_GRANT',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await post('password/reset', { token, newPassword: password }).expect(403);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: google.id } }))
        .passwordHash,
    ).toBeNull();
  });

  it('resets a password linked with Google, revokes sessions and prevents concurrent proof reuse', async () => {
    const user = await account();
    await prisma.googleAccount.create({
      data: { userId: user.id, googleId: randomUUID() },
    });
    const login = await post('login', { email: user.email, password }).expect(
      200,
    );
    expect(login.body.user.hasPassword).toBe(true);
    const dto = await challenge(user.email);
    const proof = await post('password/verify', dto).expect(200);
    expect(proof.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const newPassword = 'Mat-khau-thay-doi-2026';
    const responses = await Promise.all([
      post('password/reset', { token: proof.body.token, newPassword }),
      post('password/reset', { token: proof.body.token, newPassword }),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 403]);
    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    await post('login', { email: user.email, password }).expect(401);
    await post('login', { email: user.email, password: newPassword }).expect(
      200,
    );
  });

  it('rejects an in-flight old-password login after reset commits without issuing a session cookie', async () => {
    const user = await account();
    const initialLogin = await post('login', {
      email: user.email,
      password,
    }).expect(200);
    const dto = await challenge(user.email);
    const proof = await post('password/verify', dto).expect(200);
    const newPassword = 'Mat-khau-sau-reset-2026';
    const passwords = app.get(PasswordService);
    const verify = passwords.verify.bind(passwords);
    const pausedLogin = vi
      .spyOn(passwords, 'verify')
      .mockImplementationOnce(async (input, hash) => {
        const matches = await verify(input, hash);
        // Finish a real HTTP reset after verification, before session creation.
        await post('password/reset', {
          token: proof.body.token,
          newPassword,
        }).expect(200);
        return matches;
      });
    try {
      const staleLogin = await post('login', {
        email: user.email,
        password,
      }).expect(401);
      expect(staleLogin.body.code).toBe('INVALID_CREDENTIALS');
      expect(staleLogin.headers['set-cookie']).toBeUndefined();
    } finally {
      pausedLogin.mockRestore();
    }
    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    const oldCookie = initialLogin.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', oldCookie)
      .expect(401);
    await post('login', { email: user.email, password }).expect(401);
    await post('login', { email: user.email, password: newPassword }).expect(
      200,
    );
  });

  it('rejects expired reset grants and all old link tokens', async () => {
    const user = await account();
    for (const type of [
      'PASSWORD_RESET',
      'EMAIL_VERIFICATION',
      'PASSWORD_RESET_GRANT',
    ] as const) {
      const token = randomToken();
      await prisma.authToken.create({
        data: {
          userId: user.id,
          type,
          tokenHash: hashToken(token),
          expiresAt: new Date(
            Date.now() + (type === 'PASSWORD_RESET_GRANT' ? -1000 : 60000),
          ),
        },
      });
      await post('password/reset', { token, newPassword: password }).expect(
        403,
      );
      await post('email-verification/confirm', { token }).expect(400);
    }
  });

  it('cannot verify or reset a locked account even with a previously issued code or grant', async () => {
    const user = await account();
    const dto = await challenge(user.email);
    const proof = await post('password/verify', dto).expect(200);
    await allowResend(user.email);
    const next = await challenge(user.email);
    const admin = await account();
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: admin.email, password })
      .expect(200);
    await agent
      .patch(`/api/v1/admin/users/${user.id}/lock`)
      .set('Origin', origin)
      .send({ locked: true, version: 1, reason: 'Khóa thử nghiệm OTP' })
      .expect(200);
    await post('password/verify', next).expect(403);
    await post('password/reset', {
      token: proof.body.token,
      newPassword: password,
    }).expect(403);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .lockedAt,
    ).not.toBeNull();
    await agent
      .patch(`/api/v1/admin/users/${user.id}/lock`)
      .set('Origin', origin)
      .send({ locked: false, version: 2, reason: 'Mở khóa thử nghiệm OTP' })
      .expect(200);
    await post('password/verify', next).expect(403);
    await post('password/reset', {
      token: proof.body.token,
      newPassword: password,
    }).expect(403);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: prefix } },
      select: { id: true },
    });
    await prisma.adminAction.deleteMany({
      where: { actorId: { in: users.map((user) => user.id) } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await prisma.authOtp.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await app.close();
  });
});
