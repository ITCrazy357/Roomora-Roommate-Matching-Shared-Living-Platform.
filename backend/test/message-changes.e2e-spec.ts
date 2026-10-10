import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { NotificationsService } from '../src/modules/communications/notifications.service.js';

describe('Message edits and deletions (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const users: string[] = [];
  const agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000';
  let conversationId: string;
  const base = () => `/api/v1/conversations/${conversationId}`;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    vi.spyOn(app.get(NotificationsService), 'onModuleInit').mockImplementation(
      () => {},
    );
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const password = `Roomora-${randomUUID()}`;
    const passwordHash = await app.get(PasswordService).hash(password);
    for (let index = 0; index < 3; index++) {
      const id = randomUUID();
      users.push(id);
      const email = `message-change-${id}@example.test`;
      await prisma.user.create({
        data: {
          id,
          email,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: 'Message changes' } },
        },
      });
      const agent = request.agent(app.getHttpServer());
      agents.push(agent);
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ email, password })
        .expect(200);
    }
    const connection = (
      await agents[0]
        .post('/api/v1/connections')
        .set('Origin', origin)
        .send({ targetId: users[1] })
        .expect(201)
    ).body;
    await agents[1]
      .post(`/api/v1/connections/${connection.id}/accept`)
      .set('Origin', origin)
      .send({ version: connection.version })
      .expect(201);
    conversationId = (
      await prisma.conversation.findUniqueOrThrow({
        where: { connectionId: connection.id },
      })
    ).id;
  }, 30000);

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app?.close();
    vi.restoreAllMocks();
  });

  async function send(text: string) {
    const body = { clientId: randomUUID(), text };
    const message = (
      await agents[0]
        .post(base() + '/messages')
        .set('Origin', origin)
        .send(body)
        .expect(201)
    ).body;
    return { message, body, url: base() + `/messages/${message.id}` };
  }

  it('allows only the sender to edit, validates text and preserves send retries', async () => {
    const { message, body, url } = await send('Original text');
    const edit = { version: message.version, text: 'Updated text' };
    await request(app.getHttpServer())
      .patch(url)
      .set('Origin', origin)
      .send(edit)
      .expect(401);
    for (const agent of [agents[1], agents[2]]) {
      await agent.patch(url).set('Origin', origin).send(edit).expect(404);
      await agent
        .delete(url)
        .set('Origin', origin)
        .send({ version: 1 })
        .expect(404);
    }
    for (const text of ['   ', 'x'.repeat(2001)])
      await agents[0]
        .patch(url)
        .set('Origin', origin)
        .send({ version: 1, text })
        .expect(400);
    await agents[0]
      .patch(url)
      .set('Origin', origin)
      .send({ ...edit, senderId: users[1] })
      .expect(400);
    await agents[0]
      .patch(base() + `/messages/${randomUUID()}`)
      .set('Origin', origin)
      .send(edit)
      .expect(404);
    const updated = (
      await agents[0].patch(url).set('Origin', origin).send(edit).expect(200)
    ).body;
    expect(updated).toMatchObject({
      text: edit.text,
      version: 2,
      number: message.number,
    });
    expect(updated.editedAt).not.toBeNull();
    await agents[0].patch(url).set('Origin', origin).send(edit).expect(409);
    await agents[0]
      .delete(url)
      .set('Origin', origin)
      .send({ version: 1 })
      .expect(409);
    const peer = (await agents[1].get(base() + '/messages').expect(200)).body;
    expect(
      peer.items.find((item: { id: string }) => item.id === message.id).text,
    ).toBe(edit.text);
    const retry = (
      await agents[0]
        .post(base() + '/messages')
        .set('Origin', origin)
        .send(body)
        .expect(201)
    ).body;
    expect(retry).toMatchObject({ id: message.id, text: edit.text });
  });

  it('serializes concurrent edits so exactly one version wins', async () => {
    const { url } = await send('Concurrent edits');
    const results = await Promise.all(
      ['First edit', 'Second edit'].map((text) =>
        agents[0].patch(url).set('Origin', origin).send({ version: 1, text }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it('deletes audio for both people, excludes it from unread and never restores it on retry', async () => {
    const clientId = randomUUID();
    const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
    const upload = () =>
      agents[0]
        .post(base() + '/messages')
        .set('Origin', origin)
        .field('clientId', clientId)
        .field('text', '')
        .attach('audio', audio, {
          filename: 'voice.webm',
          contentType: 'audio/webm',
        });
    const message = (await upload().expect(201)).body;
    const fileUrl = base() + `/attachments/${message.attachments[0].id}`;
    await agents[1].get(fileUrl).expect(200);
    const before = (await agents[1].get('/api/v1/conversations').expect(200))
      .body.unread;
    const url = base() + `/messages/${message.id}`;
    const deleted = (
      await agents[0]
        .delete(url)
        .set('Origin', origin)
        .send({ version: 1 })
        .expect(200)
    ).body;
    expect(deleted).toMatchObject({
      text: '',
      attachments: [],
      number: message.number,
      version: 2,
    });
    expect(deleted.deletedAt).not.toBeNull();
    for (const agent of [agents[0], agents[1]])
      await agent.get(fileUrl).expect(404);
    expect(
      await prisma.messageAttachment.count({
        where: { messageId: message.id },
      }),
    ).toBe(0);
    expect(
      (await agents[1].get('/api/v1/conversations').expect(200)).body.unread,
    ).toBe(before - 1);
    expect(
      (await agents[1].get('/api/v1/conversations').expect(200)).body.items[0]
        .lastMessage.deletedAt,
    ).not.toBeNull();
    expect((await upload().expect(201)).body).toMatchObject({
      id: message.id,
      deletedAt: deleted.deletedAt,
      attachments: [],
    });
    expect(
      (
        await agents[0]
          .delete(url)
          .set('Origin', origin)
          .send({ version: 1 })
          .expect(200)
      ).body.version,
    ).toBe(2);
    await agents[0]
      .patch(url)
      .set('Origin', origin)
      .send({ version: 2, text: 'Restore' })
      .expect(409);
    const peer = (
      await agents[1]
        .get(base() + `/messages?after=${message.number - 1}`)
        .expect(200)
    ).body;
    expect(peer.items[0].deletedAt).toBe(deleted.deletedAt);
  });

  it('keeps retries safe for text messages sent before content hashes existed', async () => {
    const { message, body, url } = await send('Legacy text');
    await prisma.message.update({
      where: { id: message.id },
      data: { contentHash: '' },
    });
    const edited = (
      await agents[0]
        .patch(url)
        .set('Origin', origin)
        .send({ version: 1, text: 'Edited legacy text' })
        .expect(200)
    ).body;
    expect(edited).not.toHaveProperty('contentHash');
    expect(
      (
        await agents[0]
          .post(base() + '/messages')
          .set('Origin', origin)
          .send(body)
          .expect(201)
      ).body.text,
    ).toBe('Edited legacy text');
    await agents[0]
      .delete(url)
      .set('Origin', origin)
      .send({ version: 2 })
      .expect(200);
    expect(
      (
        await agents[0]
          .post(base() + '/messages')
          .set('Origin', origin)
          .send(body)
          .expect(201)
      ).body.deletedAt,
    ).not.toBeNull();
  });

  it('denies edit and delete after blocking', async () => {
    const { url } = await send('Before block');
    await agents[1]
      .post(`/api/v1/user-safety/${users[0]}/block`)
      .set('Origin', origin)
      .expect(201);
    await agents[0]
      .patch(url)
      .set('Origin', origin)
      .send({ version: 1, text: 'After block' })
      .expect(404);
    await agents[0]
      .delete(url)
      .set('Origin', origin)
      .send({ version: 1 })
      .expect(404);
  });
});
