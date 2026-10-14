import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { validateEnvironment } from '../src/config/environment.validation.js';
import { RedisService } from '../src/redis/redis.service.js';
import { ChatService } from '../src/modules/support/chat.service.js';

describe.skipIf(!process.env.REDIS_TEST_URL)(
  'Shared Redis over HTTP (two API instances)',
  () => {
    const prefix = `http-test-${randomUUID()}`;
    const apps: INestApplication[] = [];
    const origin = 'http://localhost:3000';
    const chat = { answer: vi.fn().mockResolvedValue({ answer: 'FAQ test' }) };
    beforeAll(async () => {
      const settings = new ConfigService(
        validateEnvironment({
          ...process.env,
          NODE_ENV: 'test',
          FRONTEND_ORIGIN: origin,
          REDIS_URL: process.env.REDIS_TEST_URL,
          REDIS_KEY_PREFIX: prefix,
        }),
      );
      for (let i = 0; i < 2; i++) {
        const module = await Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(ConfigService)
          .useValue(settings)
          .overrideProvider(ChatService)
          .useValue(chat)
          .compile();
        const app = module.createNestApplication();
        apps.push(app);
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(
          new ValidationPipe({ whitelist: true, transform: true }),
        );
        // Keep each server open throughout concurrent Supertest requests.
        await app.listen(0, '127.0.0.1');
      }
    });
    afterAll(async () => {
      for (const app of apps) await app.close();
      const admin = createClient({ url: process.env.REDIS_TEST_URL });
      admin.on('error', () => {});
      try {
        await admin.connect();
        const keys = await admin.keys(`${prefix}:*`);
        if (keys.length) await admin.del(keys);
      } finally {
        if (admin.isOpen) admin.destroy();
      }
    });

    const post = (index: number, path: string, body: object) =>
      request(apps[index].getHttpServer())
        .post(`/api/v1/${path}`)
        .set('Origin', origin)
        .send(body);

    it('allows only 20 chatbot requests across two backends under concurrency', async () => {
      const results = await Promise.all(
        Array.from({ length: 80 }, (_, i) =>
          post(i % 2, 'support/chat', { message: 'Cách đăng tin?' }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(20);
      const blocked = results.filter((r) => r.status === 429);
      expect(blocked).toHaveLength(60);
      expect(blocked.every((r) => r.body.code === 'CHAT_RATE_LIMITED')).toBe(
        true,
      );
      expect(chat.answer).toHaveBeenCalledTimes(20);
    });

    it('awaits the shared login limit before querying passwords', async () => {
      const results = [];
      for (let i = 0; i < 20; i++)
        results.push(
          await post(i % 2, 'auth/login', {
            email: `${prefix}@example.test`,
            password: 'invalid-password-2026',
          }),
        );
      expect(results.filter((r) => r.status === 401)).toHaveLength(10);
      expect(results.filter((r) => r.status === 429)).toHaveLength(10);
    });

    it('returns 503 on a lost connection and preserves counters after reconnect', async () => {
      const redis = apps[1].get(RedisService);
      redis.onModuleDestroy();
      await request(apps[1].getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);
      const unavailable = await post(1, 'support/chat', {
        message: 'Cách đăng tin?',
      }).expect(503);
      expect(unavailable.body.code).toBe('RATE_LIMIT_UNAVAILABLE');
      await redis.onModuleInit();
      await request(apps[1].getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);
      await post(1, 'support/chat', { message: 'Cách đăng tin?' }).expect(429);
      expect(chat.answer).toHaveBeenCalledTimes(20);
    });
  },
);
