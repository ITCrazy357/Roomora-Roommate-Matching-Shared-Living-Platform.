import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { ChatService } from '../src/modules/support/chat.service.js';

describe('Support chatbot and ADMIN handoff (HTTP/PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ids: string[] = [];
  const prefix = `chat-${randomUUID()}`;
  const password = `Roomora-${randomUUID()}`;
  const origin = 'http://localhost:3000';
  const base = '/api/v1';
  let owner: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let ticketId: string;
  const question = 'Tài khoản của tôi bị khóa, tôi cần ADMIN kiểm tra';
  const subject = `${prefix} Hỗ trợ từ chatbot`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ChatService)
      .useValue(new ChatService(new ConfigService({ OPENAI_API_KEY: '' })))
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
    const hash = await app.get(PasswordService).hash(password);
    for (const role of ['owner', 'other', 'admin']) {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-${role}@example.test`,
          passwordHash: hash,
          role: role === 'admin' ? 'ADMIN' : 'USER',
          emailVerifiedAt: new Date(),
          profile: {
            create: { displayName: role, onboardingCompletedAt: new Date() },
          },
        },
      });
      ids.push(user.id);
    }
    const agents = [];
    for (const role of ['owner', 'other', 'admin']) {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post(`${base}/auth/login`)
        .set('Origin', origin)
        .send({ email: `${prefix}-${role}@example.test`, password })
        .expect(200);
      agents.push(agent);
    }
    [owner, other, admin] = agents;
  });

  afterAll(async () => {
    if (prisma && ids.length) {
      await prisma.adminAction.deleteMany({ where: { actorId: { in: ids } } });
      await prisma.supportTicket.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('serves only known public guidance without login', async () => {
    const result = await request(app.getHttpServer())
      .post(`${base}/support/chat`)
      .set('Origin', origin)
      .send({ message: 'Tôi quên mật khẩu' })
      .expect(200);
    expect(result.body.kind).toBe('answer');
    expect(result.body.source.href).toBe('/quen-mat-khau');
  });

  it('rejects bad origin and fields not in the DTO', async () => {
    await request(app.getHttpServer())
      .post(`${base}/support/chat`)
      .set('Origin', 'https://untrusted.example')
      .send({ message: 'Tôi quên mật khẩu' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/support/chat`)
      .set('Origin', origin)
      .send({ message: 'Tôi quên mật khẩu', topic: 'anything' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/support/chat`)
      .set('Origin', origin)
      .send({ message: '  ' })
      .expect(400);
  });

  it('hands off individual issues without creating a ticket automatically', async () => {
    const before = await prisma.supportTicket.count({
      where: { userId: ids[0] },
    });
    const result = await owner
      .post(`${base}/support/chat`)
      .set('Origin', origin)
      .send({ message: question })
      .expect(200);
    expect(result.body.kind).toBe('handoff');
    expect(
      await prisma.supportTicket.count({ where: { userId: ids[0] } }),
    ).toBe(before);
  });

  it('requires login before sending a support request', async () => {
    await request(app.getHttpServer())
      .post(`${base}/support/tickets`)
      .set('Origin', origin)
      .send({ subject, body: question })
      .expect(401);
  });

  it('stores a confirmed handoff as an OPEN ticket with the original question', async () => {
    const response = await owner
      .post(`${base}/support/tickets`)
      .set('Origin', origin)
      .send({ subject, body: `Câu hỏi từ trợ lý Roomora:\n${question}` })
      .expect(201);
    ticketId = response.body.id as string;
    expect(response.body.status).toBe('OPEN');
    const detail = await owner
      .get(`${base}/support/tickets/${ticketId}`)
      .expect(200);
    expect(detail.body.messages[0].body).toContain(question);
  });

  it('makes the ticket visible to ADMIN and isolates it from another USER', async () => {
    const queue = await admin
      .get(`${base}/admin/support/tickets?search=${encodeURIComponent(prefix)}`)
      .expect(200);
    expect(queue.body.items.map((item: { id: string }) => item.id)).toContain(
      ticketId,
    );
    await other.get(`${base}/support/tickets/${ticketId}`).expect(404);
  });

  it('lets ADMIN resolve the handoff and the owner read the reply', async () => {
    await admin
      .patch(`${base}/admin/support/tickets/${ticketId}`)
      .set('Origin', origin)
      .send({
        status: 'RESOLVED',
        version: 1,
        body: 'Đã tiếp nhận và kiểm tra yêu cầu thử nghiệm.',
      })
      .expect(200);
    const detail = await owner
      .get(`${base}/support/tickets/${ticketId}`)
      .expect(200);
    expect(detail.body.status).toBe('RESOLVED');
    expect(
      detail.body.messages.some(
        (message: { fromAdmin: boolean }) => message.fromAdmin,
      ),
    ).toBe(true);
  });
});
