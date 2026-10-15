import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID, createHash } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { declareIdentity } from './helpers/identity.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { NotificationsService } from '../src/modules/communications/notifications.service.js';

describe('House chat (real PostgreSQL and SSE)', () => {
  let app: INestApplication,
    prisma: PrismaService,
    houseId: string,
    cookie: string;
  const ids: string[] = [],
    agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000';
  const path = () => `/api/v1/houses/${houseId}/messages`;
  const post = (index: number, url: string, body: object = {}) =>
    agents[index].post(url).set('Origin', origin).send(body);
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
    const password = `Roomora-${randomUUID()}`,
      passwordHash = await app.get(PasswordService).hash(password);
    for (let index = 0; index < 3; index++) {
      const id = randomUUID(),
        email = `house-chat-${id}@example.test`;
      ids.push(id);
      await prisma.user.create({
        data: {
          id,
          email,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: `Chat member ${index}` } },
        },
      });
      const agent = request.agent(app.getHttpServer());
      await declareIdentity(app, id);
      agents.push(agent);
      const login = await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ email, password })
        .expect(200);
      if (index === 1) cookie = login.headers['set-cookie'][0].split(';')[0];
    }
    houseId = (
      await post(0, '/api/v1/houses', { name: 'House chat tests' }).expect(201)
    ).body.id;
    const connection = (
      await post(0, '/api/v1/connections', { targetId: ids[1] }).expect(201)
    ).body;
    await post(1, `/api/v1/connections/${connection.id}/accept`, {
      version: connection.version,
    }).expect(201);
    const invited = (
      await post(0, `/api/v1/houses/${houseId}/invites`, {
        userId: ids[1],
      }).expect(201)
    ).body;
    await post(
      1,
      `/api/v1/houses/invites/${invited.invites[0].id}/accept`,
    ).expect(201);
  }, 30000);
  afterAll(async () => {
    if (prisma && houseId)
      await prisma.house.delete({ where: { id: houseId } });
    if (prisma) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
    vi.restoreAllMocks();
  });
  it('requires current membership and returns the role below each sender identity', async () => {
    await request(app.getHttpServer()).get(path()).expect(401);
    await agents[2].get(path()).expect(404);
    await post(2, path(), { clientId: randomUUID(), text: 'Forbidden' }).expect(
      404,
    );
    const row = (
      await post(0, path(), {
        clientId: randomUUID(),
        text: 'Chào cả nhà',
      }).expect(201)
    ).body;
    expect(row.sender.role).toBe('OWNER');
    expect(row).not.toHaveProperty('contentHash');
    const member = (
      await post(1, path(), {
        clientId: randomUUID(),
        text: 'Xin chào',
      }).expect(201)
    ).body;
    expect(member.sender.role).toBe('MEMBER');
    expect((await agents[1].get(path()).expect(200)).body.items).toHaveLength(
      2,
    );
  });
  it('deduplicates concurrent retries, edits only own messages and preserves tombstones on retry', async () => {
    const body = { clientId: randomUUID(), text: 'Nội dung ban đầu' };
    const replies = await Promise.all([
      post(0, path(), body),
      post(0, path(), body),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    expect(replies[0].body.id).toBe(replies[1].body.id);
    expect(replies[0].body).not.toHaveProperty('contentHash');
    const row = replies[0].body,
      url = path() + '/' + row.id;
    await agents[1]
      .patch(url)
      .set('Origin', origin)
      .send({ version: 1, text: 'Sửa của người khác' })
      .expect(404);
    const results = await Promise.all(
      ['Sửa A', 'Sửa B'].map((text) =>
        agents[0].patch(url).set('Origin', origin).send({ version: 1, text }),
      ),
    );
    expect(results.map((reply) => reply.status).sort()).toEqual([200, 409]);
    const edited = (await post(0, path(), body).expect(201)).body;
    expect(edited.version).toBe(2);
    expect(edited.text).not.toBe(body.text);
    expect(edited).not.toHaveProperty('contentHash');
    const deleted = (
      await agents[0]
        .delete(url)
        .set('Origin', origin)
        .send({ version: 2 })
        .expect(200)
    ).body;
    expect(deleted.text).toBe('');
    expect(deleted.deletedAt).not.toBeNull();
    expect((await post(0, path(), body).expect(201)).body.deletedAt).toBe(
      deleted.deletedAt,
    );
    await agents[0]
      .patch(url)
      .set('Origin', origin)
      .send({ version: 3, text: 'Restore' })
      .expect(409);
  });
  it('validates messages and paginates history with stable numbers', async () => {
    for (const text of ['', '   ', 'x'.repeat(2001)])
      await post(0, path(), { clientId: randomUUID(), text }).expect(400);
    await post(0, path(), {
      clientId: randomUUID(),
      text: 'Hello',
      senderId: ids[1],
    }).expect(400);
    const current = await prisma.house.findUniqueOrThrow({
      where: { id: houseId },
    });
    await prisma.houseMessage.createMany({
      data: Array.from({ length: 42 }, (_, index) => ({
        id: randomUUID(),
        houseId,
        senderId: ids[0],
        clientId: randomUUID(),
        number: current.lastMessageNumber + index + 1,
        text: `History ${index}`,
        contentHash: createHash('sha256')
          .update(`History ${index}`)
          .digest('hex'),
        createdAt: new Date(Date.now() - 120000),
      })),
    });
    await prisma.house.update({
      where: { id: houseId },
      data: { lastMessageNumber: current.lastMessageNumber + 42 },
    });
    const legacy = await prisma.houseMessage.findFirstOrThrow({
      where: { houseId, text: 'History 0' },
    });
    const legacyRetry = (
      await post(0, path(), {
        clientId: legacy.clientId,
        text: legacy.text,
      }).expect(201)
    ).body;
    expect(legacyRetry.id).toBe(legacy.id);
    const latest = (await agents[0].get(path()).expect(200)).body;
    expect(latest.items).toHaveLength(40);
    expect(latest.hasMore).toBe(true);
    const older = (
      await agents[0]
        .get(path() + `?before=${latest.items[0].number}`)
        .expect(200)
    ).body;
    expect(
      older.items.every(
        (row: { number: number }) => row.number < latest.items[0].number,
      ),
    ).toBe(true);
    const after = (
      await agents[0]
        .get(path() + `?after=${latest.items[0].number}`)
        .expect(200)
    ).body;
    expect(after.items[0].number).toBe(latest.items[0].number + 1);
    await agents[0].get(path() + '?after=0&before=100').expect(400);
  });
  it('delivers a real SSE signal for sending, editing and deleting a house message', async () => {
    const address = app.getHttpServer().address();
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 7000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/updates`,
        { headers: { Cookie: cookie }, signal: controller.signal },
      );
      expect(response.status).toBe(200);
      reader = response.body!.getReader();
      async function nextSync() {
        let text = '';
        while (!text.includes('event: sync'))
          text += new TextDecoder().decode((await reader!.read()).value);
        return text;
      }
      await nextSync();
      let waiting = nextSync();
      const row = (
        await post(0, path(), {
          clientId: randomUUID(),
          text: 'SSE house chat',
        }).expect(201)
      ).body;
      expect(await waiting).toContain('event: sync');
      waiting = nextSync();
      await agents[0]
        .patch(path() + '/' + row.id)
        .set('Origin', origin)
        .send({ version: 1, text: 'Edited over SSE' })
        .expect(200);
      expect(await waiting).toContain('event: sync');
      waiting = nextSync();
      await agents[0]
        .delete(path() + '/' + row.id)
        .set('Origin', origin)
        .send({ version: 2 })
        .expect(200);
      expect(await waiting).toContain('event: sync');
    } finally {
      clearTimeout(timeout);
      controller.abort();
      await reader?.cancel().catch(() => {});
    }
  });
  it('stores private images, strips metadata and checks membership for every attachment', async () => {
    const image = await sharp({
      create: { width: 30, height: 20, channels: 3, background: '#e65036' },
    })
      .withMetadata()
      .png()
      .toBuffer();
    const clientId = randomUUID();
    const send = () =>
      agents[0]
        .post(path())
        .set('Origin', origin)
        .field('clientId', clientId)
        .field('text', 'Ảnh cho cả nhà')
        .attach('images', image, {
          filename: 'room.png',
          contentType: 'image/png',
        });
    const replies = await Promise.all([send(), send()]);
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    expect(replies[0].body.id).toBe(replies[1].body.id);
    const file = replies[0].body.attachments[0];
    expect(file).toMatchObject({
      kind: 'IMAGE',
      mimeType: 'image/jpeg',
      width: 30,
      height: 20,
    });
    expect(file).not.toHaveProperty('data');
    const url = `/api/v1/houses/${houseId}/attachments/${file.id}`;
    const response = await agents[1].get(url).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    const metadata = await sharp(response.body).metadata();
    expect(metadata.exif).toBeUndefined();
    await agents[2].get(url).expect(404);
    await request(app.getHttpServer()).get(url).expect(401);
    await agents[1]
      .get(`/api/v1/houses/${randomUUID()}/attachments/${file.id}`)
      .expect(404);
    await agents[0]
      .post(path())
      .set('Origin', origin)
      .field('clientId', clientId)
      .field('text', 'Changed')
      .attach('images', image, 'room.png')
      .expect(409);
  });
  it('sends audio-only messages, keeps retry identity after deletion and removes the file', async () => {
    const audio = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(40)]),
      clientId = randomUUID();
    const send = () =>
      agents[1]
        .post(path())
        .set('Origin', origin)
        .field('clientId', clientId)
        .attach('audio', audio, {
          filename: 'note.ogg',
          contentType: 'audio/ogg',
        });
    const row = (await send().expect(201)).body;
    expect(row.text).toBe('');
    expect(row.attachments[0].kind).toBe('AUDIO');
    const url = `/api/v1/houses/${houseId}/attachments/${row.attachments[0].id}`;
    await agents[0]
      .get(url)
      .expect(200)
      .expect('Content-Type', /audio\/ogg/);
    const edited = (
      await agents[1]
        .patch(path() + '/' + row.id)
        .set('Origin', origin)
        .send({ version: 1, text: 'Lời nhắn kèm ghi âm' })
        .expect(200)
    ).body;
    expect(edited.attachments).toHaveLength(1);
    const deleted = (
      await agents[1]
        .delete(path() + '/' + row.id)
        .set('Origin', origin)
        .send({ version: 2 })
        .expect(200)
    ).body;
    expect(deleted.attachments).toEqual([]);
    await agents[0].get(url).expect(404);
    const retry = (await send().expect(201)).body;
    expect(retry.id).toBe(row.id);
    expect(retry.deletedAt).toBe(deleted.deletedAt);
    expect(retry.attachments).toEqual([]);
    expect(
      await prisma.houseMessageAttachment.count({
        where: { messageId: row.id },
      }),
    ).toBe(0);
  });
  it('rejects fake and oversized media without creating a message', async () => {
    const count = await prisma.houseMessage.count({ where: { houseId } });
    for (const [field, contentType] of [
      ['images', 'image/png'],
      ['audio', 'audio/webm'],
    ]) {
      await agents[0]
        .post(path())
        .set('Origin', origin)
        .field('clientId', randomUUID())
        .attach(field, Buffer.from('not valid media'), {
          filename: 'fake',
          contentType,
        })
        .expect(400);
    }
    await agents[0]
      .post(path())
      .set('Origin', origin)
      .field('clientId', randomUUID())
      .attach('audio', Buffer.alloc(2 * 1024 * 1024 + 1), {
        filename: 'large.ogg',
        contentType: 'audio/ogg',
      })
      .expect(400);
    expect(await prisma.houseMessage.count({ where: { houseId } })).toBe(count);
  });
  it('revokes all chat actions after leaving and updates roles after ownership transfer', async () => {
    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    const media = (
      await agents[1]
        .post(path())
        .set('Origin', origin)
        .field('clientId', randomUUID())
        .attach('images', image, 'test.png')
        .expect(201)
    ).body;
    const mediaUrl = `/api/v1/houses/${houseId}/attachments/${media.attachments[0].id}`;
    await agents[0].get(mediaUrl).expect(200);
    const row = (
      await post(1, path(), {
        clientId: randomUUID(),
        text: 'Before leaving',
      }).expect(201)
    ).body;
    await post(0, `/api/v1/houses/${houseId}/transfer`, {
      userId: ids[1],
    }).expect(201);
    const items = (await agents[0].get(path()).expect(200)).body.items;
    expect(
      items.find((item: { id: string }) => item.id === row.id).sender.role,
    ).toBe('OWNER');
    await post(0, `/api/v1/houses/${houseId}/leave`).expect(201);
    await agents[0].get(path()).expect(404);
    await agents[0].get(mediaUrl).expect(404);
    await agents[0]
      .post(path())
      .set('Origin', origin)
      .field('clientId', randomUUID())
      .attach('images', image, 'test.png')
      .expect(404);
    await post(0, path(), {
      clientId: randomUUID(),
      text: 'After leaving',
    }).expect(404);
    await agents[0]
      .patch(path() + '/' + row.id)
      .set('Origin', origin)
      .send({ version: 1, text: 'Forbidden' })
      .expect(404);
    await agents[0]
      .delete(path() + '/' + row.id)
      .set('Origin', origin)
      .send({ version: 1 })
      .expect(404);
  });
});
