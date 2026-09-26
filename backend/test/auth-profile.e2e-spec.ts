import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Authentication and profile (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const origin = 'http://localhost:3000';
  const email = `phase2-e2e-${Date.now()}@example.test`;
  const password = 'Mat-khau-an-toan-2026';
  const newPassword = 'Mat-khau-moi-2026';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  it('completes account, session, privacy and password-reset flows', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent.get('/api/v1/auth/config').expect(404);
    await agent.get('/api/v1/auth/google').expect(404);
    await agent.get('/api/v1/auth/google/callback').expect(404);

    const registration = await agent
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({ email, password, displayName: 'Người dùng E2E' })
      .expect(201);
    expect(registration.body.emailSent).toBe(false);
    expect(registration.body.developmentActionUrl).toContain(
      '/xac-minh-email?token=',
    );

    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('EMAIL_NOT_VERIFIED'));

    const verificationToken = new URL(
      registration.body.developmentActionUrl as string,
    ).searchParams.get('token');
    expect(verificationToken).toBeTruthy();

    const verification = await agent
      .post('/api/v1/auth/email-verification/confirm')
      .set('Origin', origin)
      .send({ token: verificationToken })
      .expect(200);
    expect(verification.body.user.emailVerified).toBe(true);
    const userId = verification.body.user.id as string;

    await agent
      .post('/api/v1/auth/email-verification/confirm')
      .set('Origin', origin)
      .send({ token: verificationToken })
      .expect(403);

    for (const field of [
      'displayName',
      'visibility',
      'desiredAreas',
      'showBudget',
      'showDesiredAreas',
      'showLifestyle',
      'completeOnboarding',
    ]) {
      await agent
        .patch('/api/v1/profiles/me')
        .set('Origin', origin)
        .send({ [field]: null })
        .expect(400);
    }
    await agent
      .patch('/api/v1/profiles/me')
      .set('Origin', origin)
      .send({ bio: null, budgetMin: null, budgetMax: null, avatarUrl: null })
      .expect(200);
    await agent
      .patch('/api/v1/profiles/me')
      .set('Origin', origin)
      .send({ avatarUrl: 'http://example.com/avatar.png' })
      .expect(400);

    await agent
      .patch('/api/v1/profiles/me')
      .set('Origin', origin)
      .send({ userId, bio: 'should be rejected' })
      .expect(400);

    const profile = await agent
      .patch('/api/v1/profiles/me')
      .set('Origin', origin)
      .send({
        bio: 'Hồ sơ kiểm thử',
        budgetMin: 3_000_000,
        budgetMax: 6_000_000,
        desiredAreas: ['Quận 1', 'Quận 3'],
        sleepSchedule: 'EARLY_BIRD',
        visibility: 'PRIVATE',
        completeOnboarding: true,
      })
      .expect(200);
    expect(profile.body.onboardingCompleted).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/profiles/${userId}`)
      .expect(404);
    await agent
      .get(`/api/v1/profiles/${userId}`)
      .expect(200)
      .expect(({ body }) => expect(body.bio).toBe('Hồ sơ kiểm thử'));

    const sessions = await agent.get('/api/v1/auth/sessions').expect(200);
    expect(sessions.body.sessions).toHaveLength(1);
    expect(sessions.body.sessions[0].current).toBe(true);

    const forgot = await request(app.getHttpServer())
      .post('/api/v1/auth/password/forgot')
      .set('Origin', origin)
      .send({ email })
      .expect(200);
    const resetToken = new URL(
      forgot.body.developmentActionUrl as string,
    ).searchParams.get('token');

    await request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .set('Origin', origin)
      .send({ token: resetToken, newPassword })
      .expect(200);

    await agent.get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .set('Origin', origin)
      .send({ token: resetToken, newPassword })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: newPassword })
      .expect(200);
  });

  it('rejects state-changing requests from an unexpected origin', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/forgot')
      .set('Origin', 'https://malicious.example')
      .send({ email })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('ORIGIN_NOT_ALLOWED'));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });
});
