import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GoogleClientService } from '../src/modules/auth/google-client.service.js';
import { GoogleAuthError } from '../src/modules/auth/google-auth.error.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { hashToken } from '../src/modules/auth/token.utils.js';

describe('Google authentication (PostgreSQL e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const origin = 'http://localhost:3000';
  const prefix = `google-e2e-${randomUUID()}`;
  const email = `${prefix}@example.test`;
  const passwordEmail = `${prefix}-password@example.test`;
  const password = 'Mat-khau-Google-2026';
  const stateHashes: string[] = [];
  const identity = { googleId: prefix, email, displayName: 'Bạn Google' };
  const provider = {
    enabled: true,
    createAuthorization: async (state: string, nonce: string) => ({
      url: `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&nonce=${nonce}`,
      codeVerifier: 'test-code-verifier',
    }),
    verifyCode: vi.fn().mockResolvedValue(identity),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleClientService)
      .useValue(provider)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email: passwordEmail,
        passwordHash: await app.get(PasswordService).hash(password),
        emailVerifiedAt: new Date(),
        profile: { create: { displayName: 'Bạn dùng mật khẩu' } },
      },
    });
  });

  beforeEach(() => provider.verifyCode.mockReset().mockResolvedValue(identity));

  async function start(agent: ReturnType<typeof request.agent>, link = false) {
    const response = link
      ? await agent
          .post('/api/v1/auth/google/link')
          .set('Origin', origin)
          .send({ password })
          .expect(200)
      : await agent.get('/api/v1/auth/google').expect(302);
    const url = new URL(
      link ? (response.body.url as string) : response.headers.location,
    );
    const state = url.searchParams.get('state')!;
    stateHashes.push(hashToken(state));
    return { state, nonce: url.searchParams.get('nonce'), response };
  }

  async function passwordAgent() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: passwordEmail, password })
      .expect(200);
    return agent;
  }

  it('creates a passwordless user, issues an HttpOnly session, and logs out', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.get('/api/v1/auth/config').expect(200, { googleEnabled: true });
    const { state, nonce, response } = await start(agent);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    const callback = await agent
      .get('/api/v1/auth/google/callback')
      .query({ code: 'test-code', state })
      .expect(302);
    expect(callback.headers.location).toBe(`${origin}/onboarding`);
    expect(
      callback.headers['set-cookie'].some(
        (cookie: string) =>
          cookie.startsWith('roomora_session=') && cookie.includes('HttpOnly'),
      ),
    ).toBe(true);
    expect(provider.verifyCode).toHaveBeenCalledWith(
      'test-code',
      'test-code-verifier',
      nonce,
    );
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.user.emailVerified).toBe(true);
    expect(me.body.user.email).toBe(email);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { googleAccount: true },
    });
    expect(user.passwordHash).toBeNull();
    expect(user.googleAccount?.googleId).toBe(prefix);
    await agent.post('/api/v1/auth/logout').set('Origin', origin).expect(204);
    await agent.get('/api/v1/auth/me').expect(401);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(401);
    await agent
      .post('/api/v1/auth/password/forgot')
      .set('Origin', origin)
      .send({ email })
      .expect(200)
      .expect(({ body }) => expect(body.developmentActionUrl).toBeUndefined());
  });

  it('recognizes returning users by Google sub even if Google email changes', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.profile.update({
      where: { userId: user.id },
      data: { onboardingCompletedAt: new Date() },
    });
    provider.verifyCode.mockResolvedValueOnce({
      ...identity,
      email: `${prefix}-changed@example.test`,
    });
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent);
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ code: 'returning-code', state })
      .expect(302)
      .expect('Location', `${origin}/tai-khoan/ho-so`);
    await agent
      .get('/api/v1/auth/me')
      .expect(200)
      .expect(({ body }) => expect(body.user.id).toBe(user.id));
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('rejects missing, malformed, expired and cross-browser state', async () => {
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent);
    for (const query of [{}, { state: ['a', 'b'], code: 'code' }]) {
      await agent
        .get('/api/v1/auth/google/callback')
        .query(query)
        .expect(302)
        .expect('Location', `${origin}/dang-nhap?google=GOOGLE_STATE_INVALID`);
    }
    await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ state, code: 'stolen' })
      .expect(302)
      .expect('Location', `${origin}/dang-nhap?google=GOOGLE_STATE_INVALID`);
    await prisma.googleLoginState.update({
      where: { stateHash: hashToken(state) },
      data: { expiresAt: new Date(0) },
    });
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ state, code: 'expired' })
      .expect(302)
      .expect('Location', `${origin}/dang-nhap?google=GOOGLE_STATE_INVALID`);
    expect(provider.verifyCode).not.toHaveBeenCalled();
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('consumes cancellation state and refuses replay', async () => {
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent);
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ state, error: 'access_denied' })
      .expect(302)
      .expect('Location', `${origin}/dang-nhap?google=GOOGLE_CANCELLED`);
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ state, code: 'replay' })
      .expect(302)
      .expect('Location', `${origin}/dang-nhap?google=GOOGLE_STATE_INVALID`);
    expect(provider.verifyCode).not.toHaveBeenCalled();
  });

  it('allows at most one concurrent callback to exchange a code', async () => {
    const agent = request.agent(app.getHttpServer());
    const { state, response } = await start(agent);
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .get('/api/v1/auth/google/callback')
          .set('Cookie', cookie)
          .query({ state, code: 'one-use' })
          .expect(302),
      ),
    );
    expect(provider.verifyCode).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.headers.location).sort()).toEqual(
      [
        `${origin}/dang-nhap?google=GOOGLE_STATE_INVALID`,
        `${origin}/tai-khoan/ho-so`,
      ].sort(),
    );
  });

  it('does not create a session when token verification fails', async () => {
    provider.verifyCode.mockRejectedValueOnce(
      new GoogleAuthError('GOOGLE_TOKEN_INVALID'),
    );
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent);
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ state, code: 'invalid-token' })
      .expect(302)
      .expect('Location', `${origin}/dang-nhap?google=GOOGLE_TOKEN_INVALID`);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('never auto-links an existing password account by email', async () => {
    provider.verifyCode.mockResolvedValueOnce({
      ...identity,
      googleId: `${prefix}-password`,
      email: passwordEmail,
    });
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent);
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ state, code: 'collision' })
      .expect(302)
      .expect('Location', `${origin}/dang-nhap?google=GOOGLE_ACCOUNT_EXISTS`);
    await agent.get('/api/v1/auth/me').expect(401);
    expect(
      await prisma.googleAccount.count({
        where: { googleId: `${prefix}-password` },
      }),
    ).toBe(0);
  });

  it('requires session, trusted Origin and password before linking', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/google/link')
      .set('Origin', origin)
      .send({ password })
      .expect(401);
    const agent = await passwordAgent();
    await agent
      .post('/api/v1/auth/google/link')
      .set('Origin', 'https://evil.example')
      .send({ password })
      .expect(403);
    await agent
      .post('/api/v1/auth/google/link')
      .set('Origin', origin)
      .send({ password: 'wrong' })
      .expect(401);
    await agent
      .post('/api/v1/auth/google/link')
      .set('Origin', origin)
      .send({ password, userId: 'untrusted' })
      .expect(400);
  });

  it('rejects linking with a different Google email or a revoked session', async () => {
    const agent = await passwordAgent();
    const first = await start(agent, true);
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ state: first.state, code: 'wrong-email' })
      .expect(302)
      .expect(
        'Location',
        `${origin}/tai-khoan/cai-dat?google=GOOGLE_EMAIL_MISMATCH`,
      );
    const second = await start(agent, true);
    await agent.post('/api/v1/auth/logout').set('Origin', origin).expect(204);
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ state: second.state, code: 'revoked-session' })
      .expect(302)
      .expect(
        'Location',
        `${origin}/tai-khoan/cai-dat?google=GOOGLE_LINK_SESSION_EXPIRED`,
      );
  });

  it('links after password confirmation and permits Google or password login', async () => {
    provider.verifyCode.mockResolvedValue({
      ...identity,
      googleId: `${prefix}-password`,
      email: passwordEmail,
    });
    const agent = await passwordAgent();
    const { state } = await start(agent, true);
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ state, code: 'link' })
      .expect(302)
      .expect('Location', `${origin}/tai-khoan/cai-dat?google=linked`);
    await agent
      .get('/api/v1/auth/google/status')
      .expect(200, { enabled: true, linked: true });
    await agent.post('/api/v1/auth/logout').set('Origin', origin).expect(204);
    const login = await start(agent);
    await agent
      .get('/api/v1/auth/google/callback')
      .query({ state: login.state, code: 'linked-login' })
      .expect(302)
      .expect('Location', `${origin}/onboarding`);
    await agent
      .get('/api/v1/auth/me')
      .expect(200)
      .expect(({ body }) => expect(body.user.email).toBe(passwordEmail));
    await passwordAgent();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.googleLoginState.deleteMany({
        where: { stateHash: { in: stateHashes } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [email, passwordEmail] } },
      });
    }
    await app?.close();
  });
});
