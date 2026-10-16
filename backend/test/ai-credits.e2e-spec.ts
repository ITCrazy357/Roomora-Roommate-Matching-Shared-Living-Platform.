import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { AiProviderService } from '../src/modules/ai/ai-provider.service.js';
import { AiUsageService } from '../src/modules/ai-usage/ai-usage.service.js';
import { AiCreditsService } from '../src/modules/ai-credits/ai-credits.service.js';
import { PaymentGatewayService } from '../src/modules/billing/payment-gateway.service.js';
import { PayosGatewayService } from '../src/modules/billing/payos-gateway.service.js';
import { payosSignature } from '../src/modules/billing/payos-signature.js';
import { RefundRulesService } from '../src/modules/billing/refund-rules.service.js';
import { momoSignature } from '../src/modules/billing/momo-signature.js';
import type { ServiceOrder } from '../src/generated/prisma/client.js';

describe('AI free trial and paid credits (HTTP/PostgreSQL)', () => {
  let app: INestApplication, prisma: PrismaService, credits: AiCreditsService;
  let owner: ReturnType<typeof request.agent>,
    other: ReturnType<typeof request.agent>,
    admin: ReturnType<typeof request.agent>;
  const ids: string[] = [],
    prefix = `credits-${randomUUID()}`,
    password = `Roomora-${randomUUID()}`;
  const origin = 'http://localhost:3000',
    base = '/api/v1';
  const secret = 'test-credit-signature';
  const payos = new PayosGatewayService(
    new ConfigService({
      PAYOS_CLIENT_ID: 'test',
      PAYOS_API_KEY: 'test',
      PAYOS_CHECKSUM_KEY: secret,
    }),
  );
  const remote = new Map<string, string>();
  const gateway = {
    provider: vi.fn(() => 'PAYOS'),
    available: vi.fn(() => true),
    create: vi.fn(async (order: ServiceOrder) => ({
      payUrl: `https://pay.example.test/${order.id}`,
      providerLinkId: order.id.replaceAll('-', ''),
    })),
  };
  let failed = false,
    invalid = false;
  beforeAll(async () => {
    vi.spyOn(payos, 'read').mockImplementation(async (order) => ({
      status: remote.get(order.id) ?? 'PENDING',
      amountPaid: remote.get(order.id) === 'PROCESSING' ? 1000 : 0,
      payUrl: `https://pay.example.test/${order.id}`,
      providerLinkId: order.id.replaceAll('-', ''),
      payment: undefined,
    }));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentGatewayService)
      .useValue(gateway)
      .overrideProvider(PayosGatewayService)
      .useValue(payos)
      .overrideProvider(AiProviderService)
      .useFactory({
        inject: [AiCreditsService, AiUsageService],
        factory: (balance: AiCreditsService, costs: AiUsageService) =>
          new AiProviderService(
            new ConfigService({ OPENAI_API_KEY: 'test-only' }),
            balance,
            costs,
          ),
      })
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
    app.get(ConfigService).set('OPENAI_API_KEY', 'test-only');
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    credits = app.get(AiCreditsService);
    const hash = await app.get(PasswordService).hash(password),
      agents = [];
    for (const role of ['owner', 'other', 'admin']) {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-${role}@example.test`,
          passwordHash: hash,
          emailVerifiedAt: new Date(),
          role: role === 'admin' ? 'ADMIN' : 'USER',
          profile: {
            create: { displayName: role, onboardingCompletedAt: new Date() },
          },
        },
      });
      ids.push(user.id);
      const agent = request.agent(app.getHttpServer());
      await agent
        .post(`${base}/auth/login`)
        .set('Origin', origin)
        .send({ email: user.email, password })
        .expect(200);
      agents.push(agent);
    }
    [owner, other, admin] = agents;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (failed) throw new Error('test outage');
        const output = invalid
          ? { description: '' }
          : {
              description:
                'Mô tả có thông tin được người dùng kiểm tra trước khi lưu.',
            };
        return new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                content: [
                  { type: 'output_text', text: JSON.stringify(output) },
                ],
              },
            ],
          }),
        );
      }),
    );
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (prisma && ids.length) {
      await prisma.adminAction.deleteMany({ where: { actorId: { in: ids } } });
      await prisma.serviceRefundRequest.deleteMany({
        where: { order: { userId: { in: ids } } },
      });
      await prisma.servicePaymentEvent.deleteMany({
        where: { order: { userId: { in: ids } } },
      });
      await prisma.serviceOrder.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });
  async function create(agent = owner) {
    return (
      await agent
        .post(`${base}/services/ai-orders`)
        .set('Origin', origin)
        .send({ clientId: randomUUID() })
        .expect(201)
    ).body as ServiceOrder;
  }
  function event(order: ServiceOrder, reference = randomUUID()) {
    const data = {
      orderCode: Number(order.providerOrderCode),
      amount: order.amount,
      currency: 'VND',
      reference,
      paymentLinkId: order.id.replaceAll('-', ''),
      code: '00',
    };
    return {
      code: '00',
      success: true,
      data,
      signature: payosSignature(data, secret),
    };
  }
  async function pay(order: ServiceOrder, body = event(order)) {
    await request(app.getHttpServer())
      .post(`${base}/services/payos/webhook`)
      .send(body)
      .expect(200);
  }
  async function consume(userId: string) {
    const use = await credits.reserve(userId);
    await credits.complete(use);
    return use;
  }

  it('shows five free lifetime uses and the server-side 59,000 VND plan', async () => {
    const usage = await owner.get(`${base}/ai/usage`).expect(200);
    expect(usage.body).toMatchObject({
      freeTotal: 5,
      freeRemaining: 5,
      paidRemaining: 0,
      remaining: 5,
    });
    const catalog = await request(app.getHttpServer())
      .get(`${base}/services/catalog`)
      .expect(200);
    expect(catalog.body.aiPlan).toMatchObject({ amount: 59000, credits: 50 });
  });
  it('returns credits for provider failures and rejected business output', async () => {
    const before = await credits.usage(ids[0]);
    failed = true;
    await owner
      .post(`${base}/ai/listing-description`)
      .set('Origin', origin)
      .send({ title: 'Nhu cầu phòng' })
      .expect(503);
    failed = false;
    invalid = true;
    await owner
      .post(`${base}/ai/listing-description`)
      .set('Origin', origin)
      .send({ title: 'Nhu cầu phòng' })
      .expect(503);
    invalid = false;
    expect((await credits.usage(ids[0])).remaining).toBe(before.remaining);
    expect(
      await prisma.aiCreditUse.count({
        where: { userId: ids[0], status: 'FAILED' },
      }),
    ).toBe(2);
  });
  it('uses exactly five credits then stops before calling the provider', async () => {
    for (let i = 0; i < 5; i++)
      await owner
        .post(`${base}/ai/listing-description`)
        .set('Origin', origin)
        .send({ title: 'Nhu cầu phòng' })
        .expect(200);
    const fetcher = vi.mocked(globalThis.fetch),
      before = fetcher.mock.calls.length;
    const reply = await owner
      .post(`${base}/ai/listing-description`)
      .set('Origin', origin)
      .send({ title: 'Nhu cầu phòng' })
      .expect(429);
    expect(reply.body.code).toBe('AI_LIMIT_REACHED');
    expect(fetcher.mock.calls.length).toBe(before);
    expect((await new AiCreditsService(prisma).usage(ids[0])).remaining).toBe(
      0,
    );
  });
  it('requires USER, trusted origin and accepts no client-supplied price or credits', async () => {
    await request(app.getHttpServer())
      .post(`${base}/services/ai-orders`)
      .set('Origin', origin)
      .send({ clientId: randomUUID() })
      .expect(401);
    await admin
      .post(`${base}/services/ai-orders`)
      .set('Origin', origin)
      .send({ clientId: randomUUID() })
      .expect(403);
    await owner
      .post(`${base}/services/ai-orders`)
      .set('Origin', 'https://untrusted.test')
      .send({ clientId: randomUUID() })
      .expect(403);
    await owner
      .post(`${base}/services/ai-orders`)
      .set('Origin', origin)
      .send({ clientId: randomUUID(), amount: 1, credits: 1000 })
      .expect(400);
  });
  it('creates one pending AI order under simultaneous purchase requests without a listing', async () => {
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        owner
          .post(`${base}/services/ai-orders`)
          .set('Origin', origin)
          .send({ clientId: randomUUID() }),
      ),
    );
    expect(replies.every((r) => r.status === 201)).toBe(true);
    expect(new Set(replies.map((r) => r.body.id)).size).toBe(1);
    expect(replies[0].body).toMatchObject({
      listingId: null,
      amount: 59000,
      creditAmount: 50,
      durationDays: 0,
      planCode: 'AI_50_CREDITS',
    });
    expect((await credits.usage(ids[0])).remaining).toBe(0);
  });
  it('keeps checkout and order data private', async () => {
    const order = await create();
    await other.get(`${base}/services/orders/${order.id}`).expect(404);
    await other
      .post(`${base}/services/orders/${order.id}/checkout`)
      .set('Origin', origin)
      .send({})
      .expect(404);
    const checkout = await owner
      .post(`${base}/services/orders/${order.id}/checkout`)
      .set('Origin', origin)
      .send({})
      .expect(200);
    expect(checkout.body.payUrl).toContain('pay.example.test');
    expect(gateway.create.mock.calls.at(-1)?.[0].amount).toBe(59000);
  });
  it('rejects invalid signatures and amount mismatches without granting credits', async () => {
    const order = await create();
    const signed = event(order);
    await request(app.getHttpServer())
      .post(`${base}/services/payos/webhook`)
      .send({ ...signed, signature: 'bad' })
      .expect(400);
    const wrong = { ...signed.data, amount: 49000 };
    await request(app.getHttpServer())
      .post(`${base}/services/payos/webhook`)
      .send({
        ...signed,
        data: wrong,
        signature: payosSignature(wrong, secret),
      })
      .expect(400);
    expect((await credits.usage(ids[0])).remaining).toBe(0);
  });
  it('grants exactly fifty once for duplicate signed webhooks', async () => {
    const order = await create(),
      signed = event(order);
    await Promise.all([
      pay(order, signed),
      pay(order, signed),
      pay(order, signed),
    ]);
    expect((await credits.usage(ids[0])).remaining).toBe(50);
    expect(
      await prisma.aiCreditPack.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      await prisma.listingBoost.count({ where: { orderId: order.id } }),
    ).toBe(0);
  });
  it('allows an additional purchase and keeps credits without monthly expiry', async () => {
    const order = await create();
    await pay(order);
    await prisma.aiCreditPack.updateMany({
      where: { userId: ids[0] },
      data: { createdAt: new Date('2020-01-01') },
    });
    expect((await credits.usage(ids[0])).paidRemaining).toBe(100);
    await consume(ids[0]);
    expect((await credits.usage(ids[0])).remaining).toBe(99);
    const page = await owner
      .get(`${base}/services/orders?kind=benefits`)
      .expect(200);
    expect(
      page.body.items.filter((o: { aiPack: unknown }) => !!o.aiPack),
    ).toHaveLength(2);
  });
  it('refuses full refunds for used packages', async () => {
    const used = await prisma.aiCreditPack.findFirstOrThrow({
      where: { userId: ids[0], used: { gt: 0 } },
    });
    const reply = await owner
      .post(`${base}/services/orders/${used.orderId}/refund-request`)
      .set('Origin', origin)
      .send({ reason: 'Tôi muốn hoàn gói AI đã sử dụng' })
      .expect(409);
    expect(reply.body.code).toBe('AI_PACK_USED');
  });
  it('holds an unused package while reviewing its refund and releases it after rejection', async () => {
    const unused = await prisma.aiCreditPack.findFirstOrThrow({
      where: { userId: ids[0], used: 0 },
    });
    const before = (await credits.usage(ids[0])).remaining;
    const reply = await owner
      .post(`${base}/services/orders/${unused.orderId}/refund-request`)
      .set('Origin', origin)
      .send({ reason: 'Tôi chưa dùng gói và muốn hoàn lại' })
      .expect(201);
    expect((await credits.usage(ids[0])).remaining).toBe(before - 50);
    await prisma.$transaction(async (tx) => {
      const rules = app.get(RefundRulesService),
        refund = await rules.lock(tx, reply.body.id);
      await rules.change(
        tx,
        refund,
        ids[2],
        'REJECTED',
        'Cần kiểm tra yêu cầu',
        { status: 'REJECTED' },
      );
    });
    expect((await credits.usage(ids[0])).remaining).toBe(before);
  });
  it('removes only the refunded package after completion', async () => {
    const order = await create();
    await pay(order);
    const before = (await credits.usage(ids[0])).remaining;
    const reply = await owner
      .post(`${base}/services/orders/${order.id}/refund-request`)
      .set('Origin', origin)
      .send({ reason: 'Gói mới chưa dùng, tôi xin hoàn tiền' })
      .expect(201);
    await prisma.$transaction(async (tx) => {
      const rules = app.get(RefundRulesService),
        refund = await rules.lock(tx, reply.body.id);
      await rules.change(
        tx,
        refund,
        ids[2],
        'PROCESSING',
        'Đã kiểm tra gói chưa sử dụng và đang xử lý hoàn tiền',
        { status: 'PROCESSING' },
      );
      await rules.complete(
        tx,
        await rules.lock(tx, reply.body.id),
        ids[2],
        `ai-refund-${randomUUID()}`,
        new Date(),
        'Đã xác nhận chuyển khoản qua ngân hàng',
      );
    });
    expect((await credits.usage(ids[0])).remaining).toBe(before - 50);
    const pack = await prisma.aiCreditPack.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(pack.revokedAt).not.toBeNull();
  });
  it('generates an AI PDF receipt without a null listing reference', async () => {
    const order = await prisma.serviceOrder.findFirstOrThrow({
      where: { userId: ids[0], status: 'PAID', refundedAt: null },
    });
    const pdf = await owner
      .get(`${base}/services/orders/${order.id}/receipt`)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.length).toBeGreaterThan(1000);
  });
  it('recovers an abandoned reservation and releases it only once', async () => {
    const before = (await credits.usage(ids[1])).remaining,
      reserved = await credits.reserve(ids[1]);
    await prisma.aiCreditUse.update({
      where: { id: reserved.id },
      data: { createdAt: new Date(Date.now() - 180000) },
    });
    expect((await credits.usage(ids[1])).remaining).toBe(before);
    await credits.release(reserved);
    expect((await credits.usage(ids[1])).remaining).toBe(before);
    await expect(credits.complete(reserved)).rejects.toMatchObject({
      response: { code: 'AI_UNAVAILABLE' },
    });
  });
  it('limits distributed reservation requests to the remaining credit', async () => {
    await prisma.aiWallet.update({
      where: { userId: ids[1] },
      data: { freeUsed: 4 },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        new AiCreditsService(prisma).reserve(ids[1]),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await credits.usage(ids[1])).remaining).toBe(0);
  });
  it('cancels an unpaid link and allows a replacement order', async () => {
    const order = await create(other);
    await other
      .post(`${base}/services/orders/${order.id}/checkout`)
      .set('Origin', origin)
      .send({})
      .expect(200);
    remote.set(order.id, 'CANCELLED');
    await other
      .post(`${base}/services/orders/${order.id}/sync`)
      .set('Origin', origin)
      .send({})
      .expect(200);
    const next = await create(other);
    expect(next.id).not.toBe(order.id);
    remote.set(next.id, 'PROCESSING');
    await other
      .post(`${base}/services/orders/${next.id}/checkout`)
      .set('Origin', origin)
      .send({})
      .expect(200);
    await other
      .post(`${base}/services/ai-orders`)
      .set('Origin', origin)
      .send({ clientId: randomUUID() })
      .expect(409);
  });
  it('returns paid credits when the provider fails', async () => {
    const before = await credits.usage(ids[0]);
    failed = true;
    await owner
      .post(`${base}/ai/listing-description`)
      .set('Origin', origin)
      .send({ title: 'Nhu cầu phòng' })
      .expect(503);
    failed = false;
    expect((await credits.usage(ids[0])).paidRemaining).toBe(
      before.paidRemaining,
    );
  });
  it('rejects a reused transaction on another AI order', async () => {
    const first = await create(),
      signed = event(first);
    await pay(first, signed);
    const second = await create();
    await request(app.getHttpServer())
      .post(`${base}/services/payos/webhook`)
      .send(event(second, signed.data.reference))
      .expect(409);
    expect(
      await prisma.aiCreditPack.count({ where: { orderId: second.id } }),
    ).toBe(0);
    await prisma.serviceOrder.update({
      where: { id: second.id },
      data: { status: 'CANCELLED' },
    });
  });
  it('grants an expired AI order when a genuine payment arrives late', async () => {
    const order = await create();
    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: { status: 'EXPIRED', expiresAt: new Date(Date.now() - 1000) },
    });
    const before = (await credits.usage(ids[0])).remaining;
    await pay(order);
    expect((await credits.usage(ids[0])).remaining).toBe(before + 50);
  });
  it('also grants the AI package through a signed MoMo notification', async () => {
    gateway.provider.mockReturnValue('MOMO_SANDBOX');
    const config = app.get(ConfigService);
    config.set('MOMO_PARTNER_CODE', 'test-partner');
    config.set('MOMO_ACCESS_KEY', 'test-access');
    config.set('MOMO_SECRET_KEY', 'test-momo-secret');
    config.set('MOMO_IPN_URL', 'https://example.test/ipn');
    const order = await create();
    const body = {
      amount: order.amount,
      extraData: '',
      message: 'Successful',
      orderId: order.id,
      orderInfo: order.planName,
      orderType: 'momo_wallet',
      partnerCode: 'test-partner',
      payType: 'qr',
      requestId: order.id,
      responseTime: Date.now(),
      resultCode: 0,
      transId: Math.floor(Date.now() / 10),
    };
    const signed = {
      ...body,
      signature: momoSignature(
        { accessKey: 'test-access', ...body },
        'test-momo-secret',
      ),
    };
    const before = (await credits.usage(ids[0])).remaining;
    await request(app.getHttpServer())
      .post(`${base}/services/momo/ipn`)
      .send(signed)
      .expect(204);
    await request(app.getHttpServer())
      .post(`${base}/services/momo/ipn`)
      .send(signed)
      .expect(204);
    expect((await credits.usage(ids[0])).remaining).toBe(before + 50);
    gateway.provider.mockReturnValue('PAYOS');
  });
  it('keeps the last paid credit atomic across instances', async () => {
    const pending = await prisma.serviceOrder.findFirstOrThrow({
      where: { userId: ids[1], status: 'PENDING' },
    });
    remote.set(pending.id, 'CANCELLED');
    await other
      .post(`${base}/services/orders/${pending.id}/sync`)
      .set('Origin', origin)
      .send({})
      .expect(200);
    const order = await create(other);
    await pay(order);
    await prisma.aiCreditPack.update({
      where: { orderId: order.id },
      data: { used: 49 },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        new AiCreditsService(prisma).reserve(ids[1]),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await credits.usage(ids[1])).remaining).toBe(0);
  });
  it('records payment and requests a refund if the account is locked before payment', async () => {
    const order = await create(),
      before = (await credits.usage(ids[0])).remaining;
    await prisma.user.update({
      where: { id: ids[0] },
      data: {
        lockedAt: new Date(),
        lockReason: 'Khóa tài khoản thử để kiểm tra thanh toán đến muộn',
      },
    });
    await pay(order);
    const saved = await prisma.serviceOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { refund: true },
    });
    expect(saved.status).toBe('PAID');
    expect(saved.refund?.source).toBe('SYSTEM');
    expect((await credits.usage(ids[0])).remaining).toBe(before);
    expect(
      await prisma.aiCreditPack.count({ where: { orderId: order.id } }),
    ).toBe(0);
  });
});
