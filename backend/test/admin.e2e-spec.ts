import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';

describe('ADMIN operations (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;
  let member: ReturnType<typeof request.agent>;
  let reporter: ReturnType<typeof request.agent>;
  const ids: string[] = [];
  const password = `Roomora-${randomUUID()}`;
  const prefix = `admin-${randomUUID()}`;
  const origin = 'http://localhost:3000';
  let listingId: string;
  let reportId: string;
  const url = '/api/v1';

  async function login(name: string) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${url}/auth/login`)
      .set('Origin', origin)
      .send({ email: `${prefix}-${name}@example.test`, password })
      .expect(200);
    return agent;
  }
  function schedule() {
    const now = Date.now();
    return {
      title: 'Bảo trì hệ thống thử nghiệm',
      message: 'Thông báo kiểm tra trong cơ sở dữ liệu riêng biệt.',
      kind: 'MAINTENANCE',
      displayFrom: new Date(now - 60000).toISOString(),
      displayUntil: new Date(now + 3600000).toISOString(),
      maintenanceFrom: new Date(now + 600000).toISOString(),
      maintenanceUntil: new Date(now + 1200000).toISOString(),
    };
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
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
    const passwordHash = await app.get(PasswordService).hash(password);
    for (const [name, role] of [
      ['admin', 'ADMIN'],
      ['member', 'USER'],
      ['reporter', 'USER'],
      ['other-admin', 'ADMIN'],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          role,
          email: `${prefix}-${name}@example.test`,
          emailVerifiedAt: new Date(),
          passwordHash,
          profile: {
            create: {
              displayName: name,
              visibility: 'PUBLIC',
              bio: 'PRIVATE PROFILE FIELD',
              avatarUrl: 'https://example.test/avatar.png',
            },
          },
        },
      });
      ids.push(user.id);
    }
    admin = await login('admin');
    member = await login('member');
    reporter = await login('reporter');
    listingId = (
      await prisma.listing.create({
        data: {
          ownerId: ids[1],
          title: prefix,
          status: 'PUBLISHED',
          rent: 1000000,
          publishedAt: new Date(),
          privateAddress: 'PRIVATE HOUSE ADDRESS',
        },
      })
    ).id;
  }, 30000);
  afterAll(async () => {
    if (prisma && ids.length) {
      await prisma.adminAction.deleteMany({ where: { actorId: { in: ids } } });
      await prisma.systemAnnouncement.deleteMany({
        where: { authorId: { in: ids } },
      });
      await prisma.serviceRefundRequest.deleteMany({
        where: { order: { userId: { in: ids } } },
      });
      await prisma.serviceOrder.deleteMany({ where: { userId: { in: ids } } });
      await prisma.listing.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('allows only ADMIN to operate and keeps user permissions and private APIs separate', async () => {
    for (const path of [
      '/admin/summary',
      '/admin/users',
      '/admin/reports',
      '/admin/announcements',
    ]) {
      await request(app.getHttpServer())
        .get(url + path)
        .expect(401);
      await member.get(url + path).expect(403);
      await admin.get(url + path).expect(200);
    }
    for (const path of [
      '/houses',
      '/conversations',
      '/appointments',
      '/notifications',
      '/profiles/me',
      '/connections',
      '/listings/mine',
    ]) {
      const response = await admin.get(url + path).expect(403);
      expect(response.body.code).toBe('ADMIN_WORKSPACE_ONLY');
    }
    await admin
      .post(`${url}/listings`)
      .set('Origin', origin)
      .send({})
      .expect(403);
    await admin.get(`${url}/auth/me`).expect(200);
    await admin.get(`${url}/auth/sessions`).expect(200);
    await member.get(`${url}/houses`).expect(200);
    const users = (
      await admin.get(`${url}/admin/users?search=${prefix}`).expect(200)
    ).body;
    expect(users.total).toBe(2);
    expect(
      users.items.every((user: { role: string }) => user.role === 'USER'),
    ).toBe(true);
    expect(JSON.stringify(users)).not.toContain('passwordHash');
    expect(JSON.stringify(users)).not.toContain('PRIVATE PROFILE FIELD');
    expect(JSON.stringify(users)).not.toContain('PRIVATE HOUSE ADDRESS');
  });

  it('receives real user reports without automatically locking the target', async () => {
    reportId = (
      await reporter
        .post(`${url}/user-safety/${ids[1]}/report`)
        .set('Origin', origin)
        .send({
          reason: 'SCAM',
          details: 'Người dùng yêu cầu chuyển tiền với thông tin không đúng.',
        })
        .expect(201)
    ).body.id;
    const reports = (await admin.get(`${url}/admin/reports`).expect(200)).body;
    const report = reports.items.find(
      (item: { id: string }) => item.id === reportId,
    );
    expect(report.target.id).toBe(ids[1]);
    expect(report.target.lockedAt).toBeNull();
    expect(report.reporter.profile.avatarUrl).toBe(
      'https://example.test/avatar.png',
    );
    await member
      .patch(`${url}/admin/reports/${reportId}`)
      .set('Origin', origin)
      .send({ status: 'RESOLVED', version: 1, note: 'Không có quyền xử lý' })
      .expect(403);
  });

  it('locks once under concurrent requests, revokes every session and hides public content', async () => {
    const anotherSession = await login('member');
    await reporter.get(`${url}/listings/${listingId}`).expect(200);
    await reporter
      .post(`${url}/listings/${listingId}/save`)
      .set('Origin', origin)
      .send({})
      .expect(201);
    const responses = await Promise.all(
      [admin, await login('other-admin')].map((agent) =>
        agent
          .patch(`${url}/admin/users/${ids[1]}/lock`)
          .set('Origin', origin)
          .send({
            locked: true,
            version: 1,
            reason: 'Đã kiểm tra bằng chứng về hành vi lừa đảo.',
          }),
      ),
    );
    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(
      await prisma.adminAction.count({
        where: { entityId: ids[1], action: 'USER_LOCKED' },
      }),
    ).toBe(1);
    expect(
      await prisma.session.count({
        where: { userId: ids[1], revokedAt: null },
      }),
    ).toBe(0);
    await member.get(`${url}/auth/me`).expect(401);
    await anotherSession.get(`${url}/auth/me`).expect(401);
    const denied = await request(app.getHttpServer())
      .post(`${url}/auth/login`)
      .set('Origin', origin)
      .send({ email: `${prefix}-member@example.test`, password })
      .expect(403);
    expect(denied.body.code).toBe('ACCOUNT_LOCKED');
    await request(app.getHttpServer())
      .get(`${url}/listings/${listingId}`)
      .expect(404);
    const publicListings = (
      await request(app.getHttpServer())
        .get(`${url}/listings?search=${prefix}`)
        .expect(200)
    ).body;
    expect(publicListings.total).toBe(0);
    const saved = (await reporter.get(`${url}/listings/saved`).expect(200))
      .body;
    expect(
      saved.items.some((item: { id: string }) => item.id === listingId),
    ).toBe(false);
    await request(app.getHttpServer())
      .get(`${url}/people/${ids[1]}`)
      .expect(404);
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: listingId } }))
        .status,
    ).toBe('PUBLISHED');
    expect(
      (await admin.get(`${url}/admin/users/${ids[1]}/history`).expect(200)).body
        .actions,
    ).toHaveLength(1);
  });

  it('does not allow self/admin locks or reasonless actions; unblocks without restoring old sessions', async () => {
    for (const id of [ids[0], ids[3]])
      await admin
        .patch(`${url}/admin/users/${id}/lock`)
        .set('Origin', origin)
        .send({
          locked: true,
          version: 1,
          reason: 'Kiểm tra thao tác không được phép',
        })
        .expect(400);
    await admin
      .patch(`${url}/admin/users/${ids[1]}/lock`)
      .set('Origin', origin)
      .send({ locked: false, version: 2, reason: ' ' })
      .expect(400);
    await admin
      .patch(`${url}/admin/users/${ids[1]}/lock`)
      .set('Origin', origin)
      .send({ locked: false, version: 1, reason: 'Sai phiên bản cập nhật' })
      .expect(409);
    await admin
      .patch(`${url}/admin/users/${ids[1]}/lock`)
      .set('Origin', origin)
      .send({
        locked: false,
        version: 2,
        reason: 'Đã kiểm tra và cho phép sử dụng lại.',
      })
      .expect(200);
    await member.get(`${url}/auth/me`).expect(401);
    member = await login('member');
    await member.get(`${url}/auth/me`).expect(200);
    await request(app.getHttpServer())
      .get(`${url}/listings/${listingId}`)
      .expect(200);
    expect(
      (await admin.get(`${url}/admin/users/${ids[1]}/history`).expect(200)).body
        .actions,
    ).toHaveLength(2);
  });

  it('resolves or dismisses a report once and records the decision and actor', async () => {
    const results = await Promise.all(
      ['RESOLVED', 'DISMISSED'].map((status) =>
        admin
          .patch(`${url}/admin/reports/${reportId}`)
          .set('Origin', origin)
          .send({
            version: 1,
            status,
            note: 'Đã đối chiếu thông tin và lưu kết quả kiểm tra.',
          }),
      ),
    );
    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const report = await prisma.userReport.findUniqueOrThrow({
      where: { id: reportId },
    });
    expect(report.version).toBe(2);
    expect(report.handledAt).not.toBeNull();
    expect(report.handlingNote).toContain('đối chiếu');
    const history = (
      await admin.get(`${url}/admin/reports/${reportId}/history`).expect(200)
    ).body;
    expect(history.actions).toHaveLength(1);
    expect(history.actions[0].actor.id).toBe(ids[0]);
  });

  it('validates maintenance intervals, timezone, content and unknown fields', async () => {
    const form = schedule();
    for (const input of [
      { ...form, displayUntil: form.displayFrom },
      { ...form, maintenanceUntil: form.maintenanceFrom },
      { ...form, maintenanceFrom: undefined },
      { ...form, displayFrom: form.maintenanceUntil },
      { ...form, displayUntil: form.maintenanceFrom },
      { ...form, kind: 'GENERAL' },
      { ...form, displayFrom: '2026-10-11T09:00:00' },
      { ...form, title: ' ' },
      { ...form, published: true },
    ])
      await admin
        .post(`${url}/admin/announcements`)
        .set('Origin', origin)
        .send(input)
        .expect(400);
    await member
      .post(`${url}/admin/announcements`)
      .set('Origin', origin)
      .send(form)
      .expect(403);
  });

  it('keeps drafts private, publishes once, rejects live edits and withdraws with audit history', async () => {
    const form = schedule();
    const item = (
      await admin
        .post(`${url}/admin/announcements`)
        .set('Origin', origin)
        .send(form)
        .expect(201)
    ).body;
    const active = () =>
      request(app.getHttpServer())
        .get(`${url}/system/announcements`)
        .expect(200);
    expect(
      (await active()).body.items.some(
        (row: { id: string }) => row.id === item.id,
      ),
    ).toBe(false);
    const results = await Promise.all(
      [1, 2].map(() =>
        admin
          .post(`${url}/admin/announcements/${item.id}/publish`)
          .set('Origin', origin)
          .send({ version: 1 }),
      ),
    );
    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const publicResponse = await active();
    expect(publicResponse.headers['cache-control']).toBe('no-store');
    const publicItem = publicResponse.body.items.find(
      (row: { id: string }) => row.id === item.id,
    );
    expect(publicItem.maintenanceFrom).toBe(form.maintenanceFrom);
    expect(publicItem.authorId).toBeUndefined();
    expect(publicItem.createdAt).toBeUndefined();
    await admin
      .patch(`${url}/admin/announcements/${item.id}`)
      .set('Origin', origin)
      .send({ ...form, version: 2, title: 'Sửa lúc đang phát' })
      .expect(409);
    await admin
      .post(`${url}/admin/announcements/${item.id}/withdraw`)
      .set('Origin', origin)
      .send({ version: 1 })
      .expect(409);
    await admin
      .post(`${url}/admin/announcements/${item.id}/withdraw`)
      .set('Origin', origin)
      .send({ version: 2 })
      .expect(201);
    expect(
      (await active()).body.items.some(
        (row: { id: string }) => row.id === item.id,
      ),
    ).toBe(false);
    await admin
      .patch(`${url}/admin/announcements/${item.id}`)
      .set('Origin', origin)
      .send({
        ...form,
        kind: 'GENERAL',
        maintenanceFrom: undefined,
        maintenanceUntil: undefined,
        version: 3,
      })
      .expect(200);
    const edited = await prisma.systemAnnouncement.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(edited.maintenanceFrom).toBeNull();
    expect(edited.maintenanceUntil).toBeNull();
    const history = (
      await admin
        .get(`${url}/admin/announcements/${item.id}/history`)
        .expect(200)
    ).body;
    expect(
      history.actions
        .map((action: { action: string }) => action.action)
        .sort((a: string, b: string) => a.localeCompare(b)),
    ).toEqual([
      'ANNOUNCEMENT_CREATED',
      'ANNOUNCEMENT_PUBLISHED',
      'ANNOUNCEMENT_UPDATED',
      'ANNOUNCEMENT_WITHDRAWN',
    ]);
  });

  it('excludes scheduled and expired notices and never publishes an expired draft', async () => {
    const now = Date.now();
    const future = {
      title: 'Thông báo lên lịch',
      message: 'Sẽ chỉ hiển thị khi đến thời gian đã đặt.',
      kind: 'GENERAL',
      displayFrom: new Date(now + 600000).toISOString(),
      displayUntil: new Date(now + 3600000).toISOString(),
    };
    const scheduled = (
      await admin
        .post(`${url}/admin/announcements`)
        .set('Origin', origin)
        .send(future)
        .expect(201)
    ).body;
    await admin
      .post(`${url}/admin/announcements/${scheduled.id}/publish`)
      .set('Origin', origin)
      .send({ version: 1 })
      .expect(201);
    const past = {
      ...future,
      displayFrom: new Date(now - 3600000).toISOString(),
      displayUntil: new Date(now - 600000).toISOString(),
    };
    const expired = (
      await admin
        .post(`${url}/admin/announcements`)
        .set('Origin', origin)
        .send(past)
        .expect(201)
    ).body;
    await admin
      .post(`${url}/admin/announcements/${expired.id}/publish`)
      .set('Origin', origin)
      .send({ version: 1 })
      .expect(409);
    await prisma.systemAnnouncement.update({
      where: { id: expired.id },
      data: { published: true },
    });
    const active = (
      await request(app.getHttpServer())
        .get(`${url}/system/announcements`)
        .expect(200)
    ).body.items;
    expect(
      active.some(
        (item: { id: string }) =>
          item.id === scheduled.id || item.id === expired.id,
      ),
    ).toBe(false);
  });

  it('counts listings once per monthly outcome and separates paid, completed, rejected and retryable refunds', async () => {
    const baseline = (await admin.get(`${url}/admin/summary`).expect(200)).body;
    const listing = await prisma.listing.create({
      data: {
        ownerId: ids[2],
        title: `${prefix}-statistics`,
        status: 'CLOSED',
        reviews: {
          create: [
            { adminId: ids[0], decision: 'PUBLISHED', version: 1 },
            { adminId: ids[0], decision: 'REJECTED', version: 2 },
            { adminId: ids[0], decision: 'PUBLISHED', version: 3 },
          ],
        },
      },
    });
    const target = await prisma.user.create({
      data: { email: `${prefix}-statistics@example.test` },
    });
    ids.push(target.id);
    await prisma.userReport.createMany({
      data: [
        {
          reporterId: ids[1],
          targetId: target.id,
          reason: 'SPAM',
          details: 'Test',
          status: 'RESOLVED',
          handledAt: new Date(),
        },
        {
          reporterId: ids[2],
          targetId: target.id,
          reason: 'SPAM',
          details: 'Test',
          status: 'DISMISSED',
          handledAt: new Date(),
        },
        {
          reporterId: target.id,
          targetId: ids[2],
          reason: 'SPAM',
          details: 'Test',
          status: 'OPEN',
        },
      ],
    });
    const refunds = [];
    for (const [index, status] of (
      [
        'PENDING',
        'APPROVED',
        'PROCESSING',
        'COMPLETED',
        'REJECTED',
        'FAILED',
      ] as const
    ).entries()) {
      const order = await prisma.serviceOrder.create({
        data: {
          userId: ids[2],
          listingId: listing.id,
          clientId: randomUUID(),
          planCode: 'STATS',
          planName: 'Statistics test',
          amount: (index + 1) * 1000,
          durationDays: 1,
          buyerName: 'Test',
          buyerEmail: `${prefix}@example.test`,
          listingTitle: listing.title,
          status: 'PAID',
          paidAt: new Date(),
          expiresAt: new Date(),
        },
      });
      refunds.push(
        await prisma.serviceRefundRequest.create({
          data: {
            orderId: order.id,
            reason: 'Statistics test',
            amount: order.amount,
            status,
            ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
            ...(status === 'REJECTED'
              ? {
                  actions: {
                    create: {
                      action: 'REJECTED',
                      toStatus: 'REJECTED',
                      note: 'Decision test',
                      details: {},
                    },
                  },
                }
              : {}),
          },
        }),
      );
    }
    for (const status of [
      'PENDING',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
    ] as const) {
      await prisma.serviceOrder.create({
        data: {
          userId: ids[2],
          listingId: listing.id,
          clientId: randomUUID(),
          planCode: 'STATS',
          planName: 'Statistics test',
          amount: 100000,
          durationDays: 1,
          buyerName: 'Test',
          buyerEmail: `${prefix}@example.test`,
          listingTitle: listing.title,
          status,
          expiresAt: new Date(),
        },
      });
    }
    const summary = (await admin.get(`${url}/admin/summary`).expect(200)).body;
    expect(summary.listings.approved).toBe(baseline.listings.approved + 1);
    expect(summary.listings.rejected).toBe(baseline.listings.rejected + 1);
    expect(summary.reports.resolved).toBe(baseline.reports.resolved + 1);
    expect(summary.reports.dismissed).toBe(baseline.reports.dismissed + 1);
    expect(summary.openReports).toBe(baseline.openReports + 1);
    expect(summary.pendingRefunds).toBe(baseline.pendingRefunds + 4);
    expect(summary.processed).toEqual({
      listings: baseline.processed.listings + 1,
      reports: baseline.processed.reports + 2,
      refunds: baseline.processed.refunds + 2,
      total: baseline.processed.total + 5,
    });
    for (const key of [
      'pending',
      'approved',
      'processing',
      'completed',
      'rejected',
      'failed',
    ]) {
      expect(summary.refunds[key]).toBe(baseline.refunds[key] + 1);
    }
    expect(summary.refunds.completedAmount).toBe(
      baseline.refunds.completedAmount + 4000,
    );
    expect(summary.payments.paid).toBe(baseline.payments.paid + 6);
    expect(summary.payments.paidAmount).toBe(
      baseline.payments.paidAmount + 21000,
    );
    for (const key of ['pending', 'failed', 'cancelled', 'expired']) {
      expect(summary.payments[key]).toBe(baseline.payments[key] + 1);
    }
    expect(Number.isNaN(Date.parse(summary.generatedAt))).toBe(false);
    expect(JSON.stringify(summary)).not.toContain('buyerEmail');
    await prisma.serviceRefundRequest.update({
      where: { id: refunds[1].id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await prisma.listingReview.create({
      data: {
        listingId: listing.id,
        adminId: ids[0],
        decision: 'PUBLISHED',
        version: 4,
      },
    });
    const updated = (await admin.get(`${url}/admin/summary`).expect(200)).body;
    expect(updated.refunds.completed).toBe(summary.refunds.completed + 1);
    expect(updated.refunds.completedAmount).toBe(
      summary.refunds.completedAmount + 2000,
    );
    expect(updated.refunds.approved).toBe(summary.refunds.approved - 1);
    expect(updated.pendingRefunds).toBe(summary.pendingRefunds - 1);
    expect(updated.listings.approved).toBe(summary.listings.approved);
    expect(updated.payments.paidAmount).toBe(summary.payments.paidAmount);
    expect(updated.processed.total).toBe(summary.processed.total + 1);
  });

  it('validates summary months and returns Vietnam calendar boundaries', async () => {
    for (const month of [
      '2026-00',
      '2026-13',
      '2026-2',
      '0000-01',
      '1999-12',
      '2101-01',
      '',
      '2026-10-01',
    ]) {
      await admin.get(`${url}/admin/summary`).query({ month }).expect(400);
    }
    await admin
      .get(`${url}/admin/summary?month=2032-02&extra=true`)
      .expect(400);
    const leap = (
      await admin.get(`${url}/admin/summary?month=2032-02`).expect(200)
    ).body;
    expect(leap.period).toEqual({
      month: '2032-02',
      timeZone: 'Asia/Ho_Chi_Minh',
      from: '2032-01-31T17:00:00.000Z',
      to: '2032-02-29T17:00:00.000Z',
    });
    const december = (
      await admin.get(`${url}/admin/summary?month=2032-12`).expect(200)
    ).body;
    expect(december.period.to).toBe('2032-12-31T17:00:00.000Z');
    const current = (await admin.get(`${url}/admin/summary`).expect(200)).body;
    expect(current.period.month).toBe(
      new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7),
    );
  });

  it('separates receipt and refund months, excludes boundary dates, and filters every dashboard result', async () => {
    const before = new Date('2096-01-31T16:59:59.999Z');
    const from = new Date('2096-01-31T17:00:00.000Z');
    const last = new Date('2096-02-29T16:59:59.999Z');
    const to = new Date('2096-02-29T17:00:00.000Z');
    const baseline = (
      await admin.get(`${url}/admin/summary?month=2096-02`).expect(200)
    ).body;
    const listing = await prisma.listing.create({
      data: {
        ownerId: ids[2],
        title: `${prefix}-monthly`,
        status: 'CLOSED',
        createdAt: before,
        reviews: {
          create: [
            {
              adminId: ids[0],
              decision: 'PUBLISHED',
              version: 1,
              createdAt: before,
            },
            {
              adminId: ids[0],
              decision: 'REJECTED',
              version: 2,
              createdAt: from,
            },
            {
              adminId: ids[0],
              decision: 'PUBLISHED',
              version: 3,
              createdAt: last,
            },
            {
              adminId: ids[0],
              decision: 'PUBLISHED',
              version: 4,
              createdAt: last,
            },
            {
              adminId: ids[0],
              decision: 'PUBLISHED',
              version: 5,
              createdAt: to,
            },
          ],
        },
      },
    });
    for (const submittedAt of [before, from]) {
      await prisma.listing.create({
        data: {
          ownerId: ids[2],
          title: `${prefix}-monthly-pending`,
          status: 'PENDING',
          createdAt: before,
          submittedAt,
        },
      });
    }
    async function order(
      amount: number,
      paidAt: Date | null,
      createdAt = before,
      status: 'PAID' | 'FAILED' = 'PAID',
    ) {
      return prisma.serviceOrder.create({
        data: {
          userId: ids[2],
          listingId: listing.id,
          clientId: randomUUID(),
          planCode: 'MONTHLY',
          planName: 'Monthly statistics test',
          amount,
          durationDays: 1,
          buyerName: 'Test',
          buyerEmail: `${prefix}@example.test`,
          listingTitle: listing.title,
          status,
          paidAt,
          createdAt,
          updatedAt: from,
          expiresAt: to,
        },
      });
    }
    const received = await order(98000, from);
    const previous = await order(49000, before);
    await order(2000, to);
    await order(1000, null, from, 'FAILED');
    await order(1000, null, before, 'FAILED');
    await prisma.serviceRefundRequest.createMany({
      data: [
        {
          orderId: received.id,
          reason: 'Refund in next month',
          amount: 98000,
          status: 'COMPLETED',
          createdAt: from,
          completedAt: to,
        },
        {
          orderId: previous.id,
          reason: 'Previous receipt refunded this month',
          amount: 49000,
          status: 'COMPLETED',
          createdAt: before,
          completedAt: from,
        },
        {
          orderId: (await order(3000, before)).id,
          reason: 'New pending refund',
          amount: 3000,
          status: 'PENDING',
          createdAt: from,
        },
        {
          orderId: (await order(4000, before)).id,
          reason: 'Older failed refund',
          amount: 4000,
          status: 'FAILED',
          createdAt: before,
          updatedAt: from,
        },
      ],
    });
    for (const dates of [[from, last], [before], [to]]) {
      await prisma.serviceRefundRequest.create({
        data: {
          orderId: (await order(5000, before)).id,
          reason: 'Rejected refund from previous month',
          amount: 5000,
          status: 'REJECTED',
          createdAt: before,
          actions: {
            create: dates.map((createdAt) => ({
              action: 'REJECTED',
              toStatus: 'REJECTED',
              createdAt,
              actorId: ids[0],
              note: 'Monthly decision test',
              details: {},
            })),
          },
        },
      });
    }
    const cases = [
      { status: 'RESOLVED' as const, createdAt: before, handledAt: from },
      { status: 'DISMISSED' as const, createdAt: from, handledAt: to },
      { status: 'OPEN' as const, createdAt: from, handledAt: null },
      { status: 'OPEN' as const, createdAt: before, handledAt: null },
    ];
    for (const [index, data] of cases.entries()) {
      const target = await prisma.user.create({
        data: { email: `${prefix}-month-${index}@example.test` },
      });
      ids.push(target.id);
      await prisma.userReport.create({
        data: {
          ...data,
          reporterId: ids[2],
          targetId: target.id,
          reason: 'SPAM',
          details: 'Monthly report test',
        },
      });
    }
    await prisma.adminAction.createMany({
      data: [from, last].map((createdAt) => ({
        actorId: ids[0],
        entityId: ids.at(-1)!,
        action: 'USER_LOCKED',
        createdAt,
        snapshot: {},
      })),
    });
    for (const [displayFrom, displayUntil] of [
      [before, to],
      [before, from],
      [to, new Date('2096-04-01T00:00:00Z')],
    ]) {
      await prisma.systemAnnouncement.create({
        data: {
          authorId: ids[0],
          title: 'Monthly announcement',
          message: 'Monthly statistics test',
          kind: 'GENERAL',
          published: true,
          displayFrom,
          displayUntil,
        },
      });
    }
    const february = (
      await admin.get(`${url}/admin/summary?month=2096-02`).expect(200)
    ).body;
    expect(february.revenue).toEqual({
      receivedAmount: 98000,
      refundAmount: -49000,
      netAmount: 49000,
    });
    expect(february.payments).toMatchObject({
      paid: 1,
      paidAmount: 98000,
      failed: 1,
    });
    expect(february.refunds).toMatchObject({
      completed: 1,
      completedAmount: 49000,
      pending: 1,
      failed: 0,
    });
    expect(february.listings).toEqual({ approved: 1, rejected: 1 });
    expect(february.reports).toEqual({ resolved: 1, dismissed: 0 });
    expect(february.processed).toEqual({
      listings: 1,
      reports: 1,
      refunds: 2,
      total: 4,
    });
    expect(february.refunds.rejected).toBe(1);
    expect(february.openReports).toBe(1);
    expect(february.pendingListings).toBe(1);
    expect(february.pendingRefunds).toBe(1);
    expect(february.lockedUsers).toBe(1);
    expect(february.activeAnnouncements).toBe(1);
    expect(february.currentQueues.pendingListings).toBe(
      baseline.currentQueues.pendingListings + 2,
    );
    expect(february.currentQueues.openReports).toBe(
      baseline.currentQueues.openReports + 2,
    );
    expect(february.currentQueues.pendingRefunds).toBe(
      baseline.currentQueues.pendingRefunds + 2,
    );
    const march = (
      await admin.get(`${url}/admin/summary?month=2096-03`).expect(200)
    ).body;
    expect(march.revenue).toEqual({
      receivedAmount: 2000,
      refundAmount: -98000,
      netAmount: -96000,
    });
    expect(march.refunds.completed).toBe(1);
    expect(march.listings).toEqual({ approved: 1, rejected: 0 });
    expect(march.reports).toEqual({ resolved: 0, dismissed: 1 });
    expect(march.processed).toEqual({
      listings: 1,
      reports: 1,
      refunds: 2,
      total: 4,
    });
    expect(march.refunds.rejected).toBe(1);
    const empty = (
      await admin.get(`${url}/admin/summary?month=2096-05`).expect(200)
    ).body;
    expect(empty.revenue).toEqual({
      receivedAmount: 0,
      refundAmount: 0,
      netAmount: 0,
    });
    expect(empty.listings).toEqual({ approved: 0, rejected: 0 });
    expect(empty.reports).toEqual({ resolved: 0, dismissed: 0 });
    expect(empty.processed).toEqual({
      listings: 0,
      reports: 0,
      refunds: 0,
      total: 0,
    });
    expect(
      empty.pendingListings +
        empty.openReports +
        empty.pendingRefunds +
        empty.lockedUsers +
        empty.activeAnnouncements,
    ).toBe(0);
  });

  it('serializes a simultaneous login and suspension and prevents publishing a locked user listing', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids[1] } });
    const racingLogin = request(app.getHttpServer())
      .post(`${url}/auth/login`)
      .set('Origin', origin)
      .send({ email: user.email, password });
    const lock = admin
      .patch(`${url}/admin/users/${user.id}/lock`)
      .set('Origin', origin)
      .send({
        version: user.moderationVersion,
        locked: true,
        reason: 'Khóa để kiểm tra xử lý đăng nhập đồng thời.',
      });
    const [loggedIn] = await Promise.all([racingLogin, lock.expect(200)]);
    expect([200, 403]).toContain(loggedIn.status);
    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    if (loggedIn.status === 200)
      await request(app.getHttpServer())
        .get(`${url}/auth/me`)
        .set('Cookie', loggedIn.headers['set-cookie'])
        .expect(401);
    else expect(loggedIn.body.code).toBe('ACCOUNT_LOCKED');
    const pending = await prisma.listing.create({
      data: {
        ownerId: user.id,
        status: 'PENDING',
        type: 'ROOM_WANTED',
        title: 'Tìm phòng trong cơ sở dữ liệu kiểm tra',
        description:
          'Tìm phòng đầy đủ thông tin để kiểm tra chặn duyệt tin tài khoản bị khóa.',
        rent: 1000000,
        provinceCode: '01',
        wardCode: '00004',
      },
    });
    const rejected = await admin
      .post(`${url}/admin/listings/${pending.id}/review`)
      .set('Origin', origin)
      .send({ version: pending.version, decision: 'PUBLISHED' })
      .expect(400);
    expect(rejected.body.code).toBe('LISTING_OWNER_LOCKED');
    expect(
      await prisma.listingReview.count({ where: { listingId: pending.id } }),
    ).toBe(0);
  });
});
