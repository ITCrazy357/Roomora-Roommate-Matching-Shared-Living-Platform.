import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { HouseChatController } from '../houses/house-chat.controller.js';
import { HouseChatService } from '../houses/house-chat.service.js';
import { CommunicationsController } from './communications.controller.js';
import { ConversationsService } from './conversations.service.js';
import { NotificationsService } from './notifications.service.js';
import { PresenceService } from './presence.service.js';
import { UpdatesService } from './updates.service.js';

// Real controllers, guards and multipart parsing; business services are fixtures.
// No database, provider or production account is involved.
describe('Chat send HTTP request limits before multipart parsing', () => {
  let app: INestApplication;
  let rates: RateLimitService;
  const send = vi.fn(() => ({ id: 'existing-fixture-message' }));
  const paths = [
    `/conversations/${randomUUID()}/messages`,
    `/houses/${randomUUID()}/messages`,
  ];
  const clientId = randomUUID();
  const auth: CanActivate = {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const userId = req.get('X-Fixture-User');
      if (!userId) throw new UnauthorizedException();
      req.auth = {
        userId,
        sessionId: 'fixture-session',
        email: 'fixture@example.test',
        role: 'USER',
      };
      return true;
    },
  };

  beforeEach(async () => {
    send.mockClear();
    rates = new RateLimitService(new RedisService(new ConfigService()));
    const module = await Test.createTestingModule({
      controllers: [CommunicationsController, HouseChatController],
      providers: [
        { provide: RateLimitService, useValue: rates },
        { provide: ConversationsService, useValue: { send } },
        { provide: HouseChatService, useValue: { send } },
        { provide: NotificationsService, useValue: {} },
        { provide: UpdatesService, useValue: {} },
        { provide: PresenceService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(auth)
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  const upload = (path: string, user = 'sender', field = 'images') =>
    request(app.getHttpServer())
      .post(path)
      .set('X-Fixture-User', user)
      .field('clientId', clientId)
      .field('text', 'same retry')
      .attach(field, Buffer.from('fixture-file'), 'fixture.png');
  const text = (path: string, user = 'sender') =>
    request(app.getHttpServer())
      .post(path)
      .set('X-Fixture-User', user)
      .send({ clientId, text: 'same retry' });

  it('counts multipart retries across both chats and blocks before Multer reads an invalid field', async () => {
    for (let index = 0; index < 30; index++)
      await upload(paths[index % 2]).expect(201);
    for (const path of paths) {
      // Without a guard, this produces a multipart error (400), not 429.
      const blocked = await upload(path, 'sender', 'unexpected').expect(429);
      expect(blocked.body.code).toBe('RATE_LIMITED');
    }
    expect(send).toHaveBeenCalledTimes(30);
    await text(paths[0]).expect(201);
    await upload(paths[1], 'another-sender').expect(201);
  });

  it('bounds total send requests across destinations and allows sending after the window expires', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    for (let index = 0; index < 60; index++)
      await text(paths[index % 2]).expect(201);
    await text(paths[0]).expect(429);
    await upload(paths[1], 'sender', 'unexpected').expect(429);
    expect(send).toHaveBeenCalledTimes(60);
    await text(paths[1], 'another-sender').expect(201);
    clock.mockReturnValue(61000);
    await upload(paths[0]).expect(201);
  });

  it('counts malformed multipart attempts instead of only successful messages', async () => {
    for (let index = 0; index < 30; index++)
      await upload(paths[index % 2], 'sender', 'unexpected').expect(400);
    await upload(paths[0]).expect(429);
    expect(send).not.toHaveBeenCalled();
  });

  it('requires authentication before consuming a quota or parsing multipart data', async () => {
    const check = vi.spyOn(rates, 'check');
    for (const path of paths)
      await request(app.getHttpServer())
        .post(path)
        .attach('unexpected', Buffer.from('fixture'), 'fixture.png')
        .expect(401);
    expect(check).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects before parsing when the configured shared limiter is unavailable', async () => {
    vi.spyOn(rates, 'check').mockRejectedValue(
      new ServiceUnavailableException({ code: 'RATE_LIMIT_UNAVAILABLE' }),
    );
    for (const path of paths) {
      const response = await upload(path, 'sender', 'unexpected').expect(503);
      expect(response.body.code).toBe('RATE_LIMIT_UNAVAILABLE');
    }
    expect(send).not.toHaveBeenCalled();
  });
});
