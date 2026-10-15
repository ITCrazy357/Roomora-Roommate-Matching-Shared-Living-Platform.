import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { declareIdentity } from './helpers/identity.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { listingWeek } from '../src/modules/listings/listing-quota.service.js';

describe('Weekly listing quota (HTTP/PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let userId: string;
  let passwordHash: string;
  const password = `Quota-${randomUUID()}`;
  const userIds: string[] = [];
  const origin = 'http://localhost:3000';
  const form = {
    type: 'ROOM_WANTED',
    hasRoom: false,
    title: 'Cần tìm phòng phù hợp để ở lâu dài',
    description:
      'Tìm phòng sạch sẽ có bếp và wifi, khu vực thuận tiện để đi làm.',
    rent: 3000000,
    provinceCode: '01',
    wardCode: '00004',
  };

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
  });

  beforeEach(async () => {
    const email = `quota-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        profile: { create: { displayName: 'Kiểm thử hạn mức' } },
      },
    });
    userId = user.id;
    userIds.push(userId);
    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
  });

  afterAll(async () => {
    if (prisma && userIds.length) {
      const orders = await prisma.serviceOrder.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      await prisma.listingBoost.deleteMany({
        where: { orderId: { in: orders.map((order) => order.id) } },
      });
      await prisma.serviceOrder.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.listing.deleteMany({ where: { ownerId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function draft(input = {}) {
    return (
      await agent
        .post('/api/v1/listings')
        .set('Origin', origin)
        .send({ ...form, ...input })
        .expect(201)
    ).body;
  }
  function submit(listing: { id: string; version: number }) {
    return agent
      .post(`/api/v1/listings/${listing.id}/submit`)
      .set('Origin', origin)
      .send({ version: listing.version });
  }
  async function quota() {
    return (await agent.get('/api/v1/listings/quota').expect(200)).body;
  }
  async function boost(
    options: {
      endsAt?: Date;
      startsAt?: Date;
      status?: 'PENDING' | 'PAID';
      refundedAt?: Date;
      activated?: boolean;
      planCode?: string;
    } = {},
  ) {
    const listing = await prisma.listing.create({
      data: { ownerId: userId, type: 'ROOM_RENTAL', status: 'PUBLISHED' },
    });
    const order = await prisma.serviceOrder.create({
      data: {
        userId,
        listingId: listing.id,
        clientId: randomUUID(),
        planCode: options.planCode ?? 'BOOST_7_DAYS',
        planName: 'Đẩy tin 7 ngày',
        amount: 49000,
        durationDays: 7,
        buyerName: 'Quota fixture',
        buyerEmail: 'fixture@example.test',
        listingTitle: 'Tin thử nghiệm',
        status: options.status ?? 'PAID',
        paidAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        refundedAt: options.refundedAt,
      },
    });
    if (options.activated !== false)
      await prisma.listingBoost.create({
        data: {
          orderId: order.id,
          listingId: listing.id,
          startsAt: options.startsAt ?? new Date(Date.now() - 60000),
          endsAt: options.endsAt ?? new Date(Date.now() + 86400000),
        },
      });
    return { order, listing };
  }

  it('requires authentication and returns only the current account quota', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/listings/quota')
      .expect(401);
    expect(await quota()).toMatchObject({
      used: 0,
      limit: 3,
      remaining: 3,
      bonusUntil: null,
    });
    await draft();
    expect(await quota()).toMatchObject({ used: 0, remaining: 3 });
  });

  it('shares three slots across room searches and both roommate options', async () => {
    for (const input of [
      {},
      { type: 'ROOMMATE', hasRoom: true },
      { type: 'ROOMMATE', hasRoom: false },
    ])
      await submit(await draft(input)).expect(201);
    const fourth = await draft();
    const result = await submit(fourth).expect(429);
    expect(result.body).toMatchObject({
      code: 'LISTING_WEEKLY_LIMIT',
      used: 3,
      limit: 3,
      remaining: 0,
    });
    expect(new Date(result.body.resetsAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(
      await prisma.listing.findUnique({ where: { id: fourth.id } }),
    ).toMatchObject({ status: 'DRAFT', version: fourth.version });
  });

  it('serializes concurrent submissions of different listings at the account limit', async () => {
    const drafts = await Promise.all(Array.from({ length: 10 }, () => draft()));
    const results = await Promise.all(drafts.map((listing) => submit(listing)));
    expect(results.filter((result) => result.status === 201)).toHaveLength(3);
    expect(results.filter((result) => result.status === 429)).toHaveLength(7);
    expect(await prisma.listingSubmission.count({ where: { userId } })).toBe(3);
  });

  it('charges one slot for concurrent retries of the same listing', async () => {
    const listing = await draft();
    const results = await Promise.all([submit(listing), submit(listing)]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(await quota()).toMatchObject({ used: 1 });
  });

  it('exempts rental submissions but checks quota when a rental first becomes a room search', async () => {
    await declareIdentity(app, userId);
    for (let index = 0; index < 3; index++)
      await submit(await draft()).expect(201);
    const rental = await draft({
      type: 'ROOM_RENTAL',
      hasRoom: true,
      area: 25,
      availableFrom: '2026-11-01',
      privateAddress: 'Địa chỉ riêng kiểm thử',
      latitude: 21.03,
      longitude: 105.82,
    });
    await prisma.listingPhoto.create({
      data: {
        listingId: rental.id,
        publicId: `quota-fixture/${rental.id}`,
        url: 'https://example.test/room.jpg',
        position: 0,
      },
    });
    const sent = (await submit(rental).expect(201)).body;
    expect(await quota()).toMatchObject({ used: 3 });
    expect(
      await prisma.listingSubmission.findUnique({
        where: { listingId: rental.id },
      }),
    ).toBeNull();
    const changed = (
      await agent
        .put(`/api/v1/listings/${rental.id}`)
        .set('Origin', origin)
        .send({ ...form, version: sent.version })
        .expect(200)
    ).body;
    await submit(changed).expect(429);
    await prisma.listingSubmission.updateMany({
      where: { userId },
      data: {
        createdAt: new Date(listingWeek(new Date()).startsAt.getTime() - 1),
      },
    });
    await submit(changed).expect(201);
    expect(await quota()).toMatchObject({ used: 1 });
  });

  it('does not charge incomplete, stale, or non-owned submissions', async () => {
    const incomplete = await draft({ title: '' });
    await submit(incomplete).expect(400);
    const valid = await draft();
    await submit({ ...valid, version: valid.version + 1 }).expect(409);
    const other = await prisma.user.create({
      data: { email: `quota-other-${randomUUID()}@example.test` },
    });
    userIds.push(other.id);
    const foreign = await prisma.listing.create({
      data: { ownerId: other.id, type: 'ROOM_WANTED' },
    });
    await submit(foreign).expect(404);
    expect(await quota()).toMatchObject({ used: 0 });
  });

  it('preserves consumed slots across rejection, editing, closing, deletion and type changes', async () => {
    const sent = (await submit(await draft()).expect(201)).body;
    await prisma.listing.update({
      where: { id: sent.id },
      data: { status: 'REJECTED' },
    });
    const resent = (await submit(sent).expect(201)).body;
    const closed = (
      await agent
        .post(`/api/v1/listings/${sent.id}/close`)
        .set('Origin', origin)
        .send({ version: resent.version })
        .expect(201)
    ).body;
    const reopened = (await submit(closed).expect(201)).body;
    const edited = (
      await agent
        .put(`/api/v1/listings/${sent.id}`)
        .set('Origin', origin)
        .send({ ...form, type: 'ROOM_RENTAL', version: reopened.version })
        .expect(200)
    ).body;
    await agent
      .delete(`/api/v1/listings/${sent.id}`)
      .set('Origin', origin)
      .send({ version: edited.version })
      .expect(200);
    expect(await quota()).toMatchObject({ used: 1, remaining: 2 });
  });

  it('excludes last-week usage and does not recharge an existing listing in a new week', async () => {
    const sent = (await submit(await draft()).expect(201)).body;
    const old = new Date(listingWeek(new Date()).startsAt.getTime() - 1);
    await prisma.listingSubmission.update({
      where: { listingId: sent.id },
      data: { createdAt: old },
    });
    await prisma.listing.update({
      where: { id: sent.id },
      data: { status: 'CLOSED' },
    });
    await submit(sent).expect(201);
    expect(await quota()).toMatchObject({ used: 0, remaining: 3 });
    expect(
      (
        await prisma.listingSubmission.findUniqueOrThrow({
          where: { listingId: sent.id },
        })
      ).createdAt,
    ).toEqual(old);
  });

  it('raises the shared limit to eight for activated paid boosts without stacking', async () => {
    await boost();
    await boost();
    expect(await quota()).toMatchObject({ used: 0, limit: 8, remaining: 8 });
    const results = await Promise.all(
      (await Promise.all(Array.from({ length: 10 }, () => draft()))).map(
        (listing) => submit(listing),
      ),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(8);
    expect(results.filter((result) => result.status === 429)).toHaveLength(2);
  });

  it('does not grant bonus for expired, future, pending, refunded, unactivated or other plans', async () => {
    await boost({ endsAt: new Date(Date.now() - 1) });
    await boost({ startsAt: new Date(Date.now() + 60000) });
    await boost({ status: 'PENDING' });
    await boost({ refundedAt: new Date() });
    await boost({ activated: false });
    await boost({ planCode: 'AI_CREDITS_50' });
    expect(await quota()).toMatchObject({
      limit: 3,
      remaining: 3,
      bonusUntil: null,
    });
  });

  it('keeps the purchased account bonus after listing closure and removes it on refund without erasing usage', async () => {
    const { order, listing } = await boost();
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: 'CLOSED', boostUntil: null },
    });
    expect(await quota()).toMatchObject({ limit: 8 });
    for (let index = 0; index < 4; index++)
      await submit(await draft()).expect(201);
    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: { refundedAt: new Date() },
    });
    expect(await quota()).toMatchObject({ used: 4, limit: 3, remaining: 0 });
    await submit(await draft()).expect(429);
  });
});
