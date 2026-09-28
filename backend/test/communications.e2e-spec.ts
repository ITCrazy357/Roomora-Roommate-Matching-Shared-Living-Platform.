import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { NotificationsService } from '../src/modules/communications/notifications.service.js';

describe('Phase 5 messaging, appointments and notifications (PostgreSQL)', () => {
  let app: INestApplication, prisma: PrismaService;
  let a: ReturnType<typeof request.agent>,
    b: ReturnType<typeof request.agent>,
    outsider: ReturnType<typeof request.agent>;
  let aid: string,
    bid: string,
    outsiderId: string,
    conversationId: string,
    listingId: string,
    cookie: string,
    passwordHash: string,
    attachmentId: string;
  const ids: string[] = [];
  const origin = 'http://localhost:3000';
  const password = `Roomora-${randomUUID()}`;
  const future = () => new Date(Date.now() + 3 * 24 * 3600000).toISOString();
  const path = () => `/api/v1/conversations/${conversationId}`;
  function post(agent: typeof a, url: string, data: unknown = {}) {
    return agent.post(url).set('Origin', origin).send(data);
  }
  async function account() {
    const id = randomUUID();
    ids.push(id);
    const user = await prisma.user.create({
      data: {
        id,
        email: `phase5-${id}@example.test`,
        passwordHash,
        emailVerifiedAt: new Date(),
        profile: { create: { displayName: 'Phase 5 ' + id.slice(0, 5) } },
      },
    });
    const agent = request.agent(app.getHttpServer());
    const login = await post(agent, '/api/v1/auth/login', {
      email: user.email,
      password,
    }).expect(200);
    return {
      id,
      agent,
      cookie: login.headers['set-cookie'][0].split(';')[0] as string,
    };
  }
  async function appointment() {
    return (
      await post(a, path() + '/appointments', {
        listingId,
        startsAt: future(),
        place: 'Sảnh chung cư',
        note: 'Xem phòng và bếp chung.',
      }).expect(201)
    ).body;
  }
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
    // Do not deliver email from a shared development database during tests.
    vi.spyOn(app.get(NotificationsService), 'onModuleInit').mockImplementation(
      () => {},
    );
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    passwordHash = await app.get(PasswordService).hash(password);
    const first = await account(),
      second = await account(),
      third = await account();
    a = first.agent;
    aid = first.id;
    b = second.agent;
    bid = second.id;
    outsider = third.agent;
    outsiderId = third.id;
    cookie = second.cookie;
    const connection = (
      await post(a, '/api/v1/connections', { targetId: bid }).expect(201)
    ).body;
    await post(b, `/api/v1/connections/${connection.id}/accept`, {
      version: connection.version,
    }).expect(201);
    conversationId = (
      await prisma.conversation.findUniqueOrThrow({
        where: { connectionId: connection.id },
      })
    ).id;
    listingId = (
      await prisma.listing.create({
        data: {
          ownerId: aid,
          status: 'PUBLISHED',
          title: 'Phòng kiểm thử Phase 5',
          privateAddress: 'ĐỊA CHỈ RIÊNG KHÔNG ĐƯỢC LỘ',
          latitude: 10.77,
          longitude: 106.69,
          rent: 2800000,
        },
      })
    ).id;
  }, 30000);
  afterAll(async () => {
    if (prisma && ids.length)
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
    vi.restoreAllMocks();
  });

  it('creates one conversation on acceptance and protects all endpoints', async () => {
    expect(
      await prisma.conversation.count({ where: { id: conversationId } }),
    ).toBe(1);
    await request(app.getHttpServer()).get(path()).expect(401);
    await outsider.get(path()).expect(404);
    await outsider.get(path() + '/messages').expect(404);
    await post(outsider, path() + '/messages', {
      clientId: randomUUID(),
      text: 'Không được gửi',
    }).expect(404);
    await post(outsider, path() + '/read', { number: 0 }).expect(404);
    await post(outsider, path() + '/typing', { typing: true }).expect(404);
    await post(outsider, path() + '/appointments', {
      listingId,
      startsAt: future(),
      place: 'Sảnh nhà',
    }).expect(404);
    await a
      .post(path() + '/messages')
      .set('Origin', 'https://untrusted.example')
      .send({ clientId: randomUUID(), text: 'CSRF' })
      .expect(403);
    const result = (await a.get(path()).expect(200)).body;
    expect(result.listings[0].id).toBe(listingId);
    expect(result.listings[0]).toMatchObject({ latitude: 10.77, longitude: 106.69 });
    expect(JSON.stringify(result)).not.toContain('ĐỊA CHỈ RIÊNG');
    expect(JSON.stringify(result)).not.toContain('@example.test');
    const publicListing = (await outsider.get(`/api/v1/listings/${listingId}`).expect(200)).body;
    expect(publicListing).toMatchObject({ latitude: 10.77, longitude: 106.69 });
    expect(JSON.stringify(publicListing)).not.toContain('ĐỊA CHỈ RIÊNG');
    const publicProfile = (await request(app.getHttpServer()).get(`/api/v1/people/${aid}`).expect(200)).body;
    expect(publicProfile.listings[0]).toMatchObject({ id: listingId, latitude: 10.77, longitude: 106.69 });
    expect(JSON.stringify(publicProfile)).not.toContain('ĐỊA CHỈ RIÊNG');
  });
  it('allows a confirmed meeting when neither person has a published room', async () => {
    const first = await account();
    const second = await account();
    const invite = (await post(first.agent, '/api/v1/connections', { targetId: second.id }).expect(201)).body;
    await post(second.agent, `/api/v1/connections/${invite.id}/accept`, { version: invite.version }).expect(201);
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { connectionId: invite.id } });
    const url = `/api/v1/conversations/${conversation.id}`;
    expect((await second.agent.get(url).expect(200)).body.listings).toEqual([]);
    const proposal = (await post(first.agent, url + '/appointments', {
      startsAt: future(), place: 'Quán cà phê gần ga', note: 'Gặp để trao đổi',
    }).expect(201)).body;
    expect(proposal.listingId).toBeNull();
    await post(second.agent, url + `/appointments/${proposal.id}`, { action: 'confirm', version: 1 }).expect(201);
    const detail = (await second.agent.get(url).expect(200)).body;
    expect(detail.appointments[0]).toMatchObject({ id: proposal.id, listing: null, status: 'CONFIRMED' });
    expect((await second.agent.get('/api/v1/appointments').expect(200)).body.items[0].listing).toBeNull();
  });
  it('deduplicates concurrent retries and rejects conflicting bodies', async () => {
    const body = {
      clientId: randomUUID(),
      text: 'Xin chào, mình muốn trao đổi về phòng.',
    };
    const results = await Promise.all([
      post(a, path() + '/messages', body),
      post(a, path() + '/messages', body),
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0].body.id).toBe(results[1].body.id);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: bid, type: 'MESSAGE' },
      }),
    ).toBe(1);
    await post(a, path() + '/messages', {
      ...body,
      text: 'Nội dung khác',
    }).expect(409);
    await post(a, path() + '/messages', {
      clientId: randomUUID(),
      text: '   ',
    }).expect(400);
    await post(a, path() + '/messages', {
      clientId: randomUUID(),
      text: 'x'.repeat(2001),
    }).expect(400);
    await post(a, path() + '/messages', { ...body, senderId: bid }).expect(400);
  });
  it('tracks unread messages monotonically, separately from notifications', async () => {
    expect((await b.get('/api/v1/conversations').expect(200)).body.unread).toBe(
      1,
    );
    await post(b, path() + '/read', { number: 1 }).expect(201);
    await post(b, path() + '/read', { number: 0 }).expect(201);
    expect((await b.get('/api/v1/conversations').expect(200)).body.unread).toBe(
      0,
    );
    expect(
      (await b.get('/api/v1/notifications').expect(200)).body.unread,
    ).toBeGreaterThan(0);
    await post(b, path() + '/read', { number: 100 }).expect(400);
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversationId },
        })
      ).receiverRead,
    ).toBe(1);
  });
  it('pushes a real SSE update after commit', async () => {
    const address = app.getHttpServer().address();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/updates`,
        { headers: { Cookie: cookie }, signal: controller.signal },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      );
      reader = response.body!.getReader();
      const nextEvent = async () => {
        let text = '';
        while (!text.includes('event: sync'))
          text += new TextDecoder().decode((await reader!.read()).value);
        return text;
      };
      expect(await nextEvent()).toContain('event: sync');
      const waiting = nextEvent();
      await post(a, path() + '/messages', {
        clientId: randomUUID(),
        text: 'Tin nhắn thời gian thực',
      }).expect(201);
      expect(await waiting).toContain('event: sync');
    } finally {
      clearTimeout(timeout);
      controller.abort();
      await reader?.cancel().catch(() => {});
    }
  });
  it('shows typing only to the other participant without saving a message', async () => {
    await post(a, path() + '/typing', { typing: 'true' }).expect(400);
    await post(a, path() + '/typing', { typing: true, userId: outsiderId }).expect(400);
    const address = app.getHttpServer().address();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/updates`,
        { headers: { Cookie: cookie }, signal: controller.signal },
      );
      expect(response.status).toBe(200);
      reader = response.body!.getReader();
      let buffer = '';
      const nextTyping = async () => {
        while (true) {
          const end = buffer.indexOf('\n\n');
          if (end >= 0) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (event.includes('event: typing')) {
              const data = event.split('\n').find((line) => line.startsWith('data: '));
              return JSON.parse(data!.slice(6));
            }
            continue;
          }
          const chunk = await reader!.read();
          if (chunk.done) throw new Error('Typing stream closed');
          buffer += new TextDecoder().decode(chunk.value).replace(/\r/g, '');
        }
      };
      const before = await prisma.message.count({ where: { conversationId } });
      const notices = await prisma.notification.count({ where: { userId: bid } });
      const started = nextTyping();
      await post(a, path() + '/typing', { typing: true }).expect(201);
      expect(await started).toEqual({ conversationId, typing: true });
      const stopped = nextTyping();
      await post(a, path() + '/typing', { typing: false }).expect(201);
      expect(await stopped).toEqual({ conversationId, typing: false });
      expect(await prisma.message.count({ where: { conversationId } })).toBe(before);
      expect(await prisma.notification.count({ where: { userId: bid } })).toBe(notices);
    } finally {
      clearTimeout(timeout);
      controller.abort();
      await reader?.cancel().catch(() => {});
    }
  });
  it('paginates history and catches up in ascending order', async () => {
    await prisma.$transaction(async (tx) => {
      const row = await tx.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      await tx.message.createMany({
        data: Array.from({ length: 75 }, (_, index) => ({
          conversationId,
          senderId: aid,
          clientId: randomUUID(),
          number: row.lastNumber + index + 1,
          text: `Tin cũ ${index}`,
          createdAt: new Date(Date.now() - 120000),
        })),
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastNumber: row.lastNumber + 75 },
      });
    });
    const latest = (await a.get(path() + '/messages').expect(200)).body;
    expect(latest.items).toHaveLength(40);
    expect(latest.hasMore).toBe(true);
    const older = (
      await a
        .get(path() + '/messages')
        .query({ before: latest.items[0].number })
        .expect(200)
    ).body;
    expect(older.items).toHaveLength(37);
    expect(older.hasMore).toBe(false);
    const catchup = (
      await a
        .get(path() + '/messages')
        .query({ after: 1 })
        .expect(200)
    ).body;
    expect(catchup.items[0].number).toBe(2);
    expect(catchup.hasMore).toBe(true);
    expect(
      new Set([...older.items, ...latest.items].map((row) => row.id)).size,
    ).toBe(77);
    await a
      .get(path() + '/messages')
      .query({ before: 10, after: 1 })
      .expect(400);
  });
  it('sends private image and audio attachments with idempotent retries', async () => {
    const first = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#e65036' } }).png().toBuffer();
    const second = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#faf8f5' } }).png().toBuffer();
    const clientId = randomUUID();
    const upload = () => a.post(path() + '/messages').set('Origin', origin)
      .field('clientId', clientId).field('text', '')
      .attach('images', first, { filename: 'one.png', contentType: 'image/png' })
      .attach('images', second, { filename: 'two.png', contentType: 'image/png' });
    const sent = (await upload().expect(201)).body;
    expect(sent.text).toBe('');
    expect(sent.attachments.map((file) => file.kind)).toEqual(['IMAGE', 'IMAGE']);
    expect(JSON.stringify(sent)).not.toContain('data');
    const repeated = (await upload().expect(201)).body;
    expect(repeated.id).toBe(sent.id);
    await a.post(path() + '/messages').set('Origin', origin)
      .field('clientId', clientId).field('text', '')
      .attach('images', second, { filename: 'changed.png', contentType: 'image/png' })
      .expect(409);
    const fileUrl = path() + '/attachments/' + sent.attachments[0].id;
    attachmentId = sent.attachments[0].id;
    const file = await b.get(fileUrl).expect(200);
    expect(file.headers['content-type']).toContain('image/jpeg');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect((await sharp(file.body).metadata()).format).toBe('jpeg');
    await outsider.get(fileUrl).expect(404);
    const list = (await b.get(path() + '/messages').expect(200)).body;
    expect(list.items.find((row) => row.id === sent.id).attachments).toHaveLength(2);

    const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]);
    const recorded = (await a.post(path() + '/messages').set('Origin', origin)
      .field('clientId', randomUUID()).field('text', '')
      .attach('audio', audio, { filename: 'voice.webm', contentType: 'audio/webm' })
      .expect(201)).body;
    expect(recorded.attachments[0].kind).toBe('AUDIO');
    await b.get(path() + '/attachments/' + recorded.attachments[0].id)
      .expect('Content-Type', /audio\/webm/).expect(200);
    await a.post(path() + '/messages').set('Origin', origin)
      .field('clientId', randomUUID()).field('text', '')
      .attach('audio', Buffer.from('wrong'), { filename: 'bad.webm', contentType: 'audio/webm' })
      .expect(400);
  });
  it('enforces the per-user message rate limit', async () => {
    await prisma.message.updateMany({
      where: { conversationId, senderId: aid },
      data: { createdAt: new Date(Date.now() - 120000) },
    });
    for (let index = 0; index < 30; index++)
      await post(a, path() + '/messages', {
        clientId: randomUUID(),
        text: 'Giới hạn ' + index,
      }).expect(201);
    await post(a, path() + '/messages', {
      clientId: randomUUID(),
      text: 'Quá giới hạn',
    }).expect(429);
  }, 15000);
  it('validates appointment ownership, listing status, timezone and range', async () => {
    const room = await prisma.listing.create({
      data: {
        ownerId: outsiderId,
        title: 'Phòng người ngoài',
        status: 'PUBLISHED',
      },
    });
    const base = { listingId, startsAt: future(), place: 'Sảnh nhà' };
    await post(a, path() + '/appointments', {
      ...base,
      listingId: room.id,
    }).expect(400);
    await post(a, path() + '/appointments', {
      ...base,
      startsAt: '2027-01-01T10:00:00',
    }).expect(400);
    await post(a, path() + '/appointments', {
      ...base,
      startsAt: new Date(Date.now() - 1).toISOString(),
    }).expect(400);
    await post(a, path() + '/appointments', {
      ...base,
      startsAt: new Date(Date.now() + 181 * 24 * 3600000).toISOString(),
    }).expect(400);
    await prisma.listing.update({
      where: { id: listingId },
      data: { status: 'CLOSED' },
    });
    await post(a, path() + '/appointments', base).expect(400);
    await prisma.listing.update({
      where: { id: listingId },
      data: { status: 'PUBLISHED' },
    });
  });
  it('requires the other party to confirm and re-confirm reschedules', async () => {
    const item = await appointment();
    const url = path() + '/appointments/' + item.id;
    await post(a, url, { action: 'confirm', version: 1 }).expect(409);
    await post(outsider, url, { action: 'confirm', version: 1 }).expect(404);
    await post(b, url, { action: 'confirm', version: 1 }).expect(201);
    await post(b, url, { action: 'confirm', version: 1 }).expect(409);
    const moved = (
      await post(b, url, {
        action: 'reschedule',
        version: 2,
        startsAt: future(),
        place: 'Cổng nhà',
        note: 'Giờ mới',
      }).expect(201)
    ).body;
    expect(moved.status).toBe('PENDING');
    expect(moved.proposerId).toBe(bid);
    await post(b, url, { action: 'confirm', version: 3 }).expect(409);
    await post(a, url, { action: 'confirm', version: 3 }).expect(201);
    const detail = (await a.get(path()).expect(200)).body;
    expect(
      detail.appointments
        .find((row) => row.id === item.id)
        .changes.map((row) => row.status),
    ).toEqual(['PENDING', 'CONFIRMED', 'PENDING', 'CONFIRMED']);
    expect(
      (await a.get('/api/v1/appointments?tab=upcoming').expect(200)).body.total,
    ).toBe(1);
  });
  it('resolves concurrent calendar changes once and keeps cancellation final', async () => {
    const item = await appointment();
    const url = path() + '/appointments/' + item.id;
    const results = await Promise.all([
      post(b, url, { action: 'confirm', version: 1 }),
      post(a, url, { action: 'cancel', version: 1 }),
    ]);
    expect(
      results.map((row) => row.status).sort((first, second) => first - second),
    ).toEqual([201, 409]);
    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: item.id },
    });
    if (row.status !== 'CANCELLED')
      await post(a, url, { action: 'cancel', version: row.version }).expect(
        201,
      );
    const cancelled = await prisma.appointment.findUniqueOrThrow({
      where: { id: item.id },
    });
    await post(b, url, {
      action: 'confirm',
      version: cancelled.version,
    }).expect(409);
    expect(
      (await a.get('/api/v1/appointments?tab=past').expect(200)).body.total,
    ).toBe(1);
  });
  it('stores private notifications and marks only the requesting user records', async () => {
    const result = (
      await b.get('/api/v1/notifications?type=APPOINTMENT&limit=2').expect(200)
    ).body;
    expect(result.items).toHaveLength(2);
    expect(result.pages).toBeGreaterThan(1);
    const id = result.items[0].id;
    await post(outsider, `/api/v1/notifications/${id}/read`).expect(404);
    await post(b, `/api/v1/notifications/${id}/read`).expect(201);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id } })).readAt,
    ).not.toBeNull();
    await post(b, '/api/v1/notifications/read').expect(201);
    expect(
      (await b.get('/api/v1/notifications?tab=unread').expect(200)).body.total,
    ).toBe(0);
    const emails = await prisma.notification.findMany({
      where: { userId: bid, emailRequired: true },
    });
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((row) => row.emailSentAt === null)).toBe(true);
  });
  it('limits new viewing proposals without deleting the earlier proposals', async () => {
    for (let index = 0; index < 8; index++) await appointment();
    await post(a, path() + '/appointments', {
      listingId,
      startsAt: future(),
      place: 'Sảnh nhà',
    }).expect(429);
    expect(await prisma.appointment.count({ where: { conversationId } })).toBe(
      10,
    );
  });
  it('revokes conversation access and cancels meetings when a participant blocks', async () => {
    await post(b, '/api/v1/user-safety/' + aid + '/block').expect(201);
    for (const agent of [a, b]) {
      await agent.get(path()).expect(404);
      await agent.get(path() + '/messages').expect(404);
      await agent.get(path() + '/attachments/' + attachmentId).expect(404);
      await post(agent, path() + '/messages', {
        clientId: randomUUID(),
        text: 'Không được gửi sau chặn',
      }).expect(404);
      await post(agent, path() + '/typing', { typing: true }).expect(404);
      expect(
        (await agent.get('/api/v1/conversations').expect(200)).body.total,
      ).toBe(0);
      expect(
        (await agent.get('/api/v1/appointments').expect(200)).body.total,
      ).toBe(0);
    }
    expect(
      await prisma.appointment.count({
        where: { conversationId, status: { not: 'CANCELLED' } },
      }),
    ).toBe(0);
    await b
      .delete('/api/v1/user-safety/' + aid + '/block')
      .set('Origin', origin)
      .expect(200);
    await a.get(path()).expect(404);
  });
  it('keeps read markers attached to each person when a cancelled pair reconnects in reverse', async () => {
    const connection = await prisma.connection.findFirstOrThrow({
      where: { senderId: aid, receiverId: bid },
    });
    await prisma.connection.update({
      where: { id: connection.id },
      data: { updatedAt: new Date(Date.now() - 25 * 3600000) },
    });
    const previous = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const sent = (
      await post(b, '/api/v1/connections', { targetId: aid }).expect(201)
    ).body;
    await post(a, `/api/v1/connections/${sent.id}/accept`, {
      version: sent.version,
    }).expect(201);
    const current = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(current.senderRead).toBe(previous.receiverRead);
    expect(current.receiverRead).toBe(previous.senderRead);
    expect(
      await prisma.conversation.count({
        where: { connectionId: connection.id },
      }),
    ).toBe(1);
    const detail = (await a.get(path()).expect(200)).body;
    expect(
      detail.appointments.every((item) => item.status === 'CANCELLED'),
    ).toBe(true);
    expect(
      detail.appointments.every(
        (item) => item.changes.at(-1).status === 'CANCELLED',
      ),
    ).toBe(true);
  });
});
