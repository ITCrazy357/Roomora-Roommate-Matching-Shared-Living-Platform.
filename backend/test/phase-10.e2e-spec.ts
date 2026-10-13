import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { MailService } from '../src/modules/auth/mail.service.js';

describe('Phase 10 reports, support and account closure (HTTP/PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = `phase10-${randomUUID()}`;
  const password = `Roomora-${randomUUID()}`;
  const origin = 'http://localhost:3000';
  const url = '/api/v1';
  const ids: string[] = [];
  const codes = new Map<string, string>();
  let admin: ReturnType<typeof request.agent>;
  let owner: ReturnType<typeof request.agent>;
  let reporter: ReturnType<typeof request.agent>;
  let closer: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;
  let listingId: string;
  let reportId: string;
  let orderId: string;
  let ticketId: string;
  let houseId: string;

  async function login(name: string) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${url}/auth/login`)
      .set('Origin', origin)
      .send({ email: `${prefix}-${name}@example.test`, password })
      .expect(200);
    return agent;
  }
  const post = (
    agent: ReturnType<typeof request.agent>,
    path: string,
    body: unknown,
  ) =>
    agent
      .post(url + path)
      .set('Origin', origin)
      .send(body);
  const patch = (
    agent: ReturnType<typeof request.agent>,
    path: string,
    body: unknown,
  ) =>
    agent
      .patch(url + path)
      .set('Origin', origin)
      .send(body);

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
    const mail = app.get(MailService);
    vi.spyOn(mail, 'sendAccountClosure').mockImplementation(
      async (email, code) => {
        codes.set(email, code);
      },
    );
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const passwordHash = await app.get(PasswordService).hash(password);
    for (const name of ['admin', 'owner', 'reporter', 'closer', 'other']) {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-${name}@example.test`,
          role: name === 'admin' ? 'ADMIN' : 'USER',
          emailVerifiedAt: new Date(),
          passwordHash,
          profile: {
            create: {
              displayName: name,
              visibility: 'PUBLIC',
              onboardingCompletedAt: new Date(),
              bio: 'PUBLIC BIO',
            },
          },
        },
      });
      ids.push(user.id);
    }
    [admin, owner, reporter, closer, other] = await Promise.all(
      ['admin', 'owner', 'reporter', 'closer', 'other'].map(login),
    );
    listingId = (
      await prisma.listing.create({
        data: {
          ownerId: ids[1],
          title: `${prefix} Phòng có dấu hiệu lừa đảo`,
          description: 'Nội dung công khai lúc báo cáo',
          privateAddress: 'SECRET PRIVATE ADDRESS',
          status: 'PUBLISHED',
          rent: 1000000,
        },
      })
    ).id;
    orderId = (
      await prisma.serviceOrder.create({
        data: {
          userId: ids[1],
          listingId,
          clientId: randomUUID(),
          planCode: 'BOOST_7_DAYS',
          planName: 'Đẩy tin 7 ngày',
          amount: 49000,
          durationDays: 7,
          buyerName: prefix,
          buyerEmail: `${prefix}-owner@example.test`,
          listingTitle: prefix,
          status: 'PAID',
          paidAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
          payUrl: 'https://example.test/PRIVATE-PAYMENT-URL',
          providerTransId: `${prefix}-tx`,
        },
      })
    ).id;
  }, 30000);

  afterAll(async () => {
    if (prisma && ids.length) {
      await prisma.adminAction.deleteMany({ where: { actorId: { in: ids } } });
      await prisma.supportTicket.deleteMany({ where: { userId: { in: ids } } });
      await prisma.userReport.deleteMany({
        where: { reporterId: { in: ids } },
      });
      await prisma.serviceRefundRequest.deleteMany({
        where: { order: { userId: { in: ids } } },
      });
      await prisma.serviceOrder.deleteMany({ where: { userId: { in: ids } } });
      await prisma.house.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.listing.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    vi.restoreAllMocks();
    await app?.close();
  });

  it('isolates every new ADMIN endpoint and user support endpoints', async () => {
    for (const path of [
      '/admin/orders',
      '/admin/audit',
      '/admin/support/tickets',
    ]) {
      await request(app.getHttpServer())
        .get(url + path)
        .expect(401);
      await owner.get(url + path).expect(403);
      await admin.get(url + path).expect(200);
    }
    await admin.get(`${url}/support/tickets`).expect(403);
    await post(admin, '/auth/account-closure/request', {}).expect(403);
    await request(app.getHttpServer())
      .post(`${url}/listings/${listingId}/reports`)
      .set('Origin', origin)
      .send({})
      .expect(401);
  });

  it('rejects own listing reports and validates input', async () => {
    await post(owner, `/listings/${listingId}/reports`, {
      reason: 'SCAM',
      details: 'Tin đăng của chính mình',
    }).expect(400);
    await post(reporter, `/listings/${listingId}/reports`, {
      reason: 'BAD',
      details: 'x',
    }).expect(400);
    await post(reporter, `/listings/${randomUUID()}/reports`, {
      reason: 'SCAM',
      details: 'Tin không tồn tại',
    }).expect(404);
  });

  it('receives a listing report only once under concurrent requests and saves a public snapshot', async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        post(reporter, `/listings/${listingId}/reports`, {
          reason: 'SCAM',
          details: 'Yêu cầu chuyển cọc với nội dung không đúng.',
        }),
      ),
    );
    expect(results.map((item) => item.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    reportId = results.find((item) => item.status === 201)!.body.id;
    const reports = (
      await admin.get(`${url}/admin/reports?type=LISTING`).expect(200)
    ).body;
    const report = reports.items.find(
      (item: { id: string }) => item.id === reportId,
    );
    expect(report.listingSnapshot.description).toBe(
      'Nội dung công khai lúc báo cáo',
    );
    expect(JSON.stringify(report)).not.toContain('SECRET PRIVATE ADDRESS');
    expect(report.target.lockedAt).toBeNull();
    await prisma.listing.update({
      where: { id: listingId },
      data: { description: 'Nội dung đã đổi', version: { increment: 1 } },
    });
    const snapshot = await prisma.userReport.findUniqueOrThrow({
      where: { id: reportId },
    });
    expect(snapshot.listingSnapshot).toMatchObject({
      description: 'Nội dung công khai lúc báo cáo',
      version: 1,
    });
  });

  it('allows separate account and listing reports for the same owner', async () => {
    await post(reporter, `/user-safety/${ids[1]}/report`, {
      reason: 'SCAM',
      details: 'Báo cáo riêng tài khoản người đăng',
    }).expect(201);
    const reports = (
      await admin.get(`${url}/admin/reports?type=USER`).expect(200)
    ).body;
    expect(
      reports.items.some((item: { id: string }) => item.id === reportId),
    ).toBe(false);
  });

  it('rolls back report handling when the listing version is stale', async () => {
    await patch(admin, `/admin/reports/${reportId}`, {
      status: 'RESOLVED',
      note: 'Đã đối chiếu nội dung lừa đảo',
      version: 1,
      removeListing: true,
      listingVersion: 1,
    }).expect(409);
    expect(
      (await prisma.userReport.findUniqueOrThrow({ where: { id: reportId } }))
        .status,
    ).toBe('OPEN');
    expect(
      await prisma.adminAction.count({ where: { entityId: reportId } }),
    ).toBe(0);
  });

  it('removes a reported listing once, ends its round, records history and leaves the account unlocked', async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        patch(admin, `/admin/reports/${reportId}`, {
          status: 'RESOLVED',
          note: 'Đã kiểm tra căn cứ và gỡ tin vi phạm',
          version: 1,
          removeListing: true,
          listingVersion: 2,
        }),
      ),
    );
    expect(results.map((item) => item.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: listingId },
    });
    expect(listing.status).toBe('REJECTED');
    expect(listing.postingRound).toBe(2);
    await reporter.get(`${url}/listings/${listingId}`).expect(404);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ids[1] } })).lockedAt,
    ).toBeNull();
    const history = (
      await admin.get(`${url}/admin/reports/${reportId}/history`).expect(200)
    ).body;
    expect(history.actions).toHaveLength(1);
    expect(history.actions[0].snapshot.removedListing).toBe(true);
  });

  it('looks up service orders without payment URLs or private profile data', async () => {
    const list = (
      await admin
        .get(`${url}/admin/orders?search=${encodeURIComponent(prefix)}`)
        .expect(200)
    ).body;
    expect(list.items.some((item: { id: string }) => item.id === orderId)).toBe(
      true,
    );
    expect(JSON.stringify(list)).not.toContain('PRIVATE-PAYMENT-URL');
    expect(JSON.stringify(list)).not.toContain('passwordHash');
    const detail = (
      await admin.get(`${url}/admin/orders/${orderId}`).expect(200)
    ).body;
    expect(detail.providerTransId).toBe(`${prefix}-tx`);
    await admin.get(`${url}/admin/orders?status=UNKNOWN`).expect(400);
    await admin.get(`${url}/admin/orders?search=${orderId}`).expect(200);
  });

  it('accepts support for an owned service order and prevents attaching another user order', async () => {
    await post(reporter, '/support/tickets', {
      subject: 'Hỗ trợ giao dịch',
      body: 'Xin kiểm tra giao dịch này',
      orderId,
    }).expect(404);
    ticketId = (
      await post(owner, '/support/tickets', {
        subject: 'Giao dịch đã thanh toán',
        body: 'Xin kiểm tra quyền lợi dịch vụ đã mua.',
        orderId,
      }).expect(201)
    ).body.id;
    await other.get(`${url}/support/tickets/${ticketId}`).expect(404);
    await post(other, `/support/tickets/${ticketId}/replies`, {
      version: 1,
      body: 'Không có quyền phản hồi',
    }).expect(404);
    const list = (await other.get(`${url}/support/tickets`).expect(200)).body;
    expect(
      list.items.some((item: { id: string }) => item.id === ticketId),
    ).toBe(false);
  });

  it('handles support concurrently once and keeps messages immutable', async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        patch(admin, `/admin/support/tickets/${ticketId}`, {
          version: 1,
          status: 'WAITING_USER',
          body: 'Vui lòng cung cấp thêm thời điểm giao dịch.',
        }),
      ),
    );
    expect(results.map((item) => item.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const detail = (
      await owner.get(`${url}/support/tickets/${ticketId}`).expect(200)
    ).body;
    expect(detail.messages).toHaveLength(2);
    expect(detail.status).toBe('WAITING_USER');
    expect(detail.messages[1].fromAdmin).toBe(true);
    expect(
      await prisma.adminAction.count({ where: { entityId: ticketId } }),
    ).toBe(1);
  });

  it('reopens on user reply, resolves with an audited response and closes explicitly', async () => {
    await post(owner, `/support/tickets/${ticketId}/replies`, {
      version: 2,
      body: 'Giao dịch lúc 10 giờ sáng hôm nay',
    }).expect(201);
    expect(
      (
        await prisma.supportTicket.findUniqueOrThrow({
          where: { id: ticketId },
        })
      ).status,
    ).toBe('IN_PROGRESS');
    await patch(admin, `/admin/support/tickets/${ticketId}`, {
      version: 3,
      status: 'RESOLVED',
      body: 'Đã đối chiếu và giải quyết giao dịch.',
    }).expect(200);
    await post(owner, `/support/tickets/${ticketId}/replies`, {
      version: 4,
      body: 'Tôi còn cần kiểm tra thêm thông tin',
    }).expect(201);
    expect(
      (
        await prisma.supportTicket.findUniqueOrThrow({
          where: { id: ticketId },
        })
      ).status,
    ).toBe('OPEN');
    await post(owner, `/support/tickets/${ticketId}/close`, {
      version: 5,
      body: 'Tôi xác nhận đã được hỗ trợ đầy đủ',
    }).expect(201);
    await post(owner, `/support/tickets/${ticketId}/replies`, {
      version: 6,
      body: 'Không thể thay đổi yêu cầu đã đóng',
    }).expect(409);
  });

  it('returns new activity statistics with the same month snapshot and audit filtering', async () => {
    const summary = (await admin.get(`${url}/admin/summary`).expect(200)).body;
    expect(summary.users.registered).toBeGreaterThanOrEqual(4);
    expect(summary.users.total).toBeGreaterThanOrEqual(4);
    expect(summary.activity.createdListings).toBeGreaterThanOrEqual(1);
    expect(summary.activity.acceptedConnections).toBeLessThanOrEqual(
      summary.activity.connections,
    );
    expect(summary.currentQueues.openSupport).toBeGreaterThanOrEqual(0);
    const audit = (
      await admin.get(`${url}/admin/audit?entityId=${ticketId}`).expect(200)
    ).body;
    expect(audit.total).toBe(2);
    expect(
      audit.items.every(
        (item: { entityId: string }) => item.entityId === ticketId,
      ),
    ).toBe(true);
  });

  it('enforces daily report and support limits across repeated submissions', async () => {
    for (let index = 0; index < 4; index++) {
      const listing = await prisma.listing.create({
        data: {
          ownerId: ids[1],
          status: 'PUBLISHED',
          title: `${prefix}-${index}`,
        },
      });
      const response = await post(reporter, `/listings/${listing.id}/reports`, {
        reason: 'SPAM',
        details: 'Nội dung gửi lặp có dấu hiệu spam',
      });
      expect(response.status).toBe(index < 3 ? 201 : 429);
    }
    for (let index = 0; index < 6; index++) {
      const response = await post(other, '/support/tickets', {
        subject: 'Yêu cầu kiểm tra',
        body: 'Nội dung hỗ trợ giới hạn trong ngày',
      });
      expect(response.status).toBe(index < 5 ? 201 : 429);
    }
  });

  it('blocks direct public profile access for locked users', async () => {
    await prisma.user.update({
      where: { id: ids[4] },
      data: { lockedAt: new Date(), lockReason: 'Kiểm tra bảo mật' },
    });
    await request(app.getHttpServer())
      .get(`${url}/profiles/${ids[4]}`)
      .expect(404);
    await prisma.user.update({
      where: { id: ids[4] },
      data: { lockedAt: null, lockReason: null },
    });
    await reporter.get(`${url}/profiles/${ids[4]}`).expect(200);
  });

  let challenge: { challengeId: string; code: string; confirmed: boolean };
  it('requires an account-specific closure OTP and explicit confirmation', async () => {
    const result = (
      await post(closer, '/auth/account-closure/request', {}).expect(200)
    ).body;
    challenge = {
      challengeId: result.challengeId,
      code: codes.get(`${prefix}-closer@example.test`)!,
      confirmed: true,
    };
    await post(other, '/auth/account-closure', challenge).expect(403);
    await post(closer, '/auth/account-closure', {
      ...challenge,
      confirmed: false,
    }).expect(400);
    const wrong = challenge.code === '000000' ? '111111' : '000000';
    await post(closer, '/auth/account-closure', {
      ...challenge,
      code: wrong,
    }).expect(403);
  });

  it('blocks closure with an active house and lets the same OTP retry after leaving', async () => {
    houseId = (
      await prisma.house.create({
        data: {
          ownerId: ids[4],
          name: prefix,
          members: { create: [{ userId: ids[4] }, { userId: ids[3] }] },
        },
      })
    ).id;
    const response = await post(
      closer,
      '/auth/account-closure',
      challenge,
    ).expect(409);
    expect(response.body.code).toBe('ACCOUNT_HAS_HOUSE');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ids[3] } })).closedAt,
    ).toBeNull();
    await prisma.houseMember.updateMany({
      where: { houseId, userId: ids[3] },
      data: { leftAt: new Date() },
    });
  });

  it('blocks closure while a service payment or refund is pending', async () => {
    const order = await prisma.serviceOrder.create({
      data: {
        userId: ids[3],
        listingId,
        clientId: randomUUID(),
        planCode: 'BOOST_7_DAYS',
        planName: 'Gói thử nghiệm',
        amount: 49000,
        durationDays: 7,
        buyerName: prefix,
        buyerEmail: `${prefix}-closer@example.test`,
        listingTitle: prefix,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    expect(
      (await post(closer, '/auth/account-closure', challenge).expect(409)).body
        .code,
    ).toBe('ACCOUNT_HAS_PAYMENT');
    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await prisma.serviceRefundRequest.create({
      data: {
        orderId: order.id,
        reason: 'Xin hoàn tiền thử nghiệm',
        amount: 49000,
      },
    });
    expect(
      (await post(closer, '/auth/account-closure', challenge).expect(409)).body
        .code,
    ).toBe('ACCOUNT_HAS_PAYMENT');
    await prisma.serviceRefundRequest.update({
      where: { orderId: order.id },
      data: { status: 'REJECTED' },
    });
  });

  it('blocks closure with debt or a pending transfer in a former house', async () => {
    await prisma.houseParticipant.createMany({
      data: [
        { houseId, id: ids[4], userId: ids[4], displayName: 'Người trả tiền' },
        {
          houseId,
          id: ids[3],
          userId: ids[3],
          displayName: 'Thành viên đã rời nhà',
          leftAt: new Date(),
        },
      ],
    });
    const expense = await prisma.expense.create({
      data: {
        houseId,
        payerId: ids[4],
        createdById: ids[4],
        title: 'Khoản chi trong nhà cũ',
        amount: 1000,
        splits: {
          create: [
            { houseId, participantId: ids[4], amount: 500 },
            { houseId, participantId: ids[3], amount: 500 },
          ],
        },
      },
    });
    expect(
      (await post(closer, '/auth/account-closure', challenge).expect(409)).body
        .code,
    ).toBe('ACCOUNT_HAS_DEBT');
    await prisma.debtPayment.create({
      data: {
        houseId,
        payerId: ids[3],
        recipientId: ids[4],
        createdById: ids[3],
        clientId: randomUUID(),
        amount: 500,
        method: 'CASH',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });
    // Cleared balance still cannot bypass a separate transfer awaiting confirmation.
    const pending = await prisma.debtPayment.create({
      data: {
        houseId,
        payerId: ids[3],
        recipientId: ids[4],
        createdById: ids[3],
        clientId: randomUUID(),
        amount: 100,
        method: 'CASH',
      },
    });
    expect(
      (await post(closer, '/auth/account-closure', challenge).expect(409)).body
        .code,
    ).toBe('ACCOUNT_HAS_DEBT');
    await prisma.debtPayment.update({
      where: { id: pending.id },
      data: { status: 'CANCELLED' },
    });
    await prisma.expense.update({
      where: { id: expense.id },
      data: { status: 'SETTLED' },
    });
  });

  it('closes a Google-only account, revokes sessions and preserves transaction history', async () => {
    // An established session of a Google-only account needs no password to close.
    await prisma.user.update({
      where: { id: ids[3] },
      data: {
        passwordHash: null,
        googleAccount: { create: { googleId: randomUUID() } },
      },
    });
    await prisma.listing.create({
      data: { ownerId: ids[3], title: prefix, status: 'PUBLISHED' },
    });
    await post(closer, '/auth/account-closure', challenge).expect(200);
    await closer.get(`${url}/auth/me`).expect(401);
    await request(app.getHttpServer())
      .get(`${url}/profiles/${ids[3]}`)
      .expect(404);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids[3] } });
    expect(user.closedAt).not.toBeNull();
    expect(user.lockedAt).not.toBeNull();
    expect(
      await prisma.session.count({
        where: { userId: ids[3], revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.listing.count({
        where: { ownerId: ids[3], status: 'PUBLISHED' },
      }),
    ).toBe(0);
    expect(await prisma.serviceOrder.count({ where: { userId: ids[3] } })).toBe(
      1,
    );
    await patch(admin, `/admin/users/${ids[3]}/lock`, {
      locked: false,
      version: user.moderationVersion,
      reason: 'Không được mở lại tài khoản đã đóng',
    }).expect(400);
    expect(
      await prisma.adminAction.count({
        where: { entityId: ids[3], action: 'ACCOUNT_CLOSED' },
      }),
    ).toBe(1);
  });

  it('lets ADMIN restore a closed account with a reason and preserves revoked sessions and privacy', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids[3] } });
    await post(owner, `/admin/users/${ids[3]}/restore`, {
      version: user.moderationVersion,
      reason: 'Không có quyền khôi phục tài khoản',
    }).expect(403);
    await post(admin, `/admin/users/${ids[3]}/restore`, {
      version: user.moderationVersion,
      reason: 'x',
    }).expect(400);
    const responses = await Promise.all(
      [1, 2].map(() =>
        post(admin, `/admin/users/${ids[3]}/restore`, {
          version: user.moderationVersion,
          reason: 'Đã đối chiếu yêu cầu khôi phục của chủ tài khoản qua email.',
        }),
      ),
    );
    expect(responses.map((item) => item.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const restored = await prisma.user.findUniqueOrThrow({
      where: { id: ids[3] },
      include: { profile: true },
    });
    expect(restored.closedAt).toBeNull();
    expect(restored.lockedAt).toBeNull();
    expect(restored.profile!.visibility).toBe('PRIVATE');
    expect(
      await prisma.listing.count({
        where: { ownerId: ids[3], status: 'PUBLISHED' },
      }),
    ).toBe(0);
    expect(
      await prisma.session.count({
        where: { userId: ids[3], revokedAt: null },
      }),
    ).toBe(0);
    await closer.get(`${url}/auth/me`).expect(401);
    expect(
      await prisma.adminAction.count({
        where: { entityId: ids[3], action: 'ACCOUNT_REOPENED' },
      }),
    ).toBe(1);
    await post(admin, `/admin/users/${ids[3]}/restore`, {
      version: restored.moderationVersion,
      reason: 'Tài khoản đang hoạt động không được khôi phục',
    }).expect(400);
  });

  it('requires a fresh login after ADMIN restores a password account', async () => {
    const previous = await login('owner');
    const challenge = (
      await post(owner, '/auth/account-closure/request', {}).expect(200)
    ).body;
    await post(owner, '/auth/account-closure', {
      challengeId: challenge.challengeId,
      code: codes.get(`${prefix}-owner@example.test`),
      confirmed: true,
    }).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids[1] } });
    await post(admin, `/admin/users/${ids[1]}/restore`, {
      version: user.moderationVersion,
      reason: 'Chủ tài khoản đã gửi yêu cầu và được xác minh để khôi phục.',
    }).expect(200);
    await previous.get(`${url}/auth/me`).expect(401);
    await owner.get(`${url}/auth/me`).expect(401);
    const fresh = await login('owner');
    await fresh.get(`${url}/auth/me`).expect(200);
  });
});
