import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { NotificationsService } from '../src/modules/communications/notifications.service.js';

describe('Chat activity (HTTP and PostgreSQL)', () => {
  let app: INestApplication,
    prisma: PrismaService,
    conversationId: string,
    houseId: string;
  const ids: string[] = [],
    agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000';
  let email: string, password: string;
  const post = (index: number, path: string, body: object = {}) =>
    agents[index].post(path).set('Origin', origin).send(body);
  const heartbeat = (index: number, idleSeconds = 0) =>
    post(index, '/api/v1/presence/heartbeat', { idleSeconds });
  const detail = () => agents[0].get(`/api/v1/conversations/${conversationId}`);
  async function setActivity(index: number, seconds: number) {
    const timestamp = new Date(Date.now() - seconds * 1000);
    await prisma.user.update({
      where: { id: ids[index] },
      data: { lastActiveAt: timestamp },
    });
    await prisma.session.updateMany({
      where: { userId: ids[index], revokedAt: null },
      data: { lastActiveAt: timestamp },
    });
    return timestamp;
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
    vi.spyOn(app.get(NotificationsService), 'onModuleInit').mockImplementation(
      () => {},
    );
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    password = `Roomora-${randomUUID()}`;
    const passwordHash = await app.get(PasswordService).hash(password);
    for (let index = 0; index < 3; index++) {
      const id = randomUUID();
      ids.push(id);
      const accountEmail = `presence-${id}@example.test`;
      if (index === 1) email = accountEmail;
      await prisma.user.create({
        data: {
          id,
          email: accountEmail,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: `Presence ${index}` } },
        },
      });
      agents.push(request.agent(app.getHttpServer()));
      await post(index, '/api/v1/auth/login', {
        email: accountEmail,
        password,
      }).expect(200);
    }
    const connection = (
      await post(0, '/api/v1/connections', { targetId: ids[1] }).expect(201)
    ).body;
    await post(1, `/api/v1/connections/${connection.id}/accept`, {
      version: connection.version,
    }).expect(201);
    conversationId = (
      await prisma.conversation.findUniqueOrThrow({
        where: { connectionId: connection.id },
      })
    ).id;
    houseId = (
      await post(0, '/api/v1/houses', { name: 'Presence tests' }).expect(201)
    ).body.id;
    const invite = (
      await post(0, `/api/v1/houses/${houseId}/invites`, {
        userId: ids[1],
      }).expect(201)
    ).body;
    await post(
      1,
      `/api/v1/houses/invites/${invite.invites[0].id}/accept`,
    ).expect(201);
  }, 30000);

  afterAll(async () => {
    if (prisma && houseId)
      await prisma.house.deleteMany({ where: { id: houseId } });
    if (prisma && ids.length)
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
    vi.restoreAllMocks();
  });

  it('does not invent activity from login or loading chat', async () => {
    expect((await detail().expect(200)).body.person.presence).toEqual({
      online: false,
      lastActiveAt: null,
    });
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: ids[1] },
    });
    expect(account.lastActiveAt).toBeNull();
  });

  it('authenticates heartbeats, checks Origin and rejects spoofed users/dates', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/presence/heartbeat')
      .set('Origin', origin)
      .send({ idleSeconds: 0 })
      .expect(401);
    await agents[1]
      .post('/api/v1/presence/heartbeat')
      .send({ idleSeconds: 0 })
      .expect(403);
    for (const body of [
      {},
      { idleSeconds: -1 },
      { idleSeconds: 180 },
      { idleSeconds: 0.1 },
      { idleSeconds: '0' },
      { idleSeconds: 0, userId: ids[0] },
      { idleSeconds: 0, lastActiveAt: new Date().toISOString() },
    ])
      await post(1, '/api/v1/presence/heartbeat', body).expect(400);
  });

  it('persists the authenticated activity using the server clock', async () => {
    await heartbeat(1, 5).expect(201);
    const presence = (await detail().expect(200)).body.person.presence;
    expect(presence.online).toBe(true);
    expect(
      Date.now() - Date.parse(presence.lastActiveAt),
    ).toBeGreaterThanOrEqual(5000);
    expect(Date.now() - Date.parse(presence.lastActiveAt)).toBeLessThan(10000);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ids[0] } }))
        .lastActiveAt,
    ).toBeNull();
    const list = await agents[0].get('/api/v1/conversations').expect(200);
    expect(
      list.body.items.find((item: { id: string }) => item.id === conversationId)
        .person.presence.online,
    ).toBe(true);
  });

  it('changes to idle after three minutes; reading/polling never renews activity', async () => {
    await setActivity(1, 179);
    expect((await detail().expect(200)).body.person.presence.online).toBe(true);
    const timestamp = await setActivity(1, 180);
    const presence = (await detail().expect(200)).body.person.presence;
    expect(presence).toEqual({
      online: false,
      lastActiveAt: timestamp.toISOString(),
    });
    await agents[1].get('/api/v1/conversations').expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ids[1] } }))
        .lastActiveAt,
    ).toEqual(timestamp);
    await heartbeat(1).expect(201);
    expect((await detail().expect(200)).body.person.presence.online).toBe(true);
  });

  it('preserves newest activity under concurrent and repeated heartbeats', async () => {
    await setActivity(1, 300);
    await Promise.all([
      heartbeat(1, 179).expect(201),
      heartbeat(1, 0).expect(201),
    ]);
    const latest = (await detail().expect(200)).body.person.presence
      .lastActiveAt;
    expect(Date.now() - Date.parse(latest)).toBeLessThan(5000);
    await heartbeat(1, 179).expect(201);
    expect(
      (await detail().expect(200)).body.person.presence.lastActiveAt,
    ).toEqual(latest);
  });

  it('ignores an untouched new session and expired sessions', async () => {
    const another = request.agent(app.getHttpServer());
    await another
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    expect((await detail().expect(200)).body.person.presence.online).toBe(true);
    const expired = await prisma.session.create({
      data: {
        userId: ids[1],
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() - 1000),
        lastActiveAt: new Date(Date.now() + 60000),
      },
    });
    try {
      await setActivity(1, 180);
      // Keep the expired session newer than all usable sessions.
      await prisma.session.update({
        where: { id: expired.id },
        data: { lastActiveAt: new Date() },
      });
      expect((await detail().expect(200)).body.person.presence.online).toBe(
        false,
      );
    } finally {
      await prisma.session.delete({ where: { id: expired.id } });
      await another
        .post('/api/v1/auth/logout')
        .set('Origin', origin)
        .expect(204);
    }
  });

  it('shares presence only with authorized conversations and current House members', async () => {
    await heartbeat(1).expect(201);
    const house = (await agents[0].get(`/api/v1/houses/${houseId}`).expect(200))
      .body;
    expect(
      house.members.find(
        (member: { userId: string }) => member.userId === ids[1],
      ).presence.online,
    ).toBe(true);
    await agents[2].get(`/api/v1/houses/${houseId}`).expect(404);
    await agents[2].get(`/api/v1/conversations/${conversationId}`).expect(404);
    const block = await prisma.userBlock.create({
      data: { blockerId: ids[0], targetId: ids[1] },
    });
    try {
      await detail().expect(404);
      expect(
        (await agents[0].get('/api/v1/conversations').expect(200)).body.items,
      ).toHaveLength(0);
    } finally {
      await prisma.userBlock.delete({
        where: {
          blockerId_targetId: {
            blockerId: block.blockerId,
            targetId: block.targetId,
          },
        },
      });
    }
    await prisma.houseMember.update({
      where: { houseId_userId: { houseId, userId: ids[1] } },
      data: { leftAt: new Date() },
    });
    await agents[1].get(`/api/v1/houses/${houseId}`).expect(404);
    expect(
      (
        await agents[0].get(`/api/v1/houses/${houseId}`).expect(200)
      ).body.members.map((member: { userId: string }) => member.userId),
    ).not.toContain(ids[1]);
  });

  it('keeps another active device online; the last logout preserves activity history', async () => {
    const another = request.agent(app.getHttpServer());
    await another
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    await another
      .post('/api/v1/presence/heartbeat')
      .set('Origin', origin)
      .send({ idleSeconds: 0 })
      .expect(201);
    await post(1, '/api/v1/auth/logout').expect(204);
    expect((await detail().expect(200)).body.person.presence.online).toBe(true);
    const latest = (await detail().expect(200)).body.person.presence
      .lastActiveAt;
    await another.post('/api/v1/auth/logout').set('Origin', origin).expect(204);
    expect((await detail().expect(200)).body.person.presence).toEqual({
      online: false,
      lastActiveAt: latest,
    });
    await heartbeat(1).expect(401);
  });

  it('does not allow ADMIN to post chat activity', async () => {
    await prisma.user.update({
      where: { id: ids[2] },
      data: { role: 'ADMIN' },
    });
    await heartbeat(2).expect(403);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ids[2] } }))
        .lastActiveAt,
    ).toBeNull();
  });

  it('removes online status and rejects activity from a locked account', async () => {
    const another = request.agent(app.getHttpServer());
    await another
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    await another
      .post('/api/v1/presence/heartbeat')
      .set('Origin', origin)
      .send({ idleSeconds: 0 })
      .expect(201);
    expect((await detail().expect(200)).body.person.presence.online).toBe(true);
    await prisma.user.update({
      where: { id: ids[1] },
      data: { lockedAt: new Date(), lockReason: 'Presence test lock' },
    });
    expect((await detail().expect(200)).body.person.presence.online).toBe(
      false,
    );
    await another
      .post('/api/v1/presence/heartbeat')
      .set('Origin', origin)
      .send({ idleSeconds: 0 })
      .expect(401);
  });
});
