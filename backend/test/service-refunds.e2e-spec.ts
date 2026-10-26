import {
  ServiceUnavailableException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { RefundRateGuard } from '../src/modules/billing/refund-rate.guard.js';
import { RefundRulesService } from '../src/modules/billing/refund-rules.service.js';
import { MomoRefundsService } from '../src/modules/billing/momo-refunds.service.js';

describe('Service refunds (HTTP and PostgreSQL)', () => {
  let app: INestApplication, prisma: PrismaService;
  const users: string[] = [],
    listings: string[] = [],
    agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000',
    prefix = 'refund-' + randomUUID();
  const reason = 'Tôi đề nghị kiểm tra và hoàn tiền dịch vụ.';
  const recipient = {
    bankId: '970415',
    bankName: 'VietinBank',
    accountNumber: '00123456789',
    accountName: 'NGUYEN VAN A',
  };
  const post = (path: string, body: object, index = 0) =>
    agents[index]
      .post('/api/v1' + path)
      .set('Origin', origin)
      .send(body);
  const get = (path: string, index = 0) => agents[index].get('/api/v1' + path);
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
    const password = 'Roomora-' + randomUUID(),
      passwordHash = await app.get(PasswordService).hash(password);
    for (let i = 0; i < 4; i++) {
      const id = randomUUID(),
        email = `${prefix}-${i}@example.test`;
      await prisma.user.create({
        data: {
          id,
          email,
          passwordHash,
          role: i >= 2 ? 'ADMIN' : 'USER',
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: 'Người thử hoàn tiền ' + i } },
        },
      });
      users.push(id);
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ email, password })
        .expect(200);
      agents.push(agent);
      const listing = await prisma.listing.create({
        data: {
          ownerId: id,
          type: 'ROOM_WANTED',
          status: 'PUBLISHED',
          title: prefix,
          rent: 2000000,
          publishedAt: new Date(),
        },
      });
      listings.push(listing.id);
    }
  }, 30000);
  async function clear() {
    await prisma.serviceRefundRequest.deleteMany({
      where: { order: { userId: { in: users } } },
    });
    await prisma.servicePaymentEvent.deleteMany({
      where: { order: { userId: { in: users } } },
    });
    await prisma.listingBoost.deleteMany({
      where: { listingId: { in: listings } },
    });
    await prisma.serviceOrder.deleteMany({ where: { userId: { in: users } } });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.listing.updateMany({
      where: { id: { in: listings } },
      data: { boostUntil: null, postingRound: 1, status: 'PUBLISHED' },
    });
  }
  beforeEach(async () => {
    await clear();
    vi.spyOn(app.get(RefundRateGuard), 'canActivate').mockResolvedValue(true);
    for (const key of [
      'MOMO_PARTNER_CODE',
      'MOMO_ACCESS_KEY',
      'MOMO_SECRET_KEY',
    ])
      app.get(ConfigService).set(key, 'test-only');
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (prisma) {
      await clear();
      await prisma.listing.deleteMany({ where: { id: { in: listings } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
  });
  async function paid(index = 0, change: object = {}) {
    const order = await prisma.serviceOrder.create({
      data: {
        userId: users[index],
        listingId: listings[index],
        clientId: randomUUID(),
        provider: 'PAYOS',
        providerOrderCode: String(Math.floor(Math.random() * 8e12) + 1e12),
        providerTransId: randomUUID(),
        planCode: 'BOOST_7_DAYS',
        planName: 'Đẩy tin 7 ngày',
        amount: 49000,
        durationDays: 7,
        buyerName: 'NGUYEN VAN A',
        buyerEmail: 'refund-test@example.test',
        listingTitle: prefix,
        expiresAt: new Date(Date.now() + 60000),
        status: 'PAID',
        paidAt: new Date(),
        ...change,
      },
    });
    if (!order.listingId) throw new Error('Expected a listing boost order');
    return { ...order, listingId: order.listingId };
  }
  async function requested(
    order?: Awaited<ReturnType<typeof paid>>,
    index = 0,
  ) {
    const purchase = order ?? (await paid(index));
    return (
      await post(
        `/services/orders/${purchase.id}/refund-request`,
        { reason },
        index,
      ).expect(201)
    ).body;
  }
  const adminGet = async (id: string) =>
    (await get('/admin/refunds/' + id, 2).expect(200)).body;
  async function approve(refund: { id: string; version: number }) {
    return (
      await post(
        `/admin/refunds/${refund.id}/review`,
        {
          version: refund.version,
          note: 'Đã kiểm tra giao dịch và điều kiện hoàn tiền.',
          decision: 'APPROVED',
        },
        2,
      ).expect(201)
    ).body;
  }
  async function verified(index = 0) {
    const order = await paid(index);
    let refund = await approve(await requested(order, index));
    refund = (
      await post(
        `/services/orders/${order.id}/refund/recipient`,
        { ...recipient, version: refund.version },
        index,
      ).expect(201)
    ).body;
    refund = (
      await post(
        `/admin/refunds/${refund.id}/verify-recipient`,
        {
          version: refund.version,
          note: 'Đối chiếu chủ tài khoản với sao kê ngân hàng.',
          evidenceReference: 'bank-statement-original-01',
        },
        2,
      ).expect(201)
    ).body;
    return { order, refund };
  }
  async function processing(index = 0) {
    const { order, refund } = await verified(index);
    return {
      order,
      refund: (
        await post(
          `/admin/refunds/${refund.id}/process`,
          {
            version: refund.version,
            note: 'Đã đối soát chưa hoàn trước đó, bắt đầu chuyển khoản.',
            originalUnrefunded: true,
          },
          2,
        ).expect(201)
      ).body,
    };
  }
  async function proof(refund: { id: string; version: number }) {
    const buffer = await sharp({
      create: { width: 100, height: 80, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    return (
      await agents[2]
        .post(`/api/v1/admin/refunds/${refund.id}/proofs`)
        .set('Origin', origin)
        .field('version', refund.version)
        .attach('proof', buffer, 'receipt.png')
        .expect(201)
    ).body;
  }
  const completion = (
    refund: { version: number; proofs: { id: string }[] },
    reference = 'BANK-' + randomUUID(),
  ) => ({
    version: refund.version,
    amount: 49000,
    reference,
    transferredAt: new Date().toISOString(),
    proofId: refund.proofs[0].id,
    note: 'Đã xác minh tiền đến đúng tài khoản và chứng từ khớp.',
    originalUnrefunded: true,
  });

  it('uses the bank directory, canonicalizes names and rejects unsupported recipients', async () => {
    const catalog = (await get('/services/refund-banks').expect(200)).body;
    expect(
      catalog.find((bank: { bin: string }) => bank.bin === '970422'),
    ).toMatchObject({ code: 'MB', name: 'MBBank' });
    const order = await paid(0, {
      payerBankId: 'ICB',
      payerAccount: recipient.accountNumber,
    });
    const refund = await approve(await requested(order));
    const path = `/services/orders/${order.id}/refund/recipient`;
    for (const bankId of ['RR-' + order.id, '999999']) {
      const response = await post(path, {
        ...recipient,
        bankId,
        version: refund.version,
      }).expect(400);
      expect(response.body.code).toBe('REFUND_BANK_INVALID');
    }
    await post(path, {
      ...recipient,
      accountName: '😀😀',
      version: refund.version,
    }).expect(400);
    const saved = (
      await post(path, {
        ...recipient,
        bankId: 'ICB',
        bankName: 'Tên giả không được tin cậy',
        accountName: '  nguyễn   văn đặng  ',
        version: refund.version,
      }).expect(201)
    ).body;
    expect(saved).toMatchObject({
      bankId: '970415',
      bankName: 'VietinBank',
      accountName: 'NGUYEN VAN DANG',
      verifiedAt: null,
    });
    const action = saved.actions.find(
      (item: { action: string }) => item.action === 'RECIPIENT_UPDATED',
    );
    expect(action.details).toMatchObject({
      bankId: '970415',
      bankName: 'VietinBank',
      accountName: 'NGUYEN VAN DANG',
    });
    await post(
      `/admin/refunds/${saved.id}/verify-recipient`,
      {
        version: saved.version,
        note: reason,
        evidenceReference: 'bank-statement-tested',
      },
      2,
    ).expect(201);
    const updated = (
      await post(path, {
        bankId: '970415',
        accountNumber: recipient.accountNumber,
        accountName: 'đỗ thị ánh',
        version: saved.version + 1,
      }).expect(201)
    ).body;
    expect(updated.accountName).toBe('DO THI ANH');
    expect(updated.verifiedAt).toBeNull();
  });

  it('searches completed refund history with status filtering and stable pagination, only for admins', async () => {
    const completed = [];
    for (let index = 0; index < 2; index++) {
      let { refund } = await processing(index);
      refund = await proof(refund);
      const reference = `SEARCH-BANK-${prefix}-${index}`;
      const done = (
        await post(
          `/admin/refunds/${refund.id}/complete`,
          completion(refund, reference),
          2,
        ).expect(201)
      ).body;
      completed.push(done);
    }
    const latest = completed[1];
    await prisma.serviceOrder.update({
      where: { id: latest.orderId },
      data: {
        buyerName: 'Khách tra cứu',
        buyerEmail: `${prefix}@example.test`,
        providerTransId: 'SEARCH-ORIGINAL-' + prefix,
        listingTitle: 'Tin tìm kiếm ' + prefix,
      },
    });
    for (const q of [
      latest.id,
      latest.orderId,
      latest.refundReference,
      `${prefix}@example.test`,
      'Khách tra cứu',
      'SEARCH-ORIGINAL-' + prefix,
    ]) {
      const result = (
        await get(
          '/admin/refunds?status=COMPLETED&q=' + encodeURIComponent(q),
          2,
        ).expect(200)
      ).body;
      expect(result.items.map((item: { id: string }) => item.id)).toContain(
        latest.id,
      );
    }
    const first = (
      await get(
        '/admin/refunds?status=COMPLETED&limit=1&q=' +
          encodeURIComponent(prefix),
        2,
      ).expect(200)
    ).body;
    expect(first).toMatchObject({ total: 2, pages: 2, page: 1 });
    expect(first.items[0].id).toBe(latest.id);
    const second = (
      await get(
        '/admin/refunds?status=COMPLETED&limit=1&page=2&q=' +
          encodeURIComponent(prefix),
        2,
      ).expect(200)
    ).body;
    expect(second.items[0].id).toBe(completed[0].id);
    expect(
      (await get('/admin/refunds?status=PENDING&q=' + latest.id, 2).expect(200))
        .body.total,
    ).toBe(0);
    expect(
      (
        await get(
          '/admin/refunds?status=COMPLETED&q=not-found-' + prefix,
          2,
        ).expect(200)
      ).body.total,
    ).toBe(0);
    expect(
      (
        await get(
          '/admin/refunds?status=COMPLETED&q=' +
            encodeURIComponent('nguyễn văn a'),
          2,
        ).expect(200)
      ).body.items.some((item: { id: string }) => item.id === latest.id),
    ).toBe(true);
    expect(
      (
        await get(
          '/admin/refunds?status=COMPLETED&q=' + recipient.accountNumber,
          2,
        ).expect(200)
      ).body.items.some((item: { id: string }) => item.id === latest.id),
    ).toBe(true);
    await get('/admin/refunds?q=' + 'a'.repeat(101), 2).expect(400);
    await get('/admin/refunds?status=COMPLETED&q=' + latest.id).expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/refunds?status=COMPLETED')
      .expect(401);
  });

  it('requires an invalid legacy bank to be corrected before verification or processing', async () => {
    const refund = await approve(await requested());
    await prisma.serviceRefundRequest.update({
      where: { id: refund.id },
      data: {
        ...recipient,
        bankId: 'RR-' + refund.orderId,
      },
    });
    const response = await post(
      `/admin/refunds/${refund.id}/verify-recipient`,
      {
        version: refund.version,
        note: reason,
        evidenceReference: 'legacy-bank-evidence',
      },
      2,
    ).expect(400);
    expect(response.body.code).toBe('REFUND_BANK_INVALID');
    await prisma.serviceRefundRequest.update({
      where: { id: refund.id },
      data: {
        verifiedAt: new Date(),
        verifiedById: users[2],
      },
    });
    const begin = await post(
      `/admin/refunds/${refund.id}/process`,
      {
        version: refund.version,
        note: reason,
        originalUnrefunded: true,
      },
      2,
    ).expect(400);
    expect(begin.body.code).toBe('REFUND_BANK_INVALID');
    expect((await adminGet(refund.id)).status).toBe('APPROVED');
  });

  it('enforces the database payment timestamp and refuses requests near day seven', async () => {
    const expired = await paid(0, {
      paidAt: new Date(Date.now() - 7 * 86400000 + 3600000),
    });
    const response = await post(
      `/services/orders/${expired.id}/refund-request`,
      { reason },
    ).expect(409);
    expect(response.body.code).toBe('REFUND_WINDOW_EXPIRED');
    expect(
      await prisma.serviceRefundRequest.count({
        where: { orderId: expired.id },
      }),
    ).toBe(0);
    expect(
      (await get(`/services/orders/${expired.id}`).expect(200)).body
        .refundEligible,
    ).toBe(false);
    const within = await paid(0, {
      paidAt: new Date(Date.now() - 86400000 + 60000),
    });
    await requested(within);
  });
  it('does not trust client time, amount, status or userId', async () => {
    const order = await paid();
    for (const extra of [
      { paidAt: new Date().toISOString() },
      { amount: 1 },
      { status: 'APPROVED' },
      { userId: users[1] },
      { source: 'SYSTEM' },
    ])
      await post(`/services/orders/${order.id}/refund-request`, {
        reason,
        ...extra,
      }).expect(400);
    expect(
      await prisma.serviceRefundRequest.count({ where: { orderId: order.id } }),
    ).toBe(0);
  });
  it('enforces ownership, admin rights and CSRF on all financial actions and proof reads', async () => {
    const order = await paid(),
      refund = await requested(order);
    await request(app.getHttpServer()).get('/api/v1/admin/refunds').expect(401);
    await get('/admin/refunds').expect(403);
    await get(`/services/orders/${order.id}/refund`, 1).expect(404);
    await post(
      `/services/orders/${order.id}/refund-request`,
      { reason },
      1,
    ).expect(404);
    await post(
      `/services/orders/${order.id}/refund/recipient`,
      { ...recipient, version: refund.version },
      1,
    ).expect(404);
    for (const action of [
      'review',
      'process',
      'reconcile',
      'complete',
      'retry',
      'fail',
      'verify-recipient',
    ])
      await post(`/admin/refunds/${refund.id}/${action}`, {
        version: refund.version,
      }).expect(403);
    await agents[2]
      .post(`/api/v1/admin/refunds/${refund.id}/review`)
      .send({ version: 1, decision: 'APPROVED', note: reason })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/refunds/${refund.id}/proofs/${randomUUID()}`)
      .expect(401);
    await get('/admin/refunds/' + refund.id, 2).expect(200);
  });
  it('does not permit refunds before payment or after confirmed refund', async () => {
    const pending = await paid(0, {
      status: 'PENDING',
      paidAt: null,
      providerTransId: null,
    });
    await post(`/services/orders/${pending.id}/refund-request`, {
      reason,
    }).expect(400);
    const completed = await paid(0, { refundedAt: new Date() });
    await post(`/services/orders/${completed.id}/refund-request`, {
      reason,
    }).expect(409);
  });
  it('creates one pending request/audit under concurrent retries and keeps its original submission time', async () => {
    const order = await paid();
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        post(`/services/orders/${order.id}/refund-request`, { reason }).expect(
          201,
        ),
      ),
    );
    expect(new Set(responses.map((reply) => reply.body.id)).size).toBe(1);
    expect(
      await prisma.serviceRefundAction.count({
        where: { refundId: responses[0].body.id, action: 'REQUESTED' },
      }),
    ).toBe(1);
    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: { paidAt: new Date(Date.now() - 86400000 - 1000) },
    });
    expect(
      (
        await post(`/services/orders/${order.id}/refund-request`, {
          reason,
        }).expect(201)
      ).body.createdAt,
    ).toBe(responses[0].body.createdAt);
  });
  it('allows admin review after 24 hours when the original request was timely', async () => {
    const order = await paid(0, {
      paidAt: new Date(Date.now() - 3 * 86400000),
    });
    const refund = await prisma.serviceRefundRequest.create({
      data: {
        orderId: order.id,
        amount: 49000,
        reason,
        createdAt: new Date(order.paidAt!.getTime() + 3600000),
      },
    });
    expect((await approve(refund)).status).toBe('APPROVED');
  });
  it('retains but cannot approve a legacy user request submitted outside the window', async () => {
    const order = await paid(0, {
      paidAt: new Date(Date.now() - 7 * 86400000),
    });
    const refund = await prisma.serviceRefundRequest.create({
      data: { orderId: order.id, amount: 49000, reason },
    });
    expect(
      (
        await post(
          `/admin/refunds/${refund.id}/review`,
          { version: 1, decision: 'APPROVED', note: reason },
          2,
        ).expect(409)
      ).body.code,
    ).toBe('REFUND_REQUEST_INELIGIBLE');
    expect((await adminGet(refund.id)).status).toBe('PENDING');
  });
  it('requires rejection reasons and never executes pending or rejected requests', async () => {
    const refund = await requested();
    await post(
      `/admin/refunds/${refund.id}/process`,
      { version: 1, note: reason, originalUnrefunded: true },
      2,
    ).expect(409);
    await post(
      `/admin/refunds/${refund.id}/review`,
      { version: 1, decision: 'REJECTED', note: 'x' },
      2,
    ).expect(400);
    const rejected = (
      await post(
        `/admin/refunds/${refund.id}/review`,
        { version: 1, decision: 'REJECTED', note: reason },
        2,
      ).expect(201)
    ).body;
    await post(
      `/admin/refunds/${refund.id}/process`,
      { version: rejected.version, note: reason, originalUnrefunded: true },
      2,
    ).expect(409);
  });
  it('serializes concurrent decisions and rolls back state if audit cannot be recorded', async () => {
    const refund = await requested();
    const spy = vi
      .spyOn(app.get(RefundRulesService), 'audit')
      .mockRejectedValue(
        new ServiceUnavailableException({ code: 'REFUND_AUDIT_UNAVAILABLE' }),
      );
    await post(
      `/admin/refunds/${refund.id}/review`,
      { version: 1, decision: 'APPROVED', note: reason },
      2,
    ).expect(503);
    expect((await adminGet(refund.id)).status).toBe('PENDING');
    spy.mockRestore();
    const replies = await Promise.all([
      post(
        `/admin/refunds/${refund.id}/review`,
        { version: 1, decision: 'APPROVED', note: reason },
        2,
      ),
      post(
        `/admin/refunds/${refund.id}/review`,
        { version: 1, decision: 'REJECTED', note: reason },
        3,
      ),
    ]);
    expect(replies.map((reply) => reply.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
  });
  it('requires human evidence, additional review for different recipients and re-verifies any update', async () => {
    const order = await paid(0, {
      payerAccount: '99887766',
      payerBankId: '970415',
      payerName: 'NGUYEN VAN B',
    });
    let refund = await approve(await requested(order));
    await post(`/services/orders/${order.id}/refund/recipient`, {
      ...recipient,
      version: refund.version,
    }).expect(409);
    refund = (
      await post(`/services/orders/${order.id}/refund/recipient`, {
        ...recipient,
        differentAccountReason:
          'Người thanh toán nhờ tôi nhận lại vào tài khoản chính.',
        version: refund.version,
      }).expect(201)
    ).body;
    await post(
      `/admin/refunds/${refund.id}/verify-recipient`,
      {
        version: refund.version,
        note: reason,
        evidenceReference: 'Bank-document-01',
      },
      2,
    ).expect(409);
    refund = (
      await post(
        `/admin/refunds/${refund.id}/verify-recipient`,
        {
          version: refund.version,
          note: reason,
          evidenceReference: 'Bank-document-01',
          differentAccountApproved: true,
        },
        2,
      ).expect(201)
    ).body;
    refund = (
      await post(`/services/orders/${order.id}/refund/recipient`, {
        ...recipient,
        differentAccountReason: reason,
        version: refund.version,
      }).expect(201)
    ).body;
    expect(refund.verifiedAt).toBeNull();
    await post(
      `/admin/refunds/${refund.id}/process`,
      { version: refund.version, note: reason, originalUnrefunded: true },
      2,
    ).expect(409);
  });
  it('requires proof, exact amount, actual-transfer attestation and only completes once', async () => {
    const { order, refund: started } = await processing();
    await post(`/services/orders/${order.id}/refund/recipient`, {
      ...recipient,
      version: started.version,
    }).expect(409);
    await post(
      `/admin/refunds/${started.id}/complete`,
      {
        version: started.version,
        note: reason,
        amount: 49000,
        proofId: randomUUID(),
        reference: 'BANK-REF-TEST',
        transferredAt: new Date().toISOString(),
        originalUnrefunded: true,
      },
      2,
    ).expect(409);
    const refund = await proof(started),
      body = completion(refund);
    await post(
      `/admin/refunds/${refund.id}/complete`,
      { ...body, amount: 49001 },
      2,
    ).expect(409);
    await post(
      `/admin/refunds/${refund.id}/complete`,
      { ...body, originalUnrefunded: false },
      2,
    ).expect(400);
    const replies = await Promise.all([
      post(`/admin/refunds/${refund.id}/complete`, body, 2),
      post(`/admin/refunds/${refund.id}/complete`, body, 3),
    ]);
    expect(replies.map((reply) => reply.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect((await adminGet(refund.id)).status).toBe('COMPLETED');
    expect(
      await prisma.serviceRefundAction.count({
        where: { refundId: refund.id, action: 'COMPLETED' },
      }),
    ).toBe(1);
    const paidOrder = await prisma.serviceOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(paidOrder.status).toBe('PAID');
    expect(paidOrder.refundedAt).not.toBeNull();
    await post(`/services/orders/${order.id}/refund-request`, {
      reason,
    }).expect(409);
    await get(
      `/services/orders/${order.id}/refund/proofs/${refund.proofs[0].id}`,
    )
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    await get(
      `/services/orders/${order.id}/refund/proofs/${refund.proofs[0].id}`,
      1,
    ).expect(404);
  });
  it('rejects original order/payment/request identifiers as transfer references without completing the refund', async () => {
    const { order, refund: started } = await processing();
    const refund = await proof(started);
    for (const reference of [order.id, refund.id, order.providerTransId]) {
      const response = await post(
        `/admin/refunds/${refund.id}/complete`,
        completion(refund, reference!.toUpperCase()),
        2,
      ).expect(409);
      expect(response.body.code).toBe('REFUND_TRANSFER_REFERENCE_REQUIRED');
    }
    expect((await adminGet(refund.id)).status).toBe('PROCESSING');
    expect(
      (await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .refundedAt,
    ).toBeNull();
    expect(
      await prisma.serviceRefundAction.count({
        where: { refundId: refund.id, action: 'COMPLETED' },
      }),
    ).toBe(0);
    await post(
      `/admin/refunds/${refund.id}/complete`,
      completion(refund),
      2,
    ).expect(201);
  });

  it('rejects reused transfer references across different refunds', async () => {
    const first = await processing(),
      firstProof = await proof(first.refund),
      reference = 'BANK-UNIQUE-01';
    await post(
      `/admin/refunds/${firstProof.id}/complete`,
      completion(firstProof, reference),
      2,
    ).expect(201);
    const second = await processing(),
      secondProof = await proof(second.refund);
    expect(
      (
        await post(
          `/admin/refunds/${secondProof.id}/complete`,
          completion(secondProof, reference),
          2,
        ).expect(409)
      ).body.code,
    ).toBe('REFUND_REFERENCE_REUSED');
    expect((await adminGet(secondProof.id)).status).toBe('PROCESSING');
  });
  it('ends only the refunded order benefit and never removes another order benefit', async () => {
    const { order, refund: started } = await processing();
    const endsAt = new Date(Date.now() + 7 * 86400000);
    await prisma.listingBoost.create({
      data: {
        orderId: order.id,
        listingId: order.listingId,
        startsAt: order.paidAt!,
        endsAt,
      },
    });
    await prisma.listing.update({
      where: { id: order.listingId },
      data: { boostUntil: endsAt },
    });
    const refund = await proof(started);
    await post(
      `/admin/refunds/${refund.id}/complete`,
      completion(refund),
      2,
    ).expect(201);
    expect(
      (
        await prisma.listing.findUniqueOrThrow({
          where: { id: order.listingId },
        })
      ).boostUntil,
    ).toBeNull();
    expect(
      (
        await prisma.listingBoost.findUniqueOrThrow({
          where: { orderId: order.id },
        })
      ).endsAt,
    ).toEqual(endsAt);
  });
  it('does not accept forged proof bytes and permits a controlled manual failure/retry', async () => {
    const { refund } = await processing();
    await agents[2]
      .post(`/api/v1/admin/refunds/${refund.id}/proofs`)
      .set('Origin', origin)
      .field('version', refund.version)
      .attach('proof', Buffer.from('<svg>fake</svg>'), 'fake.jpg')
      .expect(400);
    const failed = (
      await post(
        `/admin/refunds/${refund.id}/fail`,
        {
          version: refund.version,
          note: 'Ngân hàng xác nhận giao dịch bị từ chối, chưa chuyển tiền.',
          confirmedNoTransfer: true,
        },
        2,
      ).expect(201)
    ).body;
    const approved = (
      await post(
        `/admin/refunds/${refund.id}/retry`,
        {
          version: failed.version,
          note: 'Đã xác minh lại chưa chuyển tiền, cho xử lý lại mã cũ.',
        },
        2,
      ).expect(201)
    ).body;
    expect(approved.status).toBe('APPROVED');
    expect(approved.id).toBe(refund.id);
  });
  it('keeps uncertain MoMo processing, blocks duplicate calls and completes only from reconciliation', async () => {
    const order = await paid(0, {
      provider: 'MOMO_SANDBOX',
      providerTransId: '12345',
    });
    const refund = await approve(await requested(order));
    expect(refund.method).toBe('MOMO');
    const create = vi
      .spyOn(app.get(MomoRefundsService), 'create')
      .mockResolvedValue({
        status: 'PROCESSING',
        message: 'Chưa xác định kết quả, cần đối soát.',
      });
    const started = (
      await post(
        `/admin/refunds/${refund.id}/process`,
        { version: refund.version, note: reason, originalUnrefunded: true },
        2,
      ).expect(201)
    ).body;
    expect(started.status).toBe('PROCESSING');
    expect(started.refundReference).toBeNull();
    await post(
      `/admin/refunds/${refund.id}/process`,
      { version: started.version, note: reason, originalUnrefunded: true },
      2,
    ).expect(409);
    expect(create).toHaveBeenCalledTimes(1);
    const query = vi
      .spyOn(app.get(MomoRefundsService), 'query')
      .mockResolvedValue({
        status: 'COMPLETED',
        reference: 'MO-123456',
        message: 'Provider xác nhận thành công',
      });
    const completed = (
      await post(
        `/admin/refunds/${refund.id}/reconcile`,
        { version: started.version },
        2,
      ).expect(201)
    ).body;
    expect(completed.status).toBe('COMPLETED');
    await post(
      `/admin/refunds/${refund.id}/reconcile`,
      { version: completed.version },
      2,
    ).expect(201);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('rate limits authenticated mutations before accepting many requests', async () => {
    vi.restoreAllMocks();
    const order = await paid();
    for (let i = 0; i < 20; i++)
      await post(`/services/orders/${order.id}/refund-request`, {
        reason: 'x',
      }).expect(400);
    expect(
      (
        await post(`/services/orders/${order.id}/refund-request`, {
          reason,
        }).expect(429)
      ).body.code,
    ).toBe('REFUND_RATE_LIMITED');
    expect(
      await prisma.serviceRefundRequest.count({ where: { orderId: order.id } }),
    ).toBe(0);
  });

  it('uses the database unique reference under concurrent completions for different buyers', async () => {
    const first = await processing(0),
      second = await processing(1);
    const firstProof = await proof(first.refund),
      secondProof = await proof(second.refund);
    const replies = await Promise.all([
      post(
        `/admin/refunds/${firstProof.id}/complete`,
        completion(firstProof, 'BANK-CROSS-OWNER'),
        2,
      ),
      post(
        `/admin/refunds/${secondProof.id}/complete`,
        completion(secondProof, 'BANK-CROSS-OWNER'),
        3,
      ),
    ]);
    expect(replies.map((reply) => reply.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(
      await prisma.serviceRefundRequest.count({
        where: { refundReference: 'BANK-CROSS-OWNER', status: 'COMPLETED' },
      }),
    ).toBe(1);
  });

  it('rolls back completion and benefit cancellation if its audit cannot be persisted', async () => {
    const { order, refund: started } = await processing();
    const refund = await proof(started);
    vi.spyOn(app.get(RefundRulesService), 'audit').mockRejectedValue(
      new ServiceUnavailableException({ code: 'REFUND_AUDIT_UNAVAILABLE' }),
    );
    await post(
      `/admin/refunds/${refund.id}/complete`,
      completion(refund),
      2,
    ).expect(503);
    expect(
      (await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .refundedAt,
    ).toBeNull();
    expect((await adminGet(refund.id)).status).toBe('PROCESSING');
  });

  it('does not end the benefit of a newer posting round when refunding the older order', async () => {
    const { order, refund: started } = await processing();
    const oldEnd = new Date(Date.now() + 86400000),
      newEnd = new Date(Date.now() + 7 * 86400000);
    await prisma.listingBoost.create({
      data: {
        orderId: order.id,
        listingId: order.listingId,
        startsAt: order.paidAt!,
        endsAt: oldEnd,
      },
    });
    const newer = await paid(0, { postingRound: 2 });
    await prisma.listingBoost.create({
      data: {
        orderId: newer.id,
        listingId: order.listingId,
        startsAt: newer.paidAt!,
        endsAt: newEnd,
      },
    });
    await prisma.listing.update({
      where: { id: order.listingId },
      data: { postingRound: 2, boostUntil: newEnd },
    });
    const refund = await proof(started);
    await post(
      `/admin/refunds/${refund.id}/complete`,
      completion(refund),
      2,
    ).expect(201);
    expect(
      (
        await prisma.listing.findUniqueOrThrow({
          where: { id: order.listingId },
        })
      ).boostUntil,
    ).toEqual(newEnd);
  });

  it('keeps system correction refunds reviewable without applying the customer service-use window', async () => {
    const order = await paid(0, {
      paidAt: new Date(Date.now() - 7 * 86400000),
    });
    const refund = await prisma.serviceRefundRequest.create({
      data: {
        orderId: order.id,
        amount: 49000,
        reason: 'Tiền đến muộn khi tin không được cấp quyền lợi, cần đối soát.',
        source: 'SYSTEM',
      },
    });
    expect((await approve(refund)).status).toBe('APPROVED');
  });

  it('stores payer data only from a signed PayOS callback and ignores duplicates after refund completion', async () => {
    for (const key of [
      'PAYOS_CLIENT_ID',
      'PAYOS_API_KEY',
      'PAYOS_CHECKSUM_KEY',
    ])
      app.get(ConfigService).set(key, 'test-payos');
    const order = await paid(0, {
      status: 'PENDING',
      paidAt: null,
      providerTransId: null,
    });
    const data = {
      orderCode: Number(order.providerOrderCode),
      amount: 49000,
      currency: 'VND',
      code: '00',
      paymentLinkId: '124c33293c43417ab7879e14c8d9eb18',
      reference: 'PAYOS-REFUND-ORIGINAL',
      description: 'ROOMORA',
      counterAccountBankId: recipient.bankId,
      counterAccountBankName: recipient.bankName,
      counterAccountName: recipient.accountName,
      counterAccountNumber: recipient.accountNumber,
    };
    const raw = Object.entries(data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const callback = {
      code: '00',
      success: true,
      data,
      signature: createHmac('sha256', 'test-payos').update(raw).digest('hex'),
    };
    await request(app.getHttpServer())
      .post('/api/v1/services/payos/webhook')
      .send(callback)
      .expect(200);
    let refund = await approve(await requested(order));
    refund = (
      await post(`/services/orders/${order.id}/refund/recipient`, {
        ...recipient,
        version: refund.version,
      }).expect(201)
    ).body;
    refund = (
      await post(
        `/admin/refunds/${refund.id}/verify-recipient`,
        {
          version: refund.version,
          note: reason,
          evidenceReference: 'bank-proof-confirmed',
        },
        2,
      ).expect(201)
    ).body;
    refund = (
      await post(
        `/admin/refunds/${refund.id}/process`,
        { version: refund.version, note: reason, originalUnrefunded: true },
        2,
      ).expect(201)
    ).body;
    refund = await proof(refund);
    await post(
      `/admin/refunds/${refund.id}/complete`,
      completion(refund),
      2,
    ).expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/services/payos/webhook')
      .send(callback)
      .expect(200);
    const saved = await prisma.serviceOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(saved.payerAccount).toBe(recipient.accountNumber);
    expect(saved.refundedAt).not.toBeNull();
    expect(
      await prisma.servicePaymentEvent.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      await prisma.listingBoost.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      (
        await prisma.listing.findUniqueOrThrow({
          where: { id: order.listingId },
        })
      ).boostUntil,
    ).toBeNull();
    const publicListing = (
      await request(app.getHttpServer())
        .get(`/api/v1/listings/${order.listingId}`)
        .expect(200)
    ).body;
    expect(JSON.stringify(publicListing)).not.toContain(
      recipient.accountNumber,
    );
    expect(
      (await get(`/services/orders/${order.id}`).expect(200)).body
        .refundEligible,
    ).toBe(false);
  });
});
