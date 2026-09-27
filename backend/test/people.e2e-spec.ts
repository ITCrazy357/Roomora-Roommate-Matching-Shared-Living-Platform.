import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';

describe('Phase 4 people and connections (real PostgreSQL)', () => {
  let app: INestApplication, prisma: PrismaService;
  let a: ReturnType<typeof request.agent>,
    b: ReturnType<typeof request.agent>,
    outsider: ReturnType<typeof request.agent>;
  let aid: string,
    bid: string,
    hiddenId: string,
    privateId: string,
    passwordHash: string;
  const ids: string[] = [],
    prefix = `phase4-${randomUUID()}`,
    password = `Roomora-${randomUUID()}`,
    origin = 'http://localhost:3000';
  const baseProfile = {
    budgetMin: 2000000,
    budgetMax: 3000000,
    desiredLocations: [{ provinceCode: '01', wardCode: '00004' }],
    desiredAreas: ['Phường Ba Đình, Thành phố Hà Nội'],
    sleepSchedule: 'EARLY_BIRD' as const,
    smokingPreference: 'NO_SMOKING' as const,
    petPreference: 'NO_PETS' as const,
    quietLevel: 'QUIET' as const,
  };
  async function account(
    name: string,
    overrides: Partial<Prisma.ProfileCreateWithoutUserInput> = {},
  ) {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${name}@example.test`,
        passwordHash,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            displayName: `${prefix} ${name}`,
            ...baseProfile,
            ...overrides,
          },
        },
      },
    });
    ids.push(user.id);
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password })
      .expect(200);
    return { agent, id: user.id };
  }
  function send(agent: ReturnType<typeof request.agent>, targetId: string) {
    return agent
      .post('/api/v1/connections')
      .set('Origin', origin)
      .send({ targetId, message: 'Mình muốn trao đổi về việc ở ghép.' });
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
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    passwordHash = await app.get(PasswordService).hash(password);
    const first = await account('viewer'),
      second = await account('match'),
      third = await account('outsider');
    a = first.agent;
    aid = first.id;
    b = second.agent;
    bid = second.id;
    outsider = third.agent;
    hiddenId = (
      await account('hidden', {
        showBudget: false,
        showDesiredAreas: false,
        showLifestyle: false,
      })
    ).id;
    privateId = (await account('private', { visibility: 'PRIVATE' })).id;
  }, 30000);
  afterAll(async () => {
    if (prisma && ids.length)
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
  });

  it('requires authentication, rejects self requests and field injection', async () => {
    await request(app.getHttpServer()).get('/api/v1/connections').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Origin', origin)
      .send({ targetId: bid })
      .expect(401);
    await send(a, aid).expect(400);
    await a
      .post('/api/v1/connections')
      .set('Origin', origin)
      .send({ targetId: bid, status: 'ACCEPTED' })
      .expect(400);
    await a
      .post('/api/v1/user-safety/' + aid + '/block')
      .set('Origin', origin)
      .expect(400);
  });
  it('searches and paginates public profiles without exposing private fields', async () => {
    const result = (
      await a.get('/api/v1/people').query({ q: prefix, limit: 2 }).expect(200)
    ).body;
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(
      result.items.map((item: { userId: string }) => item.userId),
    ).not.toContain(aid);
    const second = (
      await a
        .get('/api/v1/people')
        .query({ q: prefix, limit: 2, page: 2 })
        .expect(200)
    ).body;
    expect(second.items).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('@example.test');
    const person = (await a.get('/api/v1/people/' + bid).expect(200)).body;
    expect(person.match.score).toBe(100);
    expect(person.match.assessed).toBe(6);
    const guest = (
      await request(app.getHttpServer())
        .get('/api/v1/people/' + bid)
        .expect(200)
    ).body;
    expect(guest.match.score).toBeNull();
  });
  it('does not filter or score hidden data, and denies private profiles', async () => {
    await a.get('/api/v1/people/' + privateId).expect(404);
    await send(a, privateId).expect(404);
    const hidden = (await a.get('/api/v1/people/' + hiddenId).expect(200)).body;
    expect(hidden.budgetMin).toBeUndefined();
    expect(hidden.desiredAreas).toBeUndefined();
    expect(hidden.sleepSchedule).toBeUndefined();
    expect(hidden.match.assessed).toBe(0);
    for (const filters of [
      { budgetMin: 100 },
      { provinceCode: '01' },
      { sleepSchedule: 'EARLY_BIRD' },
      { petPreference: 'NO_PETS' },
    ]) {
      const found = (
        await a
          .get('/api/v1/people')
          .query({ q: prefix + ' hidden', ...filters })
          .expect(200)
      ).body;
      expect(found.total).toBe(0);
    }
    await a
      .get('/api/v1/people')
      .query({ budgetMin: 4000000, budgetMax: 1000000 })
      .expect(400);
    await a.get('/api/v1/people').query({ wardCode: '00004' }).expect(400);
  });
  it('serializes concurrent opposite invitations into one pending pair', async () => {
    const replies = await Promise.all([
      send(a, bid.toUpperCase()),
      send(b, aid),
    ]);
    expect(replies.map((reply) => reply.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const rows = await prisma.connection.findMany({
      where: {
        OR: [
          { senderId: aid, receiverId: bid },
          { senderId: bid, receiverId: aid },
        ],
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING');
  });
  it('restricts accept/cancel to participants and correct direction with a version', async () => {
    const row = await prisma.connection.findFirstOrThrow({
      where: {
        OR: [
          { senderId: aid, receiverId: bid },
          { senderId: bid, receiverId: aid },
        ],
      },
    });
    const sender = row.senderId === aid ? a : b,
      receiver = row.receiverId === aid ? a : b;
    await outsider
      .post('/api/v1/connections/' + row.id + '/accept')
      .set('Origin', origin)
      .send({ version: row.version })
      .expect(404);
    await sender
      .post('/api/v1/connections/' + row.id + '/accept')
      .set('Origin', origin)
      .send({ version: row.version })
      .expect(409);
    await receiver
      .post('/api/v1/connections/' + row.id + '/cancel')
      .set('Origin', origin)
      .send({ version: row.version })
      .expect(409);
    const accepted = (
      await receiver
        .post('/api/v1/connections/' + row.id + '/accept')
        .set('Origin', origin)
        .send({ version: row.version })
        .expect(201)
    ).body;
    expect(accepted.status).toBe('ACCEPTED');
    await receiver
      .post('/api/v1/connections/' + row.id + '/accept')
      .set('Origin', origin)
      .send({ version: row.version })
      .expect(409);
    expect(
      (await a.get('/api/v1/connections?tab=accepted').expect(200)).body.total,
    ).toBe(1);
    expect(
      (await b.get('/api/v1/connections?tab=accepted').expect(200)).body.total,
    ).toBe(1);
  });
  it('blocks both directions, cancels accepted connection, and unblocking does not restore it', async () => {
    await a
      .post('/api/v1/user-safety/' + bid + '/block')
      .set('Origin', origin)
      .expect(201);
    await a
      .post('/api/v1/user-safety/' + bid + '/block')
      .set('Origin', origin)
      .expect(201);
    await a.get('/api/v1/people/' + bid).expect(404);
    await b.get('/api/v1/people/' + aid).expect(404);
    await a.get('/api/v1/profiles/' + bid).expect(404);
    await b.get('/api/v1/profiles/' + aid).expect(404);
    expect(
      (
        await b
          .get('/api/v1/people')
          .query({ q: prefix + ' viewer' })
          .expect(200)
      ).body.total,
    ).toBe(0);
    await send(b, aid).expect(404);
    expect(
      (await a.get('/api/v1/connections?tab=accepted').expect(200)).body.total,
    ).toBe(0);
    expect(
      (await a.get('/api/v1/connections?tab=blocked').expect(200)).body.total,
    ).toBe(1);
    await b
      .delete('/api/v1/user-safety/' + aid + '/block')
      .set('Origin', origin)
      .expect(200);
    await b.get('/api/v1/people/' + aid).expect(404);
    await a
      .delete('/api/v1/user-safety/' + bid + '/block')
      .set('Origin', origin)
      .expect(200);
    await b.get('/api/v1/people/' + aid).expect(200);
    expect(
      (await a.get('/api/v1/connections?tab=accepted').expect(200)).body.total,
    ).toBe(0);
    await send(a, bid).expect(409);
  });
  it('supports cancellation, rejection, cooldown and resend without duplicate pairs', async () => {
    const target = await account('cancel-target');
    const connection = (await send(a, target.id).expect(201)).body;
    await a
      .post('/api/v1/connections/' + connection.id + '/cancel')
      .set('Origin', origin)
      .send({ version: connection.version })
      .expect(201);
    await send(a, target.id).expect(409);
    await prisma.connection.update({
      where: { id: connection.id },
      data: { updatedAt: new Date(Date.now() - 25 * 60 * 60_000) },
    });
    const renewed = (await send(target.agent, aid).expect(201)).body;
    expect(renewed.id).toBe(connection.id);
    expect(renewed.direction).toBe('sent');
    await a
      .post('/api/v1/connections/' + renewed.id + '/decline')
      .set('Origin', origin)
      .send({ version: renewed.version })
      .expect(201);
    expect(
      (await target.agent.get('/api/v1/connections?tab=sent').expect(200)).body
        .items[0].connection.status,
    ).toBe('DECLINED');
  });
  it('limits successful sends persistently even under concurrent requests', async () => {
    const actor = await account('rate-actor'),
      targets = await Promise.all(
        Array.from({ length: 11 }, (_, index) =>
          account('rate-target-' + index),
        ),
      );
    const replies = await Promise.all(
      targets.map((target) => send(actor.agent, target.id)),
    );
    expect(replies.filter((reply) => reply.status === 201)).toHaveLength(10);
    expect(replies.filter((reply) => reply.status === 429)).toHaveLength(1);
    expect(
      await prisma.connectionAttempt.count({ where: { senderId: actor.id } }),
    ).toBe(10);
    await prisma.connectionAttempt.updateMany({
      where: { senderId: actor.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60_000) },
    });
    await prisma.connectionAttempt.createMany({
      data: Array.from({ length: 20 }, () => ({
        senderId: actor.id,
        createdAt: new Date(Date.now() - 2 * 60 * 60_000),
      })),
    });
    const last = targets.find((_, index) => replies[index].status === 429)!;
    await send(actor.agent, last.id).expect(429);
  }, 30000);
  it('records reports, rejects duplicates and self reports, and limits reporting', async () => {
    const actor = await account('report-actor');
    const report = {
      reason: 'HARASSMENT',
      details: 'Người dùng gửi nhiều lời nhắn làm phiền.',
    };
    await actor.agent
      .post('/api/v1/user-safety/' + actor.id + '/report')
      .set('Origin', origin)
      .send(report)
      .expect(400);
    const targets = [aid, bid, hiddenId, privateId, ids[2]];
    for (const id of targets)
      await actor.agent
        .post('/api/v1/user-safety/' + id + '/report')
        .set('Origin', origin)
        .send(report)
        .expect(201);
    await actor.agent
      .post('/api/v1/user-safety/' + aid + '/report')
      .set('Origin', origin)
      .send(report)
      .expect(409);
    const target = await account('extra-report-target');
    await actor.agent
      .post('/api/v1/user-safety/' + target.id + '/report')
      .set('Origin', origin)
      .send(report)
      .expect(429);
    expect(
      await prisma.userReport.count({
        where: { reporterId: actor.id, status: 'OPEN' },
      }),
    ).toBe(5);
    expect(
      (await a.get('/api/v1/people/' + actor.id).expect(200)).body.reports,
    ).toBeUndefined();
  }, 30000);
  it('resolves a racing block and accept without leaving an active blocked connection', async () => {
    const first = await account('race-a'),
      second = await account('race-b');
    const row = (await send(first.agent, second.id).expect(201)).body;
    const replies = await Promise.all([
      first.agent
        .post('/api/v1/user-safety/' + second.id + '/block')
        .set('Origin', origin),
      second.agent
        .post('/api/v1/connections/' + row.id + '/accept')
        .set('Origin', origin)
        .send({ version: row.version }),
    ]);
    expect(replies[0].status).toBe(201);
    expect([201, 404]).toContain(replies[1].status);
    expect(
      (await prisma.connection.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe('CANCELLED');
  });
});
