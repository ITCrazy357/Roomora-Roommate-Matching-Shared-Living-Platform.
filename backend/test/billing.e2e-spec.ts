import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { BillingSchedulerService } from '../src/modules/billing/billing-scheduler.service.js';
import { momoSignature } from '../src/modules/billing/momo-signature.js';
import { ListingQueryDto } from '../src/modules/listings/dto/listing.dto.js';
import { ListingQueriesService } from '../src/modules/listings/listing-queries.service.js';
import { PaymentGatewayService } from '../src/modules/billing/payment-gateway.service.js';
import { ServiceOrdersService } from '../src/modules/billing/service-orders.service.js';
import type { ServiceOrder } from '../src/generated/prisma/client.js';

describe('Phase 9 billing (HTTP + PostgreSQL, simulated signed MoMo)', () => {
  let app: INestApplication, prisma: PrismaService, config: ConfigService;
  const userIds: string[] = [],
    listingIds: string[] = [],
    agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000',
    prefix = 'billing-' + randomUUID();
  const secret = 'test-only-secret-with-no-merchant-account',
    access = 'test-access',
    partner = 'ROOMORA_TEST';
  const base = '/api/v1/services';
  const post = (path: string, body?: object, index = 0) =>
    agents[index]
      .post(base + path)
      .set('Origin', origin)
      .send(body);
  const create = async (listingId = listingIds[0], clientId = randomUUID()) =>
    (await post('/orders', { listingId, clientId }).expect(201))
      .body as ServiceOrder;
  function signed(
    order: ServiceOrder,
    change: Record<string, string | number> = {},
  ) {
    const body = {
      partnerCode: partner,
      orderId: order.id,
      requestId: order.id,
      amount: order.amount,
      orderInfo: order.planName,
      orderType: 'momo_wallet',
      transId: Math.floor(Math.random() * 1000000000000) + 1,
      resultCode: 0,
      message: 'Thành công',
      payType: 'qr',
      responseTime: Date.now(),
      extraData: '',
      ...change,
    };
    const b = body;
    // Independent provider-side construction, following MoMo's published IPN string.
    const raw = `accessKey=${access}&amount=${b.amount}&extraData=${b.extraData}&message=${b.message}&orderId=${b.orderId}&orderInfo=${b.orderInfo}&orderType=${b.orderType}&partnerCode=${b.partnerCode}&payType=${b.payType}&requestId=${b.requestId}&responseTime=${b.responseTime}&resultCode=${b.resultCode}&transId=${b.transId}`;
    return {
      ...body,
      signature: createHmac('sha256', secret).update(raw).digest('hex'),
    };
  }
  const ipn = (body: object) =>
    request(app.getHttpServer())
      .post(base + '/momo/ipn')
      .send(body);
  const get = async (id: string) =>
    (await agents[0].get(base + '/orders/' + id).expect(200)).body;
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    config = app.get(ConfigService);
    for (const [key, value] of Object.entries({
      NODE_ENV: 'test',
      BILLING_PAYMENT_PROVIDER: 'MOMO_SANDBOX',
      SMTP_HOST: '',
      MOMO_PARTNER_CODE: partner,
      MOMO_ACCESS_KEY: access,
      MOMO_SECRET_KEY: secret,
      MOMO_IPN_URL: 'https://example.test/api/v1/services/momo/ipn',
    }))
      config.set(key, value);
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
    const password = 'Roomora-' + randomUUID(),
      passwordHash = await app.get(PasswordService).hash(password);
    for (let i = 0; i < 3; i++) {
      const id = randomUUID(),
        email = `${prefix}-${i}@example.test`;
      userIds.push(id);
      await prisma.user.create({
        data: {
          id,
          email,
          passwordHash,
          emailVerifiedAt: new Date(),
          role: i === 2 ? 'ADMIN' : 'USER',
          profile: { create: { displayName: `Người thử ${i}` } },
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
    for (let i = 0; i < 3; i++) {
      const row = await prisma.listing.create({
        data: {
          ownerId: userIds[i === 2 ? 1 : 0],
          type: 'ROOM_WANTED',
          status: 'PUBLISHED',
          title: `${prefix} Tin tìm phòng ${i}`,
          rent: 2000000 + i * 1000000,
          publishedAt: new Date(Date.now() + i * 1000),
        },
      });
      listingIds.push(row.id);
    }
  }, 30000);
  async function clear() {
    await prisma.servicePaymentEvent.deleteMany({
      where: { order: { userId: { in: userIds } } },
    });
    await prisma.serviceRefundRequest.deleteMany({
      where: { order: { userId: { in: userIds } } },
    });
    await prisma.listingBoost.deleteMany({
      where: { listingId: { in: listingIds } },
    });
    await prisma.serviceOrder.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds }, type: 'SERVICE' },
    });
    await prisma.listing.updateMany({
      where: { id: { in: listingIds } },
      data: {
        boostUntil: null,
        status: 'PUBLISHED',
        isFull: false,
        postingRound: 1,
        deletedAt: null,
      },
    });
    for (const [index, id] of listingIds.entries()) {
      await prisma.listing.update({
        where: { id },
        data: { publishedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)) },
      });
    }
  }
  beforeEach(async () => {
    config.set('BILLING_PAYMENT_PROVIDER', 'MOMO_SANDBOX');
    config.set('PAYOS_CLIENT_ID', '');
    config.set('PAYOS_API_KEY', '');
    config.set('PAYOS_CHECKSUM_KEY', '');
    await clear();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (prisma) {
      await clear();
      await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });
  it('deleting an edited draft preserves payments and refunds late pending orders without boosting', async () => {
    const paid = await create();
    await ipn(signed(paid)).expect(204);
    await prisma.listing.update({
      where: { id: listingIds[0] },
      data: { postingRound: 2 },
    });
    const pending = await create();
    const listing = await prisma.listing.update({
      where: { id: listingIds[0] },
      data: { status: 'DRAFT', version: { increment: 1 } },
    });
    await agents[0]
      .delete(`/api/v1/listings/${listing.id}`)
      .set('Origin', origin)
      .send({ version: listing.version })
      .expect(200);
    const deleted = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(deleted.boostUntil).toBeNull();
    expect((await get(paid.id)).status).toBe('PAID');
    expect((await get(pending.id)).status).toBe('EXPIRED');
    await agents[0].get(base + `/orders/${paid.id}/receipt`).expect(200);
    const boosts = await prisma.listingBoost.count({
      where: { listingId: listing.id },
    });
    await ipn(signed(pending)).expect(204);
    expect((await get(pending.id)).status).toBe('PAID');
    expect(
      await prisma.serviceRefundRequest.count({
        where: { orderId: pending.id },
      }),
    ).toBe(1);
    expect(
      await prisma.listingBoost.count({ where: { listingId: listing.id } }),
    ).toBe(boosts);
    await agents[0].get(`/api/v1/listings/mine/${listing.id}`).expect(404);
  });

  it('catalog exposes one sandbox plan without secrets', async () => {
    const response = await request(app.getHttpServer())
      .get(base + '/catalog')
      .expect(200);
    expect(response.body).toEqual({
      plan: {
        code: 'BOOST_7_DAYS',
        name: 'Đẩy tin 7 ngày',
        amount: 49000,
        durationDays: 7,
        currency: 'VND',
      },
      sandbox: true,
      provider: 'MOMO_SANDBOX',
      paymentAvailable: true,
      providers: { MOMO_SANDBOX: true, PAYOS: false },
    });
  });
  it('requires login and separates admin from consumer purchasing', async () => {
    await request(app.getHttpServer())
      .get(base + '/orders')
      .expect(401);
    await post(
      '/orders',
      { listingId: listingIds[0], clientId: randomUUID() },
      2,
    ).expect(403);
  });
  it('preserves Origin protection on purchases while signed IPN needs no Origin', async () => {
    await agents[0]
      .post(base + '/orders')
      .send({ listingId: listingIds[0], clientId: randomUUID() })
      .expect(403);
    const order = await create();
    await ipn(signed(order)).expect(204);
  });
  it('takes price/duration on server and rejects injected payment fields', async () => {
    await post('/orders', {
      listingId: listingIds[0],
      clientId: randomUUID(),
      amount: 1,
      status: 'PAID',
    }).expect(400);
    const order = await create();
    expect(order.amount).toBe(49000);
    expect(order.durationDays).toBe(7);
    expect(order.status).toBe('PENDING');
  });
  it('cannot buy another user listing or inspect their order/refund/receipt', async () => {
    await create();
    await post('/orders', {
      listingId: listingIds[2],
      clientId: randomUUID(),
    }).expect(404);
    const order = await create();
    await agents[1].get(base + '/orders/' + order.id).expect(404);
    await post(`/orders/${order.id}/checkout`, {}, 1).expect(404);
    await post(
      `/orders/${order.id}/refund-request`,
      { reason: 'Không phải đơn của tôi' },
      1,
    ).expect(404);
    await agents[1].get(base + `/orders/${order.id}/receipt`).expect(404);
  });
  it.each(['DRAFT', 'PENDING', 'CLOSED', 'REJECTED'] as const)(
    'rejects %s listing',
    async (status) => {
      await prisma.listing.update({
        where: { id: listingIds[0] },
        data: { status },
      });
      await post('/orders', {
        listingId: listingIds[0],
        clientId: randomUUID(),
      }).expect(400);
    },
  );
  it('rejects full listings and limits eligible options to own public listings', async () => {
    await prisma.listing.update({
      where: { id: listingIds[0] },
      data: { isFull: true },
    });
    await post('/orders', {
      listingId: listingIds[0],
      clientId: randomUUID(),
    }).expect(400);
    const result = await agents[0].get(base + '/listings').expect(200);
    expect(result.body.map((row: { id: string }) => row.id)).toEqual([
      listingIds[1],
    ]);
  });
  it('creates one order under concurrent retries, and rejects changed retry identity', async () => {
    const clientId = randomUUID();
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        post('/orders', { listingId: listingIds[0], clientId }).expect(201),
      ),
    );
    expect(new Set(replies.map((reply) => reply.body.id)).size).toBe(1);
    await post('/orders', { listingId: listingIds[1], clientId }).expect(409);
  });
  it('reuses a pending listing order even with different client ids', async () => {
    const first = await create();
    const second = await create();
    expect(first.id).toBe(second.id);
  });
  it('disabled gateway creates no order', async () => {
    config.set('MOMO_SECRET_KEY', '');
    try {
      await post('/orders', {
        listingId: listingIds[0],
        clientId: randomUUID(),
      }).expect(503);
      expect(
        await prisma.serviceOrder.count({ where: { userId: userIds[0] } }),
      ).toBe(0);
    } finally {
      config.set('MOMO_SECRET_KEY', secret);
    }
  });
  it('rejects forged or tampered signatures without writes', async () => {
    const order = await create(),
      body = signed(order);
    await ipn({ ...body, signature: 'a'.repeat(64) }).expect(400);
    await ipn({ ...body, amount: 1 }).expect(400);
    expect(
      await prisma.servicePaymentEvent.count({ where: { orderId: order.id } }),
    ).toBe(0);
    expect((await get(order.id)).status).toBe('PENDING');
  });
  it.each([
    { amount: 1 },
    { partnerCode: 'OTHER' },
    { requestId: randomUUID() },
    { orderInfo: 'Gói khác' },
    { transId: 0 },
    { amount: '49000' },
    { responseTime: Date.now() + 86400000 },
  ])('rejects signed mismatched fields %j', async (change) => {
    const order = await create();
    await ipn(signed(order, change)).expect(400);
    expect((await get(order.id)).status).toBe('PENDING');
  });
  it('rejects an unknown signed order', async () => {
    const order = await create(),
      id = randomUUID();
    await ipn(signed(order, { orderId: id, requestId: id })).expect(404);
  });
  it('rejects malformed signed UUID before querying the database', async () => {
    const order = await create(),
      id = '-'.repeat(36);
    await ipn(signed(order, { orderId: id, requestId: id })).expect(400);
  });
  it('records late payment for a locked account without granting a boost', async () => {
    const order = await create();
    await prisma.user.update({
      where: { id: userIds[0] },
      data: {
        lockedAt: new Date(),
        lockReason: 'Khóa để kiểm thử thanh toán đến chậm',
      },
    });
    try {
      await ipn(signed(order)).expect(204);
      const paid = await prisma.serviceOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { boost: true, refund: true },
      });
      expect(paid.status).toBe('PAID');
      expect(paid.boost).toBeNull();
      expect(paid.refund).not.toBeNull();
    } finally {
      await prisma.user.update({
        where: { id: userIds[0] },
        data: { lockedAt: null, lockReason: null },
      });
    }
  });
  it('does not notify a re-signed identical failure twice', async () => {
    const order = await create();
    await ipn(signed(order, { resultCode: 1006, transId: 0 })).expect(204);
    await ipn(
      signed(order, {
        resultCode: 1006,
        transId: 0,
        responseTime: Date.now() + 1000,
      }),
    ).expect(204);
    expect(
      await prisma.notification.count({
        where: { userId: userIds[0], type: 'SERVICE' },
      }),
    ).toBe(1);
  });
  it('activates exactly once under parallel duplicate callbacks', async () => {
    const order = await create(),
      body = signed(order);
    await Promise.all(Array.from({ length: 8 }, () => ipn(body).expect(204)));
    const paid = await get(order.id);
    expect(paid.status).toBe('PAID');
    expect(
      new Date(paid.boost.endsAt).getTime() -
        new Date(paid.boost.startsAt).getTime(),
    ).toBe(7 * 86400000);
    expect(
      await prisma.listingBoost.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: userIds[0], type: 'SERVICE' },
      }),
    ).toBe(1);
  });
  it('a re-signed duplicate cannot extend the existing entitlement', async () => {
    const order = await create(),
      body = signed(order);
    await ipn(body).expect(204);
    const before = await get(order.id);
    await ipn(
      signed(order, { transId: body.transId, responseTime: Date.now() + 1000 }),
    ).expect(204);
    expect((await get(order.id)).boost.endsAt).toBe(before.boost.endsAt);
  });
  it('records failures and never lets them downgrade a paid order', async () => {
    const order = await create();
    await ipn(signed(order, { resultCode: 1006, transId: 0 })).expect(204);
    expect((await get(order.id)).status).toBe('FAILED');
    await ipn(signed(order)).expect(204);
    const before = await get(order.id);
    await ipn(signed(order, { resultCode: 1006, transId: 0 })).expect(204);
    expect((await get(order.id)).boost.endsAt).toBe(before.boost.endsAt);
  });
  it.each([1000, 7000, 7002, 9000])(
    'does not activate noncaptured result %s',
    async (resultCode) => {
      const order = await create();
      await ipn(signed(order, { resultCode })).expect(204);
      expect((await get(order.id)).status).toBe('PENDING');
      expect((await get(order.id)).boost).toBeNull();
    },
  );
  it('expires pending orders, then grants full duration for delayed success', async () => {
    const order = await create();
    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await app.get(BillingSchedulerService).expire();
    expect((await get(order.id)).status).toBe('EXPIRED');
    await post(`/orders/${order.id}/checkout`).expect(409);
    await ipn(signed(order)).expect(204);
    expect((await get(order.id)).status).toBe('PAID');
  });
  it('late success for an ineligible listing records payment and refund request without boost', async () => {
    const order = await create();
    await prisma.listing.update({
      where: { id: listingIds[0] },
      data: { status: 'CLOSED' },
    });
    await ipn(signed(order)).expect(204);
    await ipn(
      signed(order, { transId: (await get(order.id)).providerTransId * 1 }),
    ).expect(204);
    const paid = await get(order.id);
    expect(paid.status).toBe('PAID');
    expect(paid.boost).toBeNull();
    expect(paid.refund.reason).toContain('đối soát');
  });
  it('grants once and records a refund for concurrent late payments in the same round', async () => {
    const first = await create();
    await prisma.serviceOrder.update({
      where: { id: first.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const second = await create();
    await Promise.all([
      ipn(signed(first)).expect(204),
      ipn(signed(second)).expect(204),
    ]);
    const boosts = await prisma.listingBoost.findMany({
      where: { listingId: listingIds[0] },
      orderBy: { startsAt: 'asc' },
    });
    expect(boosts).toHaveLength(1);
    const orders = await prisma.serviceOrder.findMany({
      where: { id: { in: [first.id, second.id] } },
      include: { refund: true },
    });
    expect(orders.every((order) => order.status === 'PAID')).toBe(true);
    expect(orders.filter((order) => order.refund)).toHaveLength(1);
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: listingIds[0] },
    });
    expect(listing.boostUntil).toEqual(boosts[0].endsAt);
  });
  it('refuses reuse of a provider transaction across orders', async () => {
    const first = await create(),
      second = await create(listingIds[1]),
      body = signed(first);
    await ipn(body).expect(204);
    await ipn(signed(second, { transId: body.transId })).expect(409);
    expect((await get(second.id)).status).toBe('PENDING');
  });

  it.each(['MOMO_SANDBOX', 'PAYOS'])(
    'blocks repeat purchases after %s success, including after benefit expiry',
    async (provider) => {
      if (provider === 'PAYOS') usePayos();
      const order = await create();
      if (provider === 'PAYOS') await webhook(payosEvent(order)).expect(200);
      else await ipn(signed(order)).expect(204);
      await prisma.listing.update({
        where: { id: order.listingId },
        data: { boostUntil: new Date(Date.now() - 1000) },
      });
      const attempts = await Promise.all(
        Array.from({ length: 6 }, () =>
          post('/orders', {
            listingId: order.listingId,
            clientId: randomUUID(),
          }).expect(409),
        ),
      );
      expect(
        attempts.every(
          (response) => response.body.code === 'LISTING_ALREADY_PAID',
        ),
      ).toBe(true);
      expect((await create(order.listingId, order.clientId)).id).toBe(order.id);
      await post(`/orders/${order.id}/checkout`).expect(409);
      const options = (await agents[0].get(base + '/listings').expect(200))
        .body;
      expect(
        options.find((row: { id: string }) => row.id === order.listingId)
          .paymentCompleted,
      ).toBe(true);
      expect(
        await prisma.serviceOrder.count({
          where: { listingId: order.listingId },
        }),
      ).toBe(1);
    },
  );

  it('allows retry after failure and never marks pending or failed orders paid', async () => {
    const first = await create();
    const options = async () =>
      (await agents[0].get(base + '/listings').expect(200)).body;
    expect(
      (await options()).find(
        (row: { id: string }) => row.id === first.listingId,
      ).paymentCompleted,
    ).toBe(false);
    await ipn(signed(first, { resultCode: 1006 })).expect(204);
    expect(
      (await options()).find(
        (row: { id: string }) => row.id === first.listingId,
      ).paymentCompleted,
    ).toBe(false);
    const retry = await create();
    expect(retry.id).not.toBe(first.id);
    await ipn(signed(retry)).expect(204);
    expect((await get(retry.id)).boost).not.toBeNull();
  });

  it('keeps the paid round through edit and review; closing and reopening starts a new round', async () => {
    const order = await create();
    const event = signed(order);
    await ipn(event).expect(204);
    const details = async () =>
      (
        await agents[0]
          .get(`/api/v1/listings/mine/${order.listingId}`)
          .expect(200)
      ).body;
    const edit = async () => {
      const current = await details();
      return (
        await agents[0]
          .put(`/api/v1/listings/${order.listingId}`)
          .set('Origin', origin)
          .send({
            version: current.version,
            type: 'ROOM_WANTED',
            title: current.title,
            description: 'Tìm phòng phù hợp để ở lâu dài tại khu vực đã chọn.',
            rent: 2000000,
            provinceCode: '01',
            wardCode: '00004',
          })
          .expect(200)
      ).body;
    };
    const publish = async (version: number) => {
      const pending = (
        await agents[0]
          .post(`/api/v1/listings/${order.listingId}/submit`)
          .set('Origin', origin)
          .send({ version })
          .expect(201)
      ).body;
      return (
        await agents[2]
          .post(`/api/v1/admin/listings/${order.listingId}/review`)
          .set('Origin', origin)
          .send({ version: pending.version, decision: 'PUBLISHED' })
          .expect(201)
      ).body;
    };
    let listing = await publish((await edit()).version);
    expect(listing).toMatchObject({ postingRound: 1, paymentCompleted: true });
    await post('/orders', {
      listingId: order.listingId,
      clientId: randomUUID(),
    }).expect(409);
    await agents[0]
      .post(`/api/v1/listings/${order.listingId}/close`)
      .set('Origin', origin)
      .send({ version: listing.version })
      .expect(201);
    listing = await publish((await edit()).version);
    expect(listing).toMatchObject({
      postingRound: 2,
      paymentCompleted: false,
      sponsored: false,
    });
    const second = await create();
    expect(second.postingRound).toBe(2);
    await ipn(event).expect(204);
    expect((await details()).sponsored).toBe(false);
    await ipn(signed(second)).expect(204);
    expect((await details()).paymentCompleted).toBe(true);
  });

  it('rechecks paid state when an older payment arrives while checkout is being created', async () => {
    const first = await create();
    await prisma.serviceOrder.update({
      where: { id: first.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const second = await create();
    let finish!: (value: { payUrl: string }) => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gateway = vi
      .spyOn(app.get(PaymentGatewayService), 'create')
      .mockImplementation(() => {
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
    const checkout = post(`/orders/${second.id}/checkout`).then(
      (response) => response,
    );
    await waiting;
    await post(`/orders/${second.id}/checkout`).expect(409);
    await ipn(signed(first)).expect(204);
    finish({ payUrl: 'https://test-payment.momo.vn/checkout-test' });
    expect((await checkout).status).toBe(409);
    expect(gateway).toHaveBeenCalledTimes(1);
    expect((await get(second.id)).status).toBe('EXPIRED');
    expect((await get(second.id)).payUrl).toBeNull();
  });

  it('expires checkout on close and refunds a payment from an old round without granting the new round', async () => {
    const first = await create();
    const listing = (
      await agents[0]
        .get(`/api/v1/listings/mine/${first.listingId}`)
        .expect(200)
    ).body;
    const closed = (
      await agents[0]
        .post(`/api/v1/listings/${first.listingId}/close`)
        .set('Origin', origin)
        .send({ version: listing.version })
        .expect(201)
    ).body;
    expect(closed.postingRound).toBe(2);
    expect((await get(first.id)).status).toBe('EXPIRED');
    await prisma.listing.update({
      where: { id: first.listingId },
      data: { status: 'PUBLISHED' },
    });
    const second = await create();
    await ipn(signed(first)).expect(204);
    expect(await get(first.id)).toMatchObject({
      status: 'PAID',
      boost: null,
      listing: { postingRound: 2 },
    });
    expect((await get(first.id)).refund).not.toBeNull();
    expect((await get(second.id)).status).toBe('PENDING');
    await ipn(signed(second)).expect(204);
    expect((await get(second.id)).boost).not.toBeNull();
  });
  it('shows sponsorship, respects filters/price sorting/pagination, and ends without a worker', async () => {
    const order = await create();
    await ipn(signed(order)).expect(204);
    const queries = app.get(ListingQueriesService),
      query = Object.assign(new ListingQueryDto(), {
        search: prefix,
        limit: 1,
      });
    const newest = await queries.listPublic(query);
    expect(newest.items[0].id).toBe(listingIds[0]);
    expect(newest.items[0].sponsored).toBe(true);
    expect(newest.items[0]).not.toHaveProperty('privateAddress');
    const page2 = await queries.listPublic(
      Object.assign(new ListingQueryDto(), {
        search: prefix,
        limit: 1,
        page: 2,
      }),
    );
    expect(page2.items[0].id).toBe(listingIds[2]);
    expect(page2.total).toBe(3);
    const price = await queries.listPublic(
      Object.assign(new ListingQueryDto(), {
        search: prefix,
        sort: 'price_desc',
      }),
    );
    expect(price.items[0].id).toBe(listingIds[2]);
    const filtered = await queries.listPublic(
      Object.assign(new ListingQueryDto(), {
        search: prefix,
        minRent: 3000000,
      }),
    );
    expect(filtered.items.some((row) => row.id === listingIds[0])).toBe(false);
    await prisma.listing.update({
      where: { id: listingIds[0] },
      data: { boostUntil: new Date(Date.now() - 1000) },
    });
    const expired = await queries.listPublic(query);
    expect(expired.items[0].id).toBe(listingIds[2]);
    expect((await queries.getPublic(listingIds[0])).sponsored).toBe(false);
  });
  it('accepts one refund request without claiming money was refunded', async () => {
    const order = await create();
    await post(`/orders/${order.id}/refund-request`, {
      reason: 'Tôi cần kiểm tra giao dịch',
    }).expect(400);
    await ipn(signed(order)).expect(204);
    await post(`/orders/${order.id}/refund-request`, { reason: 'Ngắn' }).expect(
      400,
    );
    const replies = await Promise.all([
      post(`/orders/${order.id}/refund-request`, {
        reason: 'Tôi muốn kiểm tra và hoàn tiền',
      }).expect(201),
      post(`/orders/${order.id}/refund-request`, {
        reason: 'Yêu cầu gửi lại khi mất mạng',
      }).expect(201),
    ]);
    expect(replies[0].body.id).toBe(replies[1].body.id);
    expect((await get(order.id)).status).toBe('PAID');
    expect((await get(order.id)).boost).not.toBeNull();
  });
  it('exports a private PDF only after success with receipt snapshots', async () => {
    const order = await create();
    await agents[0].get(base + `/orders/${order.id}/receipt`).expect(409);
    await ipn(signed(order)).expect(204);
    await prisma.listing.update({
      where: { id: order.listingId },
      data: { title: 'Nội dung thay đổi' },
    });
    expect((await get(order.id)).listingTitle).toBe(order.listingTitle);
    const pdf = await agents[0]
      .get(base + `/orders/${order.id}/receipt`)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['cache-control']).toBe('private, no-store');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });
  it('creates a signed sandbox checkout, caches link, and does not activate on creation', async () => {
    const order = await create();
    const fakeFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_url, init) => {
        if (typeof init?.body !== 'string')
          throw new Error('Expected JSON request');
        const payload = JSON.parse(init.body);
        const raw = `accessKey=${access}&amount=49000&extraData=&ipnUrl=https://example.test/api/v1/services/momo/ipn&orderId=${order.id}&orderInfo=Đẩy tin 7 ngày&partnerCode=${partner}&redirectUrl=${origin}/dich-vu/ket-qua&requestId=${order.id}&requestType=captureWallet`;
        expect(payload.signature).toBe(
          createHmac('sha256', secret).update(raw).digest('hex'),
        );
        expect(payload.autoCapture).toBe(true);
        const reply = {
          amount: 49000,
          orderId: order.id,
          partnerCode: partner,
          payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=test',
          requestId: order.id,
          responseTime: Date.now(),
          resultCode: 0,
        };
        return new Response(
          JSON.stringify({
            ...reply,
            signature: momoSignature({ accessKey: access, ...reply }, secret),
          }),
          { status: 200 },
        );
      });
    await post(`/orders/${order.id}/checkout`).expect(200);
    await post(`/orders/${order.id}/checkout`).expect(200);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect((await get(order.id)).status).toBe('PENDING');
  });
  it('gateway network ambiguity keeps one pending order, same id on retry', async () => {
    const order = await create();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    await post(`/orders/${order.id}/checkout`).expect(503);
    expect((await get(order.id)).status).toBe('PENDING');
    expect((await create()).id).toBe(order.id);
  });
  it('rejects untrusted checkout URL/signature without redirecting user', async () => {
    const order = await create();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ payUrl: 'https://evil.test/', signature: 'x' }),
        { status: 200 },
      ),
    );
    await post(`/orders/${order.id}/checkout`).expect(503);
    expect((await get(order.id)).payUrl).toBeNull();
  });
  it('paginates history and purchased entitlements separately', async () => {
    const first = await create(),
      second = await create(listingIds[1]);
    await ipn(signed(first)).expect(204);
    const history = await agents[0]
      .get(base + '/orders?limit=1&page=1')
      .expect(200);
    expect(history.body.total).toBe(2);
    expect(history.body.pages).toBe(2);
    const boosts = await agents[0]
      .get(base + '/orders?kind=boosts')
      .expect(200);
    expect(boosts.body.items.map((row: { id: string }) => row.id)).toEqual([
      first.id,
    ]);
    expect(boosts.body.total).toBe(1);
    expect(second.id).not.toBe(first.id);
  });

  function usePayos() {
    config.set('BILLING_PAYMENT_PROVIDER', 'PAYOS');
    config.set('PAYOS_CLIENT_ID', 'test-payos-client');
    config.set('PAYOS_API_KEY', 'test-payos-api');
    config.set('PAYOS_CHECKSUM_KEY', secret);
  }
  const linkId = '124c33293c43417ab7879e14c8d9eb18';
  function payosSigned(data: Record<string, unknown>) {
    // Independent provider-side implementation for scalar webhook/response fields.
    const raw = Object.keys(data)
      .sort()
      .map((key) => {
        const value = data[key];
        if (Array.isArray(value))
          return `${key}=${JSON.stringify(
            value.map((row) =>
              Object.fromEntries(
                Object.keys(row)
                  .sort()
                  .map((name) => [name, row[name]]),
              ),
            ),
          )}`;
        if (
          value != null &&
          typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean'
        )
          throw new Error('Expected scalar provider data');
        return `${key}=${value ?? ''}`;
      })
      .join('&');
    return {
      code: '00',
      desc: 'success',
      success: true,
      data,
      signature: createHmac('sha256', secret).update(raw).digest('hex'),
    };
  }
  function payosEvent(
    order: ServiceOrder,
    change: Record<string, unknown> = {},
  ) {
    return payosSigned({
      orderCode: Number(order.providerOrderCode),
      amount: order.amount,
      description: 'ROOMORA',
      accountNumber: '12345678',
      reference: 'PAYOS-' + randomUUID(),
      transactionDateTime: '2026-10-11 12:00:00',
      currency: 'VND',
      paymentLinkId: linkId,
      code: '00',
      desc: 'Thành công',
      counterAccountBankId: '',
      counterAccountBankName: '',
      counterAccountName: '',
      counterAccountNumber: '',
      virtualAccountName: '',
      virtualAccountNumber: '',
      ...change,
    });
  }
  function payosLink(
    order: ServiceOrder,
    change: Record<string, unknown> = {},
  ) {
    return payosSigned({
      id: linkId,
      orderCode: Number(order.providerOrderCode),
      amount: order.amount,
      amountPaid: 0,
      amountRemaining: order.amount,
      status: 'PENDING',
      ...change,
    });
  }
  async function linkedPayos() {
    usePayos();
    const order = await create();
    return prisma.serviceOrder.update({
      where: { id: order.id },
      data: {
        payUrl: `https://pay.payos.vn/web/${linkId}`,
        providerLinkId: linkId,
      },
    });
  }
  function paidPayosLink(
    order: ServiceOrder,
    change: Record<string, unknown> = {},
  ) {
    return payosLink(order, {
      status: 'PAID',
      amountPaid: order.amount,
      amountRemaining: 0,
      transactions: [
        {
          reference: 'RECONCILE-' + order.id,
          amount: order.amount,
          transactionDateTime: '2026-10-13T00:07:20+07:00',
          counterAccountBankId: '970422',
          counterAccountBankName: 'MB Bank',
          counterAccountNumber: '00123456789',
          counterAccountName: 'NGUYEN VAN TEST',
        },
      ],
      ...change,
    });
  }
  const webhook = (body: object) =>
    request(app.getHttpServer())
      .post(base + '/payos/webhook')
      .send(body);

  it('PayOS catalog explicitly describes real payments and keeps the 49000 price', async () => {
    usePayos();
    const response = await request(app.getHttpServer())
      .get(base + '/catalog')
      .expect(200);
    expect(response.body).toMatchObject({
      provider: 'PAYOS',
      sandbox: false,
      paymentAvailable: true,
      plan: { amount: 49000 },
      providers: { MOMO_SANDBOX: true, PAYOS: true },
    });
    const order = await create();
    expect(order.provider).toBe('PAYOS');
    expect(Number.isSafeInteger(Number(order.providerOrderCode))).toBe(true);
    expect((await create()).id).toBe(order.id);
  });
  it('PayOS without credentials refuses purchases before writing an order', async () => {
    config.set('BILLING_PAYMENT_PROVIDER', 'PAYOS');
    await post('/orders', {
      listingId: listingIds[0],
      clientId: randomUUID(),
    }).expect(503);
    expect(
      await prisma.serviceOrder.count({ where: { userId: userIds[0] } }),
    ).toBe(0);
  });
  it('retains old providers after switching and routes each checkout to its own gateway', async () => {
    const momo = await create();
    usePayos();
    expect((await create()).id).toBe(momo.id);
    const payos = await create(listingIds[1]);
    expect(payos.id).not.toBe(momo.id);
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 503 }));
    await post(`/orders/${momo.id}/checkout`).expect(503);
    expect(spy.mock.calls[0][0]).toBe(
      'https://test-payment.momo.vn/v2/gateway/api/create',
    );
    spy.mockClear();
    await post(`/orders/${payos.id}/checkout`).expect(503);
    expect(spy.mock.calls[0][0]).toBe(
      'https://api-merchant.payos.vn/v2/payment-requests',
    );
    expect((await get(momo.id)).provider).toBe('MOMO_SANDBOX');
  });
  it('signs PayOS checkout, stores and reuses the link, and never grants from create', async () => {
    usePayos();
    const order = await create();
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_url, init) => {
        if (init?.method !== 'POST') return Response.json(payosLink(order));
        if (typeof init?.body !== 'string')
          throw new Error('Expected JSON request');
        const body = JSON.parse(init.body);
        const url = `${origin}/dich-vu/ket-qua?orderId=${order.id}`;
        const raw = `amount=49000&cancelUrl=${url}&description=ROOMORA&orderCode=${order.providerOrderCode}&returnUrl=${url}`;
        expect(body.signature).toBe(
          createHmac('sha256', secret).update(raw).digest('hex'),
        );
        expect(body.expiredAt).toBe(
          Math.floor(new Date(order.expiresAt).getTime() / 1000),
        );
        expect(init?.headers).toMatchObject({
          'x-client-id': 'test-payos-client',
          'x-api-key': 'test-payos-api',
        });
        return Response.json(
          payosSigned({
            orderCode: Number(order.providerOrderCode),
            amount: 49000,
            currency: 'VND',
            paymentLinkId: linkId,
            status: 'PENDING',
            checkoutUrl: `https://pay.payos.vn/web/${linkId}`,
          }),
        );
      });
    const checkout = await post(`/orders/${order.id}/checkout`).expect(200);
    expect(checkout.body.payUrl).toBe(`https://pay.payos.vn/web/${linkId}`);
    await post(`/orders/${order.id}/checkout`).expect(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await get(order.id)).status).toBe('PENDING');
    expect((await get(order.id)).providerLinkId).toBe(linkId);
  });
  it('recovers the same signed PayOS link after an uncertain create response', async () => {
    usePayos();
    const order = await create();
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementation(async () =>
        Response.json(
          payosSigned({
            id: linkId,
            orderCode: Number(order.providerOrderCode),
            amount: order.amount,
            status: 'PENDING',
            amountPaid: 0,
            amountRemaining: order.amount,
          }),
        ),
      );
    await post(`/orders/${order.id}/checkout`).expect(200);
    expect(spy.mock.calls[1][0]).toBe(
      `https://api-merchant.payos.vn/v2/payment-requests/${order.providerOrderCode}`,
    );
    expect((await create()).id).toBe(order.id);
  });
  it.each(['bad-signature', 'wrong-amount', 'wrong-order', 'unsafe-url'])(
    'rejects a PayOS checkout with %s',
    async (kind) => {
      usePayos();
      const order = await create();
      const reply = payosSigned({
        orderCode:
          kind === 'wrong-order' ? 123 : Number(order.providerOrderCode),
        amount: kind === 'wrong-amount' ? 1 : order.amount,
        paymentLinkId: linkId,
        status: 'PENDING',
        checkoutUrl:
          kind === 'unsafe-url'
            ? 'https://evil.test/'
            : `https://pay.payos.vn/web/${linkId}`,
      });
      if (kind === 'bad-signature') reply.signature = 'a'.repeat(64);
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json(reply))
        .mockResolvedValueOnce(
          Response.json({ code: '101', desc: 'not found' }),
        );
      await post(`/orders/${order.id}/checkout`).expect(503);
      expect((await get(order.id)).payUrl).toBeNull();
    },
  );
  it('syncs cancellation, keeps history, and creates only one new order/code for the same unpaid listing under concurrent retries', async () => {
    const old = await linkedPayos();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json(payosLink(old, { status: 'CANCELLED' })),
    );
    const sync = await post(`/orders/${old.id}/sync`).expect(200);
    expect(sync.body.status).toBe('CANCELLED');
    expect(sync.body.payUrl).toBeNull();
    await post(`/orders/${old.id}/checkout`).expect(409);
    const replies = await Promise.all(
      Array.from({ length: 4 }, () => create()),
    );
    expect(new Set(replies.map((order) => order.id)).size).toBe(1);
    expect(replies[0].id).not.toBe(old.id);
    expect(replies[0].providerOrderCode).not.toBe(old.providerOrderCode);
    expect((await get(old.id)).providerOrderCode).toBe(old.providerOrderCode);
    const eligible = await agents[0].get(base + '/listings').expect(200);
    expect(
      eligible.body.find((item: { id: string }) => item.id === old.listingId)
        .paymentCompleted,
    ).toBe(false);
  });
  it.each(['CANCELLED', 'EXPIRED'])(
    'checks %s before create and releases the old pending order without opening its URL',
    async (status) => {
      const old = await linkedPayos();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        Response.json(payosLink(old, { status })),
      );
      const next = await create();
      expect(next.id).not.toBe(old.id);
      expect((await get(old.id)).status).toBe(status);
      expect((await get(old.id)).payUrl).toBeNull();
    },
  );
  it('preserves an active link when the user only leaves checkout', async () => {
    const old = await linkedPayos();
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => Response.json(payosLink(old)));
    expect((await create()).id).toBe(old.id);
    const result = await post(`/orders/${old.id}/checkout`).expect(200);
    expect(result.body.payUrl).toBe(old.payUrl);
    expect(
      spy.mock.calls.every(
        ([, init]) => !init?.method || init.method === 'GET',
      ),
    ).toBe(true);
    expect((await get(old.id)).status).toBe('PENDING');
  });
  it('checks PayOS even after local expiry and refuses replacement when money was received', async () => {
    const old = await linkedPayos();
    await prisma.serviceOrder.update({
      where: { id: old.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await get(old.id)).status).toBe('EXPIRED');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json(payosLink(old, { status: 'PAID', amountPaid: 49000 })),
    );
    const response = await post('/orders', {
      listingId: old.listingId,
      clientId: randomUUID(),
    }).expect(409);
    expect(response.body.code).toBe('PAYMENT_CONFIRMATION_PENDING');
    expect(
      await prisma.serviceOrder.count({ where: { userId: userIds[0] } }),
    ).toBe(1);
  });
  it.each([
    { status: 'PAID', amountPaid: 49000 },
    { status: 'PROCESSING', amountPaid: 0 },
    { status: 'PENDING', amountPaid: 1000 },
    { status: 'CANCELLED', amountPaid: 1000 },
  ])(
    'refuses replacement or resume when PayOS reports incoming money or processing: %j',
    async (change) => {
      const old = await linkedPayos();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        Response.json(payosLink(old, change)),
      );
      const response = await post('/orders', {
        listingId: old.listingId,
        clientId: randomUUID(),
      }).expect(409);
      expect(response.body.code).toBe('PAYMENT_CONFIRMATION_PENDING');
      await post(`/orders/${old.id}/checkout`).expect(409);
      expect((await get(old.id)).status).toBe('PENDING');
      expect(
        await prisma.serviceOrder.count({ where: { userId: userIds[0] } }),
      ).toBe(1);
      expect(
        await prisma.listingBoost.count({ where: { orderId: old.id } }),
      ).toBe(0);
    },
  );
  it.each([
    'bad-signature',
    'wrong-order',
    'wrong-amount',
    'wrong-link',
    'unknown-status',
    'network-error',
  ])(
    'keeps the original pending order when cancellation cannot be verified: %s',
    async (kind) => {
      const old = await linkedPayos();
      const reply = payosLink(old, {
        status: kind === 'unknown-status' ? 'UNKNOWN' : 'CANCELLED',
        ...(kind === 'wrong-order' ? { orderCode: 123 } : {}),
        ...(kind === 'wrong-amount' ? { amount: 1 } : {}),
        ...(kind === 'wrong-link' ? { id: 'a'.repeat(32) } : {}),
      });
      if (kind === 'bad-signature') reply.signature = 'a'.repeat(64);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        if (kind === 'network-error') throw new Error('timeout');
        return Response.json(reply);
      });
      await post(`/orders/${old.id}/sync`).expect(503);
      await post('/orders', {
        listingId: old.listingId,
        clientId: randomUUID(),
      }).expect(503);
      expect((await get(old.id)).status).toBe('PENDING');
      expect((await get(old.id)).payUrl).toBe(old.payUrl);
      expect(
        await prisma.serviceOrder.count({ where: { userId: userIds[0] } }),
      ).toBe(1);
    },
  );
  it('recovers a cancelled link after an uncertain create without reopening or changing its original code', async () => {
    usePayos();
    const old = await create();
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementation(async () =>
        Response.json(payosLink(old, { status: 'CANCELLED' })),
      );
    await post(`/orders/${old.id}/checkout`).expect(409);
    expect((await get(old.id)).status).toBe('CANCELLED');
    expect((await create()).providerOrderCode).not.toBe(old.providerOrderCode);
  });
  it('does not overwrite a confirmed payment when a cancellation lookup returns late', async () => {
    const old = await linkedPayos();
    let finish!: (response: Response) => void, started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const syncing = post(`/orders/${old.id}/sync`).then((response) => response);
    await reading;
    await webhook(payosEvent(old)).expect(200);
    finish(Response.json(payosLink(old, { status: 'CANCELLED' })));
    expect((await syncing).body.status).toBe('PAID');
    await post('/orders', {
      listingId: old.listingId,
      clientId: randomUUID(),
    }).expect(409);
    expect(
      await prisma.listingBoost.count({ where: { orderId: old.id } }),
    ).toBe(1);
  });
  it('handles late payment of a cancelled order after its replacement is paid without granting a second boost', async () => {
    const old = await linkedPayos();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json(payosLink(old, { status: 'CANCELLED' })),
    );
    const next = await create();
    await webhook(payosEvent(next, { paymentLinkId: 'a'.repeat(32) })).expect(
      200,
    );
    await webhook(payosEvent(old)).expect(200);
    expect((await get(old.id)).status).toBe('PAID');
    expect((await get(old.id)).refund.source).toBe('SYSTEM');
    expect((await get(old.id)).boost).toBeNull();
    expect((await get(next.id)).boost).not.toBeNull();
    await post('/orders', {
      listingId: old.listingId,
      clientId: randomUUID(),
    }).expect(409);
    const eligible = await agents[0].get(base + '/listings').expect(200);
    expect(
      eligible.body.find((item: { id: string }) => item.id === old.listingId)
        .paymentCompleted,
    ).toBe(true);
  });
  it.each(['sync', 'get', 'history', 'worker'])(
    'recovers a fully paid expired order with no webhook via %s and grants the service exactly once',
    async (via) => {
      const old = await linkedPayos();
      await prisma.serviceOrder.update({
        where: { id: old.id },
        data: { status: 'EXPIRED' },
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        Response.json(paidPayosLink(old)),
      );
      if (via === 'sync') await post(`/orders/${old.id}/sync`).expect(200);
      if (via === 'get') await get(old.id);
      if (via === 'history') await agents[0].get(base + '/orders').expect(200);
      if (via === 'worker')
        await app.get(ServiceOrdersService).reconcilePayos(userIds[0]);
      const result = await get(old.id);
      expect(result.status).toBe('PAID');
      expect(result.boost).not.toBeNull();
      expect(result.payUrl).toBeNull();
      expect(result.providerTransId).toBe('RECONCILE-' + old.id);
      expect(result.payerBankId).toBe('970422');
      expect(
        await prisma.servicePaymentEvent.count({ where: { orderId: old.id } }),
      ).toBe(1);
      await Promise.all(
        Array.from({ length: 5 }, () =>
          post(`/orders/${old.id}/sync`).expect(200),
        ),
      );
      await webhook(
        payosEvent(old, { reference: result.providerTransId }),
      ).expect(200);
      expect(
        await prisma.listingBoost.count({ where: { orderId: old.id } }),
      ).toBe(1);
      expect(
        await prisma.notification.count({
          where: { userId: userIds[0], type: 'SERVICE' },
        }),
      ).toBe(1);
      await post('/orders', {
        listingId: old.listingId,
        clientId: randomUUID(),
      }).expect(409);
    },
  );
  it('does not redirect a paid checkout and reconciles concurrent webhook/queries without extending the boost', async () => {
    const old = await linkedPayos();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json(paidPayosLink(old)),
    );
    const result = await post(`/orders/${old.id}/checkout`).expect(409);
    expect(result.body.code).toBe('ORDER_ALREADY_PAID');
    const initial = await get(old.id);
    await Promise.all([
      post(`/orders/${old.id}/sync`).expect(200),
      webhook(payosEvent(old, { reference: initial.providerTransId })).expect(
        200,
      ),
      webhook(
        payosEvent(old, {
          reference: initial.providerTransId,
          description: 'different signed payload',
        }),
      ).expect(200),
    ]);
    expect((await get(old.id)).boost.endsAt).toBe(initial.boost.endsAt);
    expect(
      await prisma.listingBoost.count({ where: { orderId: old.id } }),
    ).toBe(1);
  });
  it.each([
    'missing-reference',
    'partial',
    'wrong-transaction-amount',
    'multiple-transactions',
  ])('does not activate an unproven paid query: %s', async (kind) => {
    const old = await linkedPayos();
    const transactions = [
      {
        reference: kind === 'missing-reference' ? '' : 'QUERY-' + old.id,
        amount: kind === 'wrong-transaction-amount' ? 1 : old.amount,
      },
    ];
    if (kind === 'multiple-transactions')
      transactions.push({ reference: 'OTHER', amount: 1 });
    const reply = paidPayosLink(old, {
      transactions,
      ...(kind === 'partial'
        ? { amountPaid: 1000, amountRemaining: 48000 }
        : {}),
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json(reply),
    );
    const synced = await post(`/orders/${old.id}/sync`).expect(200);
    expect(synced.body.paymentConfirmationPending).toBe(true);
    expect(synced.body.status).toBe('PENDING');
    await post(`/orders/${old.id}/checkout`).expect(409);
    expect(
      await prisma.listingBoost.count({ where: { orderId: old.id } }),
    ).toBe(0);
  });
  it('uses refund rules when a reconciled paid order no longer qualifies for its posting round', async () => {
    const old = await linkedPayos();
    await prisma.listing.update({
      where: { id: old.listingId },
      data: { postingRound: { increment: 1 } },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json(paidPayosLink(old)),
    );
    const synced = await post(`/orders/${old.id}/sync`).expect(200);
    expect(synced.body.status).toBe('PAID');
    expect(synced.body.boost).toBeNull();
    expect(synced.body.refund.source).toBe('SYSTEM');
  });
  it('protects order synchronization by owner, session and Origin', async () => {
    const old = await linkedPayos();
    await post(`/orders/${old.id}/sync`, {}, 1).expect(404);
    await request(app.getHttpServer())
      .post(base + `/orders/${old.id}/sync`)
      .set('Origin', origin)
      .expect(401);
    await agents[0].post(base + `/orders/${old.id}/sync`).expect(403);
  });

  it('grants exactly once for repeated concurrent PayOS webhooks without Origin or cookie', async () => {
    usePayos();
    const order = await create(),
      event = payosEvent(order);
    await Promise.all([webhook(event).expect(200), webhook(event).expect(200)]);
    const paid = await get(order.id);
    expect(paid.status).toBe('PAID');
    expect(paid.providerTransId).toBe(event.data.reference);
    expect(
      await prisma.listingBoost.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      await prisma.servicePaymentEvent.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      new Date(paid.boost.endsAt).getTime() -
        new Date(paid.boost.startsAt).getTime(),
    ).toBe(7 * 86400000);
    await webhook(
      payosSigned({ ...event.data, description: 'ROOMORA RETRY' }),
    ).expect(200);
    expect((await get(order.id)).boost.endsAt).toBe(paid.boost.endsAt);
  });
  it('rejects forged PayOS webhooks and signed amount/link mismatches', async () => {
    usePayos();
    const order = await create();
    const event = payosEvent(order);
    await webhook({ ...event, signature: 'a'.repeat(64) }).expect(400);
    await webhook({ ...event, data: { ...event.data, amount: 1 } }).expect(400);
    await webhook(payosEvent(order, { amount: 1 })).expect(400);
    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: { providerLinkId: linkId },
    });
    await webhook(payosEvent(order, { paymentLinkId: 'a'.repeat(32) })).expect(
      400,
    );
    expect((await get(order.id)).status).toBe('PENDING');
    expect(
      await prisma.listingBoost.count({ where: { orderId: order.id } }),
    ).toBe(0);
  });
  it('uses signed PayOS data.code, not unsigned success flags or return parameters', async () => {
    usePayos();
    const order = await create();
    await webhook(payosEvent(order, { code: '01' })).expect(200);
    expect((await get(order.id)).status).toBe('PENDING');
    await agents[0]
      .get(base + `/orders/${order.id}?code=00&status=PAID`)
      .expect(200);
    expect((await get(order.id)).status).toBe('PENDING');
    const event = payosEvent(order);
    await webhook({ ...event, success: false, code: '99' }).expect(200);
    expect((await get(order.id)).status).toBe('PAID');
  });
  it('acknowledges signed webhook setup samples and rejects unsigned samples', async () => {
    usePayos();
    const sample = payosEvent({
      providerOrderCode: '123',
      amount: 3000,
    } as ServiceOrder);
    await webhook(sample).expect(200);
    await webhook({ ...sample, signature: 'invalid' }).expect(400);
    expect(
      await prisma.servicePaymentEvent.count({
        where: { order: { userId: userIds[0] } },
      }),
    ).toBe(0);
  });
  it('accepts the actual PayOS setup payload without the unsigned success field', async () => {
    usePayos();
    const sample = payosEvent({
      providerOrderCode: '123',
      amount: 3000,
    } as ServiceOrder);
    const { success: _success, ...body } = sample;
    await webhook(body).expect(200);
    await webhook({ ...body, signature: 'invalid' }).expect(400);
    expect(
      await prisma.servicePaymentEvent.count({
        where: { order: { userId: userIds[0] } },
      }),
    ).toBe(0);
  });
  it('accepts a paid PayOS notification without success and still validates signed fields', async () => {
    usePayos();
    const order = await create();
    const { success: _success, ...body } = payosEvent(order);
    await webhook({ ...body, data: { ...body.data, amount: 1 } }).expect(400);
    expect((await get(order.id)).status).toBe('PENDING');
    await webhook(body).expect(200);
    await webhook(body).expect(200);
    expect((await get(order.id)).status).toBe('PAID');
    expect(
      await prisma.listingBoost.count({ where: { orderId: order.id } }),
    ).toBe(1);
  });
  it('prevents MoMo notifications from paying PayOS orders', async () => {
    usePayos();
    const order = await create();
    await ipn(signed(order)).expect(400);
    expect((await get(order.id)).status).toBe('PENDING');
  });
  it('does not reuse a PayOS reference across orders', async () => {
    usePayos();
    const first = await create(),
      second = await create(listingIds[1]);
    const event = payosEvent(first);
    await webhook(event).expect(200);
    await webhook(
      payosEvent(second, { reference: event.data.reference }),
    ).expect(409);
    expect((await get(second.id)).status).toBe('PENDING');
  });
  it('still accepts MoMo IPN after switching, with independent provider transaction IDs', async () => {
    const momo = await create(),
      event = signed(momo);
    usePayos();
    const payos = await create(listingIds[1]);
    await ipn(event).expect(204);
    await webhook(
      payosEvent(payos, { reference: String(event.transId) }),
    ).expect(200);
    expect((await get(momo.id)).status).toBe('PAID');
    expect((await get(payos.id)).status).toBe('PAID');
  });
  it('accepts late PayOS payment and requests a refund when the listing closed', async () => {
    usePayos();
    const order = await create();
    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: { status: 'EXPIRED' },
    });
    await prisma.listing.update({
      where: { id: order.listingId },
      data: { status: 'CLOSED' },
    });
    await webhook(payosEvent(order)).expect(200);
    const paid = await get(order.id);
    expect(paid.status).toBe('PAID');
    expect(paid.boost).toBeNull();
    expect(paid.refund).not.toBeNull();
  });
});
