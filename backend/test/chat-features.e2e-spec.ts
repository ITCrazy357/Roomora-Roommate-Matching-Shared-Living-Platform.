import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { NotificationsService } from '../src/modules/communications/notifications.service.js';

describe('Chat files and house polls (real PostgreSQL)', () => {
  let app: INestApplication,
    prisma: PrismaService,
    houseId: string,
    otherHouseId: string,
    conversationId: string,
    memberCookie: string;
  const users: string[] = [],
    agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000';
  const house = () => `/api/v1/houses/${houseId}`;
  const personal = () => `/api/v1/conversations/${conversationId}`;
  const post = (index: number, url: string, body: object = {}) =>
    agents[index].post(url).set('Origin', origin).send(body);
  const poll = () => ({
    clientId: randomUUID(),
    question: 'Dọn nhà khi nào?',
    options: ['Thứ bảy', 'Chủ nhật'],
  });
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
        email = `chat-features-${id}@example.test`;
      users.push(id);
      await prisma.user.create({
        data: {
          id,
          email,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: `Chat ${index}` } },
        },
      });
      agents.push(request.agent(app.getHttpServer()));
      const login = await post(index, '/api/v1/auth/login', {
        email,
        password,
      }).expect(200);
      if (index === 1)
        memberCookie = login.headers['set-cookie'][0].split(';')[0];
    }
    houseId = (
      await post(0, '/api/v1/houses', { name: 'Chat features' }).expect(201)
    ).body.id;
    otherHouseId = (
      await post(2, '/api/v1/houses', { name: 'Other house' }).expect(201)
    ).body.id;
    const connection = (
      await post(0, '/api/v1/connections', { targetId: users[1] }).expect(201)
    ).body;
    await post(1, `/api/v1/connections/${connection.id}/accept`, {
      version: connection.version,
    }).expect(201);
    conversationId = (
      await prisma.conversation.findUniqueOrThrow({
        where: { connectionId: connection.id },
      })
    ).id;
    const invitation = (
      await post(0, `${house()}/invites`, { userId: users[1] }).expect(201)
    ).body.invites[0];
    await post(1, `/api/v1/houses/invites/${invitation.id}/accept`).expect(201);
  }, 30000);
  afterAll(async () => {
    if (prisma) {
      await prisma.house.deleteMany({
        where: { id: { in: [houseId, otherHouseId].filter(Boolean) } },
      });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
    vi.restoreAllMocks();
  });

  it('validates polls, checks membership and deduplicates creation without leaking voters', async () => {
    const body = poll();
    await request(app.getHttpServer())
      .post(house() + '/polls')
      .set('Origin', origin)
      .send(body)
      .expect(401);
    await post(2, house() + '/polls', body).expect(404);
    for (const invalid of [
      { options: ['One'] },
      { options: [' One ', 'one'] },
      { options: ['', 'Two'] },
      { options: Array(11).fill('Many') },
      { options: ['a'.repeat(121), 'Two'] },
      { question: ' ' },
      { question: 'a'.repeat(201) },
      { senderId: users[1] },
    ])
      await post(0, house() + '/polls', { ...poll(), ...invalid }).expect(400);
    const replies = await Promise.all([
      post(0, house() + '/polls', body),
      post(0, house() + '/polls', body),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    expect(replies[0].body.id).toBe(replies[1].body.id);
    expect(replies[0].body.poll).toMatchObject({
      question: body.question,
      totalVotes: 0,
      myOptionId: null,
    });
    expect(replies[0].body).not.toHaveProperty('contentHash');
    await post(0, house() + '/polls', { ...body, question: 'Changed' }).expect(
      409,
    );
    await agents[0]
      .patch(`${house()}/messages/${replies[0].body.id}`)
      .set('Origin', origin)
      .send({ version: 1, text: 'Change question' })
      .expect(400);
  });

  it('counts one vote per member across concurrent retries, change and withdrawal', async () => {
    const row = (await post(0, house() + '/polls', poll()).expect(201)).body;
    const url = `${house()}/polls/${row.id}/vote`,
      [first, second] = row.poll.options;
    const replies = await Promise.all([
      post(1, url, { optionId: first.id }),
      post(1, url, { optionId: first.id }),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    for (const reply of replies)
      expect(reply.body.poll).toMatchObject({
        totalVotes: 1,
        myOptionId: first.id,
      });
    const changed = (await post(1, url, { optionId: second.id }).expect(201))
      .body;
    expect(
      changed.poll.options.map((option: { votes: number }) => option.votes),
    ).toEqual([0, 1]);
    await post(0, url, { optionId: first.id }).expect(201);
    const ownerView = (
      await agents[0].get(house() + '/messages').expect(200)
    ).body.items.find((item: { id: string }) => item.id === row.id);
    expect(ownerView.poll).toMatchObject({
      totalVotes: 2,
      myOptionId: first.id,
    });
    expect(ownerView.poll).not.toHaveProperty('votes');
    expect(ownerView.poll.options[0]).not.toHaveProperty('userId');
    const other = (await post(1, house() + '/polls', poll()).expect(201)).body;
    await post(1, url, { optionId: other.poll.options[0].id }).expect(400);
    await post(2, url, { optionId: first.id }).expect(404);
    const withdrawn = (await post(1, url, { optionId: null }).expect(201)).body;
    expect(withdrawn.poll).toMatchObject({ totalVotes: 1, myOptionId: null });
    expect(
      await prisma.housePollVote.count({
        where: { pollId: row.id, userId: users[1] },
      }),
    ).toBe(0);
  });

  it('allows only the creator to close, retains results and prevents subsequent votes', async () => {
    const row = (await post(1, house() + '/polls', poll()).expect(201)).body;
    await post(0, `${house()}/polls/${row.id}/close`).expect(403);
    await post(0, `${house()}/polls/${row.id}/vote`, {
      optionId: row.poll.options[0].id,
    }).expect(201);
    const closed = (
      await post(1, `${house()}/polls/${row.id}/close`).expect(201)
    ).body;
    expect(closed.poll.closedAt).not.toBeNull();
    expect(closed.poll.totalVotes).toBe(1);
    const retry = (
      await post(1, `${house()}/polls/${row.id}/close`).expect(201)
    ).body;
    expect(retry.version).toBe(closed.version);
    await post(0, `${house()}/polls/${row.id}/vote`, { optionId: null }).expect(
      409,
    );
    await post(1, `${house()}/polls/${row.id}/vote`, {
      optionId: row.poll.options[1].id,
    }).expect(409);
  });

  it('serializes closing with votes and deletion, never restores a deleted poll on retry', async () => {
    const body = poll(),
      row = (await post(0, house() + '/polls', body).expect(201)).body;
    const replies = await Promise.all([
      post(1, `${house()}/polls/${row.id}/vote`, {
        optionId: row.poll.options[0].id,
      }),
      post(0, `${house()}/polls/${row.id}/close`),
    ]);
    expect(replies[1].status).toBe(201);
    expect([201, 409]).toContain(replies[0].status);
    const current = (await post(0, house() + '/polls', body).expect(201)).body;
    const deleted = (
      await agents[0]
        .delete(`${house()}/messages/${row.id}`)
        .set('Origin', origin)
        .send({ version: current.version })
        .expect(200)
    ).body;
    expect(deleted.poll).toBeNull();
    expect(deleted.deletedAt).not.toBeNull();
    const retry = (await post(0, house() + '/polls', body).expect(201)).body;
    expect(retry.deletedAt).toBe(deleted.deletedAt);
    expect(retry.poll).toBeNull();
    expect(
      await prisma.housePollVote.count({ where: { pollId: row.id } }),
    ).toBe(0);
    await post(1, `${house()}/polls/${row.id}/vote`, {
      optionId: row.poll.options[0].id,
    }).expect(404);
  });

  it('delivers actual SSE updates for creating, voting and closing a poll', async () => {
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 7000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const address = app.getHttpServer().address();
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/updates`,
        {
          headers: { Cookie: memberCookie },
          signal: controller.signal,
        },
      );
      reader = response.body!.getReader();
      async function nextSync() {
        let text = '';
        while (!text.includes('event: sync'))
          text += new TextDecoder().decode((await reader!.read()).value);
        return text;
      }
      await nextSync();
      let waiting = nextSync();
      const row = (await post(0, house() + '/polls', poll()).expect(201)).body;
      expect(await waiting).toContain('event: sync');
      waiting = nextSync();
      await post(0, `${house()}/polls/${row.id}/vote`, {
        optionId: row.poll.options[0].id,
      }).expect(201);
      expect(await waiting).toContain('event: sync');
      waiting = nextSync();
      await post(0, `${house()}/polls/${row.id}/close`).expect(201);
      expect(await waiting).toContain('event: sync');
    } finally {
      clearTimeout(timeout);
      controller.abort();
      await reader?.cancel().catch(() => {});
    }
  });

  it.each(['house', 'personal'])(
    'sends and downloads %s files privately with names intact, deduplication and deletion',
    async (type) => {
      const base = type === 'house' ? house() : personal(),
        clientId = randomUUID(),
        bytes = Buffer.from('<script>alert(1)</script>'),
        filename = 'Hóa đơn tháng 10.html';
      const send = (name = filename) =>
        agents[0]
          .post(base + '/messages')
          .set('Origin', origin)
          .field('clientId', clientId)
          .attach('files', bytes, { filename: name, contentType: 'text/html' });
      const replies = await Promise.all([send(), send()]);
      expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
      const row = replies[0].body,
        file = row.attachments[0];
      expect(replies[1].body.id).toBe(row.id);
      expect(row.text).toBe('');
      expect(file).toMatchObject({
        kind: 'FILE',
        fileName: filename,
        mimeType: 'application/octet-stream',
        byteSize: bytes.length,
      });
      expect(file).not.toHaveProperty('data');
      const url = base + `/attachments/${file.id}`,
        download = await agents[1].get(url).expect(200);
      expect(download.body.equals(bytes)).toBe(true);
      expect(download.headers['content-type']).toBe('application/octet-stream');
      expect(download.headers['content-disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(download.headers['cache-control']).toBe('private, no-store');
      await agents[2].get(url).expect(404);
      await request(app.getHttpServer()).get(url).expect(401);
      if (type === 'house')
        await agents[2]
          .get(`/api/v1/houses/${otherHouseId}/attachments/${file.id}`)
          .expect(404);
      else {
        const inbox = (await agents[1].get('/api/v1/conversations').expect(200))
          .body;
        expect(
          inbox.items.find((item: { id: string }) => item.id === conversationId)
            .lastMessage.attachments[0].kind,
        ).toBe('FILE');
      }
      await send('Changed.txt').expect(409);
      const deleted = (
        await agents[0]
          .delete(base + `/messages/${row.id}`)
          .set('Origin', origin)
          .send({ version: 1 })
          .expect(200)
      ).body;
      await agents[1].get(url).expect(404);
      const retry = (await send().expect(201)).body;
      expect(retry.id).toBe(row.id);
      expect(retry.deletedAt).toBe(deleted.deletedAt);
      expect(retry.attachments).toEqual([]);
    },
  );

  it.each(['house', 'personal'])(
    'rejects empty, oversized and excessive %s files before creating a message',
    async (type) => {
      const base = type === 'house' ? house() : personal();
      await agents[0]
        .post(base + '/messages')
        .set('Origin', origin)
        .field('clientId', randomUUID())
        .attach('files', Buffer.alloc(0), 'empty.txt')
        .expect(400);
      await agents[0]
        .post(base + '/messages')
        .set('Origin', origin)
        .field('clientId', randomUUID())
        .attach('files', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.zip')
        .expect(413);
      await agents[0]
        .post(base + '/messages')
        .set('Origin', origin)
        .field('clientId', randomUUID())
        .attach('files', Buffer.alloc(3 * 1024 * 1024), 'a.zip')
        .attach('files', Buffer.alloc(3 * 1024 * 1024), 'b.zip')
        .expect(400);
      const upload = agents[0]
        .post(base + '/messages')
        .set('Origin', origin)
        .field('clientId', randomUUID());
      for (let index = 0; index < 5; index++)
        upload.attach('files', Buffer.from('file'), `${index}.txt`);
      await upload.expect(400);
    },
  );

  it('revokes poll and house-file access after leaving, personal files after blocking', async () => {
    const body = poll(),
      row = (await post(1, house() + '/polls', body).expect(201)).body;
    const file = (
      await agents[0]
        .post(house() + '/messages')
        .set('Origin', origin)
        .field('clientId', randomUUID())
        .attach('files', Buffer.from('private'), 'house.txt')
        .expect(201)
    ).body.attachments[0];
    await post(1, house() + '/leave').expect(201);
    await post(1, house() + '/polls', poll()).expect(404);
    await post(1, `${house()}/polls/${row.id}/vote`, {
      optionId: row.poll.options[0].id,
    }).expect(404);
    await post(1, `${house()}/polls/${row.id}/close`).expect(404);
    await agents[1].get(`${house()}/attachments/${file.id}`).expect(404);
    const privateFile = (
      await agents[0]
        .post(personal() + '/messages')
        .set('Origin', origin)
        .field('clientId', randomUUID())
        .attach('files', Buffer.from('private'), 'personal.txt')
        .expect(201)
    ).body.attachments[0];
    await post(1, `/api/v1/user-safety/${users[0]}/block`).expect(201);
    await agents[1]
      .get(`${personal()}/attachments/${privateFile.id}`)
      .expect(404);
  });
});
