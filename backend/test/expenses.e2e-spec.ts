import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { NotificationsService } from '../src/modules/communications/notifications.service.js';

describe('Phase 7 expenses and debt (real PostgreSQL)', () => {
  let app: INestApplication, prisma: PrismaService, houseId: string;
  const ids: string[] = [];
  const agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000';
  const base = () => `/api/v1/houses/${houseId}/expenses`;
  function post(index: number, path: string, body: object = {}) {
    return agents[index].post(path).set('Origin', origin).send(body);
  }
  function patch(index: number, id: string, body: object) {
    return agents[index]
      .patch(base() + '/' + id)
      .set('Origin', origin)
      .send(body);
  }
  const expenseBody = () => ({
    clientId: randomUUID(),
    title: 'Tiền điện tháng này',
    amount: 1000,
    payerId: ids[0],
    splits: [
      { userId: ids[0], amount: 500 },
      { userId: ids[1], amount: 500 },
    ],
  });
  async function create(body: object = expenseBody()) {
    return (await post(0, base(), body).expect(201)).body;
  }
  const paymentBody = (amount = 500) => ({
    clientId: randomUUID(),
    recipientId: ids[0],
    amount,
    method: 'BANK_TRANSFER',
  });
  const balances = async () =>
    (await agents[0].get(base() + '/balances').expect(200)).body.balances as {
      id: string;
      balance: number;
      pendingSent: number;
    }[];

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
    for (let index = 0; index < 4; index++) {
      const id = randomUUID();
      ids.push(id);
      const email = `phase7-${id}@example.test`;
      await prisma.user.create({
        data: {
          id,
          email,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: `Phase 7 member ${index}` } },
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
    houseId = (
      await post(0, '/api/v1/houses', { name: 'Phase 7 finance house' }).expect(
        201,
      )
    ).body.id;
    for (const index of [1, 2]) {
      const connection = (
        await post(0, '/api/v1/connections', { targetId: ids[index] }).expect(
          201,
        )
      ).body;
      await post(index, `/api/v1/connections/${connection.id}/accept`, {
        version: connection.version,
      }).expect(201);
      const house = (
        await post(0, `/api/v1/houses/${houseId}/invites`, {
          userId: ids[index],
        }).expect(201)
      ).body;
      const inviteId = house.invites.find((invite: { label: string }) =>
        invite.label.endsWith(String(index)),
      ).id;
      await post(index, `/api/v1/houses/invites/${inviteId}/accept`).expect(
        201,
      );
    }
  }, 30000);
  async function clearFinance() {
    await prisma.expenseAdjustment.deleteMany({
      where: { expense: { houseId } },
    });
    await prisma.debtPayment.deleteMany({ where: { houseId } });
    await prisma.expense.deleteMany({ where: { houseId } });
    await prisma.houseParticipant.deleteMany({
      where: { houseId, userId: null },
    });
  }
  beforeEach(async () => {
    await clearFinance();
  });
  afterAll(async () => {
    if (prisma && houseId) {
      await clearFinance();
      await prisma.house.delete({ where: { id: houseId } });
    }
    if (prisma) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
    vi.restoreAllMocks();
  });

  it('protects house accounting, paginates with query parameters and accepts the original custom split API', async () => {
    const row = await create();
    await create({ ...expenseBody(), title: 'Khoản thứ hai' });
    const page = (await agents[1].get(base() + '?limit=1&page=2').expect(200))
      .body;
    expect(page).toMatchObject({ total: 2, page: 2, pages: 2 });
    expect(page.items).toHaveLength(1);
    expect(
      row.splits.reduce(
        (total: number, split: { amount: number }) => total + split.amount,
        0,
      ),
    ).toBe(1000);
    expect(row).not.toHaveProperty('contentHash');
    for (const suffix of [
      '',
      '/balances',
      '/settlements',
      '/payments',
      '/participants',
      `/${row.id}/history`,
      `/${row.id}/receipt`,
    ]) {
      await agents[3].get(base() + suffix).expect(404);
      await request(app.getHttpServer())
        .get(base() + suffix)
        .expect(401);
    }
    await post(3, base(), expenseBody()).expect(404);
    await agents[0].get(base() + '?limit=100').expect(400);
  });
  it('splits integer VND deterministically, including remainders and zero shares', async () => {
    const row = await create({
      ...expenseBody(),
      splits: undefined,
      splitMode: 'EQUAL',
      amount: 1001,
      participantIds: [ids[1], ids[0]],
    });
    const shares = row.splits as { participantId: string; amount: number }[];
    expect(shares.map((split) => split.amount).sort()).toEqual([500, 501]);
    expect(
      shares.find((split) => split.participantId === ids.slice(0, 2).sort()[0])!
        .amount,
    ).toBe(501);
    const tiny = await create({
      ...expenseBody(),
      splits: undefined,
      splitMode: 'EQUAL',
      amount: 1,
      participantIds: ids.slice(0, 3),
    });
    expect(
      tiny.splits.map((split: { amount: number }) => split.amount).sort(),
    ).toEqual([0, 0, 1]);
    expect((await balances()).reduce((sum, row) => sum + row.balance, 0)).toBe(
      0,
    );
  });
  it('rejects bad totals, duplicate participants, foreign participants and invalid DTO fields', async () => {
    for (const body of [
      { ...expenseBody(), amount: 1001 },
      {
        ...expenseBody(),
        splits: [
          { userId: ids[1], amount: 500 },
          { userId: ids[1], amount: 500 },
        ],
      },
      { ...expenseBody(), splits: [{ userId: ids[3], amount: 1000 }] },
      { ...expenseBody(), payerId: ids[3] },
      { ...expenseBody(), title: '   ' },
      { ...expenseBody(), amount: 1.5 },
      { ...expenseBody(), splits: undefined },
      { ...expenseBody(), createdById: ids[3] },
      { ...expenseBody(), receiptUrl: 'javascript:alert(1)' },
    ])
      await post(0, base(), body).expect(400);
    const row = await create({
      ...expenseBody(),
      splits: [{ userId: ids[1], amount: 1000 }],
    });
    expect(row.payerId).toBe(ids[0]); // A payer may cover somebody else's whole share.
  });
  it('deduplicates concurrent expense retries and preserves original retry semantics after an edit', async () => {
    const body = expenseBody();
    const replies = await Promise.all([
      post(0, base(), body),
      post(0, base(), body),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    expect(replies[0].body.id).toBe(replies[1].body.id);
    const row = replies[0].body;
    await patch(0, row.id, {
      ...body,
      title: 'Đã sửa',
      version: 1,
      reason: 'Sửa tiêu đề',
    }).expect(200);
    expect((await post(0, base(), body).expect(201)).body.title).toBe('Đã sửa');
    await post(0, base(), { ...body, amount: 2000 }).expect(400);
    await post(0, base(), { ...body, title: 'Khác' }).expect(409);
    expect(await prisma.expense.count({ where: { houseId } })).toBe(1);
  });
  it('permits only the creator or owner to edit and stores before/after snapshots with conflict protection', async () => {
    const row = await create();
    await patch(1, row.id, {
      ...expenseBody(),
      version: 1,
      reason: 'Không phải người tạo',
    }).expect(403);
    const results = await Promise.all(
      ['Thay đổi A', 'Thay đổi B'].map((title) =>
        patch(0, row.id, {
          ...expenseBody(),
          title,
          version: 1,
          reason: 'Cập nhật khoản chi',
        }),
      ),
    );
    expect(results.map((reply) => reply.status).sort()).toEqual([200, 409]);
    const history = (
      await agents[1].get(base() + `/${row.id}/history`).expect(200)
    ).body;
    expect(history.map((item: { action: string }) => item.action)).toEqual([
      'CREATE',
      'EDIT',
    ]);
    expect(history[1].oldSnapshot.title).toBe(row.title);
    expect(history[1].newSnapshot.title).not.toBe(row.title);
    const memberCreated = (await post(1, base(), expenseBody()).expect(201))
      .body;
    await patch(0, memberCreated.id, {
      ...expenseBody(),
      version: 1,
      reason: 'Trưởng nhà chỉnh sửa',
    }).expect(200);
  });
  it('keeps pending payments out of balances and allows only the recipient to confirm once', async () => {
    await create();
    const payment = (
      await post(1, base() + '/payments', paymentBody(250)).expect(201)
    ).body;
    expect((await balances()).find((row) => row.id === ids[1])!.balance).toBe(
      -500,
    );
    await post(1, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(403);
    await post(2, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(403);
    await post(3, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(404);
    await post(0, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(201);
    await post(0, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(201);
    expect(
      (await balances()).map((row) => row.balance).sort((a, b) => a - b),
    ).toEqual([-250, 0, 250]);
    expect(
      await prisma.debtPayment.count({
        where: { houseId, status: 'CONFIRMED' },
      }),
    ).toBe(1);
    await post(1, base() + `/payments/${payment.id}`, {
      version: 2,
      action: 'cancel',
    }).expect(409);
  });
  it('deduplicates payment retries and reserves amounts against concurrent overpayment', async () => {
    await create();
    const body = paymentBody();
    const retries = await Promise.all([
      post(1, base() + '/payments', body),
      post(1, base() + '/payments', body),
    ]);
    expect(retries.map((reply) => reply.status)).toEqual([201, 201]);
    expect(retries[0].body.id).toBe(retries[1].body.id);
    await post(1, base() + '/payments', { ...body, amount: 400 }).expect(409);
    await post(1, base() + '/payments', paymentBody(1)).expect(409);
    expect(
      (await agents[1].get(base() + '/settlements').expect(200)).body,
    ).toEqual([]);
    await post(1, base() + `/payments/${retries[0].body.id}`, {
      version: 1,
      action: 'cancel',
    }).expect(201);
    const attempts = await Promise.all([
      post(1, base() + '/payments', paymentBody(300)),
      post(1, base() + '/payments', paymentBody(300)),
    ]);
    expect(attempts.map((reply) => reply.status).sort()).toEqual([201, 409]);
  });
  it('blocks changes while payment is pending, and releases reservations on rejection or cancellation', async () => {
    const row = await create();
    const payment = (
      await post(1, base() + '/payments', paymentBody()).expect(201)
    ).body;
    await patch(0, row.id, {
      ...expenseBody(),
      version: 1,
      reason: 'Sửa khi đang trả',
    }).expect(409);
    await post(0, base() + `/${row.id}/cancel`, {
      version: 1,
      reason: 'Hủy khi đang trả',
    }).expect(409);
    await post(0, base(), expenseBody()).expect(409);
    await post(0, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'reject',
    }).expect(201);
    expect(
      (await agents[1].get(base() + '/settlements').expect(200)).body[0].amount,
    ).toBe(500);
    await post(0, base() + `/${row.id}/cancel`, {
      version: 1,
      reason: 'Hóa đơn nhập nhầm',
    }).expect(201);
    expect((await balances()).every((row) => row.balance === 0)).toBe(true);
    const history = (
      await agents[0].get(base() + `/${row.id}/history`).expect(200)
    ).body;
    expect(history.at(-1).action).toBe('CANCEL');
  });
  it('settles only at zero debt and adjusts settled expenses without deleting confirmed payments', async () => {
    const row = await create();
    await post(0, base() + '/settle').expect(409);
    const payment = (
      await post(1, base() + '/payments', paymentBody()).expect(201)
    ).body;
    await post(0, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(201);
    await post(1, base() + '/settle').expect(403);
    expect((await post(0, base() + '/settle').expect(201)).body.settled).toBe(
      1,
    );
    const settled = (await agents[0].get(base()).expect(200)).body.items[0];
    expect(settled.status).toBe('SETTLED');
    const body = {
      ...expenseBody(),
      amount: 1200,
      splits: [
        { userId: ids[0], amount: 600 },
        { userId: ids[1], amount: 600 },
      ],
      version: settled.version,
      reason: 'Điều chỉnh số tiền trên hóa đơn thật',
    };
    const updated = (await patch(0, row.id, body).expect(200)).body;
    expect(updated.status).toBe('ACTIVE');
    expect(
      (await balances()).find((person) => person.id === ids[1])!.balance,
    ).toBe(-100);
    expect(
      await prisma.debtPayment.count({
        where: { houseId, status: 'CONFIRMED' },
      }),
    ).toBe(1);
    const history = (
      await agents[0].get(base() + `/${row.id}/history`).expect(200)
    ).body;
    expect(history.map((change: { action: string }) => change.action)).toEqual([
      'CREATE',
      'SETTLE',
      'ADJUST_SETTLED',
    ]);
  });
  it('stores receipt images privately, strips metadata and checks the expense version', async () => {
    const row = await create();
    const photo = await sharp({
      create: { width: 50, height: 50, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await agents[1]
      .post(base() + `/${row.id}/receipt`)
      .set('Origin', origin)
      .field('version', '1')
      .attach('receipt', photo, 'receipt.png')
      .expect(403);
    const uploaded = (
      await agents[0]
        .post(base() + `/${row.id}/receipt`)
        .set('Origin', origin)
        .field('version', '1')
        .attach('receipt', photo, 'receipt.png')
        .expect(201)
    ).body;
    expect(uploaded.hasReceipt).toBe(true);
    expect(uploaded.version).toBe(2);
    const file = await agents[1].get(base() + `/${row.id}/receipt`).expect(200);
    expect(file.headers['content-type']).toContain('image/jpeg');
    expect(file.headers['cache-control']).toBe('private, no-store');
    const metadata = await sharp(file.body as Buffer).metadata();
    expect(metadata.exif).toBeUndefined();
    await agents[3].get(base() + `/${row.id}/receipt`).expect(404);
    await agents[0]
      .post(base() + `/${row.id}/receipt`)
      .set('Origin', origin)
      .field('version', '1')
      .attach('receipt', photo, 'receipt.png')
      .expect(409);
    await agents[0]
      .post(base() + `/${row.id}/receipt`)
      .set('Origin', origin)
      .field('version', '2')
      .attach('receipt', Buffer.from('not an image'), 'receipt.png')
      .expect(400);
  });
  it('accounts for people outside the app without fake users or false receiver confirmation', async () => {
    await post(1, base() + '/participants', {
      displayName: 'Người ngoài ứng dụng',
    }).expect(403);
    const guest = (
      await post(0, base() + '/participants', {
        displayName: 'Người ngoài ứng dụng',
      }).expect(201)
    ).body;
    expect(guest).toMatchObject({ userId: null, isGuest: true });
    expect(
      await prisma.user.findUnique({ where: { id: guest.id } }),
    ).toBeNull();
    await create({
      ...expenseBody(),
      payerId: guest.id,
      splits: [
        { userId: ids[0], amount: 500 },
        { userId: ids[1], amount: 500 },
      ],
    });
    const payment = (
      await post(1, base() + '/payments', {
        ...paymentBody(),
        recipientId: guest.id,
      }).expect(201)
    ).body;
    await post(1, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(403);
    const confirmed = (
      await post(0, base() + `/payments/${payment.id}`, {
        version: 1,
        action: 'confirm',
      }).expect(201)
    ).body;
    expect(confirmed.confirmationType).toBe('OWNER_RECORDED');
    expect(confirmed.confirmedById).toBe(ids[0]);
    await agents[0]
      .delete(base() + `/participants/${guest.id}`)
      .set('Origin', origin)
      .expect(200);
    expect(
      (await balances()).find((person) => person.id === guest.id)!.balance,
    ).toBe(500);
    await post(0, base(), { ...expenseBody(), payerId: guest.id }).expect(400);
    await clearFinance();
    const payerGuest = (
      await post(0, base() + '/participants', {
        displayName: 'Người trả ngoài app',
      }).expect(201)
    ).body;
    await create({
      ...expenseBody(),
      splits: [{ participantId: payerGuest.id, amount: 1000 }],
    });
    const body = { ...paymentBody(1000), payerId: payerGuest.id };
    await post(1, base() + '/payments', body).expect(403);
    const recorded = (await post(0, base() + '/payments', body).expect(201))
      .body;
    await post(0, base() + `/payments/${recorded.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(201);
    expect((await balances()).every((person) => person.balance === 0)).toBe(
      true,
    );
  });
  it('retains personal debt history after leaving, permits settling it and denies other house data', async () => {
    const row = await create();
    const unrelated = await create({
      ...expenseBody(),
      title: 'Chỉ trưởng nhà',
      splits: [{ userId: ids[0], amount: 1000 }],
    });
    await post(1, `/api/v1/houses/${houseId}/leave`).expect(201);
    await agents[1].get(`/api/v1/houses/${houseId}`).expect(404);
    await agents[1].get(base() + '/participants').expect(404);
    const result = (await agents[1].get(base()).expect(200)).body;
    expect(result.active).toBe(false);
    expect(result.items.map((expense: { id: string }) => expense.id)).toEqual([
      row.id,
    ]);
    await agents[1].get(base() + `/${unrelated.id}/history`).expect(404);
    expect(
      (await agents[1].get(base() + '/balances').expect(200)).body.balances,
    ).toHaveLength(1);
    const payment = (
      await post(1, base() + '/payments', paymentBody()).expect(201)
    ).body;
    await post(0, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(201);
    expect(
      (await agents[1].get(base() + '/balances').expect(200)).body.balances[0]
        .balance,
    ).toBe(0);
    const newHouse = (
      await post(1, '/api/v1/houses', { name: 'Nhà sau khi rời' }).expect(201)
    ).body;
    await post(1, '/api/v1/houses', { name: 'Nhà thứ ba' }).expect(409);
    await prisma.house.delete({ where: { id: newHouse.id } });
  });
  it('keeps guest debts actionable after the last member leaves and the house is archived', async () => {
    const guest = (
      await post(0, base() + '/participants', {
        displayName: 'Chủ phòng ngoài ứng dụng',
      }).expect(201)
    ).body;
    await create({
      ...expenseBody(),
      payerId: guest.id,
      splits: [{ userId: ids[0], amount: 1000 }],
    });
    await post(2, `/api/v1/houses/${houseId}/leave`).expect(201);
    await post(0, `/api/v1/houses/${houseId}/leave`).expect(201);
    expect(
      (await prisma.house.findUniqueOrThrow({ where: { id: houseId } }))
        .closedAt,
    ).not.toBeNull();
    const payment = (
      await post(0, base() + '/payments', {
        ...paymentBody(1000),
        recipientId: guest.id,
      }).expect(201)
    ).body;
    const confirmed = (
      await post(0, base() + `/payments/${payment.id}`, {
        version: 1,
        action: 'confirm',
      }).expect(201)
    ).body;
    expect(confirmed.confirmationType).toBe('OWNER_RECORDED');
    expect(
      (
        await agents[0].get(base() + '/balances').expect(200)
      ).body.balances.every(
        (person: { balance: number }) => person.balance === 0,
      ),
    ).toBe(true);
    await post(0, base(), expenseBody()).expect(404);
  });
});
