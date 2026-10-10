import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { NotificationsService } from '../src/modules/communications/notifications.service.js';
import { ExpenseRemindersService } from '../src/modules/expenses/expense-reminders.service.js';
import { HouseAccessService } from '../src/modules/houses/house-access.service.js';
import { ConfigService } from '@nestjs/config';
import { vietnamDate } from '../src/modules/expenses/expense-promises.service.js';

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
  function uploadPayment(index: number, body: object, photo: Buffer) {
    const upload = agents[index]
      .post(base() + '/payments')
      .set('Origin', origin);
    for (const [key, value] of Object.entries(body))
      upload.field(key, String(value));
    return upload.attach('proof', photo, 'transfer.png');
  }
  const proofImage = (background = '#e65036') =>
    sharp({
      create: { width: 1800, height: 1000, channels: 3, background },
    })
      .png()
      .withMetadata()
      .toBuffer();
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
    await prisma.notification.deleteMany({
      where: { href: `/nha-chung/${houseId}/chi-phi` },
    });
    await prisma.repaymentPromise.deleteMany({ where: { houseId } });
    await prisma.debtReminder.deleteMany({ where: { houseId } });
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
  it('stores transfer proof atomically without confirming payment, sanitizes it and protects access', async () => {
    await create();
    const payment = (
      await uploadPayment(1, paymentBody(), await proofImage()).expect(201)
    ).body;
    expect(payment).toMatchObject({
      hasProof: true,
      status: 'PENDING',
      confirmedAt: null,
    });
    expect(payment).not.toHaveProperty('proof');
    expect(payment).not.toHaveProperty('contentHash');
    expect(
      (await balances()).find((person) => person.id === ids[1]),
    ).toMatchObject({ balance: -500, pendingSent: 500 });
    expect(
      await prisma.debtPaymentProof.count({ where: { paymentId: payment.id } }),
    ).toBe(1);
    const endpoint = base() + `/payments/${payment.id}/proof`;
    for (const index of [0, 1, 2]) {
      const file = await agents[index].get(endpoint).expect(200);
      expect(file.headers['content-type']).toContain('image/jpeg');
      expect(file.headers['cache-control']).toBe('private, no-store');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      const metadata = await sharp(file.body).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBe(1600);
      expect(metadata.exif).toBeUndefined();
    }
    await request(app.getHttpServer()).get(endpoint).expect(401);
    await agents[3].get(endpoint).expect(404);
    await agents[0].get(base() + `/payments/${randomUUID()}/proof`).expect(404);
    const listed = (await agents[0].get(base() + '/payments').expect(200)).body
      .items[0];
    expect(listed.hasProof).toBe(true);
    expect(listed).not.toHaveProperty('proof');
  });
  it('deduplicates concurrent multipart payments and rejects changed or omitted proof on retry', async () => {
    await create();
    const body = paymentBody(),
      photo = await proofImage();
    const retries = await Promise.all([
      uploadPayment(1, body, photo).expect(201),
      uploadPayment(1, body, photo).expect(201),
    ]);
    expect(retries[0].body.id).toBe(retries[1].body.id);
    expect(await prisma.debtPayment.count({ where: { houseId } })).toBe(1);
    expect(
      await prisma.debtPaymentProof.count({ where: { payment: { houseId } } }),
    ).toBe(1);
    const changed = await uploadPayment(
      1,
      body,
      await proofImage('#ffffff'),
    ).expect(409);
    expect(changed.body.code).toBe('PAYMENT_RETRY_CHANGED');
    await post(1, base() + '/payments', body).expect(409);
    await uploadPayment(1, { ...body, clientId: randomUUID() }, photo).expect(
      409,
    );
  });
  it('rejects invalid, oversized, duplicate and cash proofs without creating payments or reservations', async () => {
    await create();
    const photo = await proofImage();
    const cash = await uploadPayment(
      1,
      { ...paymentBody(), method: 'CASH' },
      photo,
    ).expect(400);
    expect(cash.body.code).toBe('PAYMENT_PROOF_METHOD');
    const invalid = await uploadPayment(
      1,
      paymentBody(),
      Buffer.from('not an image'),
    ).expect(400);
    expect(invalid.body.code).toBe('PAYMENT_PROOF_INVALID');
    await uploadPayment(
      1,
      paymentBody(),
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
      ),
    ).expect(400);
    await uploadPayment(
      1,
      paymentBody(),
      Buffer.alloc(5 * 1024 * 1024 + 1),
    ).expect(413);
    await uploadPayment(1, paymentBody(), photo)
      .attach('proof', photo, 'second.png')
      .expect(400);
    await uploadPayment(
      1,
      { ...paymentBody(), unexpected: 'field' },
      photo,
    ).expect(400);
    await post(1, base() + '/payments', {
      ...paymentBody(),
      amount: true,
    }).expect(400);
    await uploadPayment(3, paymentBody(), photo).expect(404);
    await uploadPayment(2, { ...paymentBody(), payerId: ids[1] }, photo).expect(
      403,
    );
    expect(await prisma.debtPayment.count({ where: { houseId } })).toBe(0);
    expect(
      await prisma.debtPaymentProof.count({ where: { payment: { houseId } } }),
    ).toBe(0);
    expect((await balances()).every((person) => person.pendingSent === 0)).toBe(
      true,
    );
  });
  it('retains proofs after rejection, cancellation and receiver confirmation', async () => {
    await create();
    const photo = await proofImage();
    for (const [index, action, status] of [
      [0, 'reject', 'REJECTED'],
      [1, 'cancel', 'CANCELLED'],
      [0, 'confirm', 'CONFIRMED'],
    ] as const) {
      const payment = (await uploadPayment(1, paymentBody(), photo).expect(201))
        .body;
      const updated = (
        await post(index, base() + `/payments/${payment.id}`, {
          version: 1,
          action,
        }).expect(201)
      ).body;
      expect(updated).toMatchObject({ status, hasProof: true });
      await agents[0].get(base() + `/payments/${payment.id}/proof`).expect(200);
      if (action === 'confirm')
        expect(updated.confirmationType).toBe('RECEIVER');
    }
    expect((await balances()).every((person) => person.balance === 0)).toBe(
      true,
    );
  });
  it('persists settled state, notifies the house once and reopens for new expenses', async () => {
    const state = () => agents[0].get(base() + '/balances').expect(200);
    expect((await state()).body).toMatchObject({
      isSettled: false,
      unsettledCount: 0,
    });
    await create({
      ...expenseBody(),
      splits: [{ userId: ids[0], amount: 1000 }],
    });
    await post(1, base() + '/settle').expect(403);
    expect((await post(0, base() + '/settle').expect(201)).body.settled).toBe(
      1,
    );
    expect((await state()).body).toMatchObject({
      isSettled: true,
      unsettledCount: 0,
    });
    const notices = await prisma.notification.findMany({
      where: {
        href: `/nha-chung/${houseId}/chi-phi`,
        title: { startsWith: 'Đã chốt quyết toán' },
      },
    });
    expect(notices.map((notice) => notice.userId).sort()).toEqual(
      ids.slice(0, 3).sort(),
    );
    const filtered = (
      await agents[1].get('/api/v1/notifications?type=HOUSE').expect(200)
    ).body;
    expect(
      filtered.items.some((notice: { title: string }) =>
        notice.title.startsWith('Đã chốt quyết toán'),
      ),
    ).toBe(true);
    expect((await post(0, base() + '/settle').expect(201)).body.settled).toBe(
      0,
    );
    expect(
      await prisma.notification.count({
        where: { id: { in: notices.map((notice) => notice.id) } },
      }),
    ).toBe(3);
    expect(
      await prisma.notification.count({
        where: {
          href: `/nha-chung/${houseId}/chi-phi`,
          title: { startsWith: 'Đã chốt quyết toán' },
        },
      }),
    ).toBe(3);
    await create();
    expect((await state()).body).toMatchObject({
      isSettled: false,
      unsettledCount: 1,
    });
  });
  const promiseDate = (days: number) =>
    vietnamDate(new Date(Date.now() + days * 86400000));
  async function ageDebt(participantId = ids[1]) {
    const now = new Date();
    return prisma.debtReminder.update({
      where: { houseId_participantId: { houseId, participantId } },
      data: {
        debtSinceAt: new Date(now.getTime() - 8 * 86400000),
        nextReminderAt: new Date(now.getTime() - 1000),
        lastReminderAt: null,
      },
    });
  }
  it('queues weekly debt email once across worker instances and skips the first seven days', async () => {
    await create();
    const reminders = app.get(ExpenseRemindersService),
      now = new Date();
    let state = await prisma.debtReminder.findUniqueOrThrow({
      where: { houseId_participantId: { houseId, participantId: ids[1] } },
    });
    await reminders.runDue(now, houseId);
    expect(
      await prisma.notification.count({ where: { debtReminderId: state.id } }),
    ).toBe(0);
    state = await ageDebt();
    const otherWorker = new ExpenseRemindersService(
      prisma,
      app.get(HouseAccessService),
      app.get(NotificationsService),
      app.get(ConfigService),
    );
    await Promise.all([
      reminders.runDue(now, houseId),
      otherWorker.runDue(now, houseId),
    ]);
    const notices = await prisma.notification.findMany({
      where: { debtReminderId: state.id },
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      userId: ids[1],
      emailRequired: true,
      emailSentAt: null,
    });
    await reminders.runDue(new Date(now.getTime() + 6 * 86400000), houseId);
    expect(
      await prisma.notification.count({ where: { debtReminderId: state.id } }),
    ).toBe(1);
    await reminders.runDue(new Date(now.getTime() + 7 * 86400000), houseId);
    expect(
      await prisma.notification.count({ where: { debtReminderId: state.id } }),
    ).toBe(2);
  });
  it('validates repayment dates, notifies the creditor, protects versions and cancels queued reminders', async () => {
    await create();
    const state = await ageDebt(),
      reminders = app.get(ExpenseRemindersService);
    await reminders.runDue(new Date(), houseId);
    for (const payOn of [
      promiseDate(-1),
      promiseDate(31),
      '2026-02-30',
      promiseDate(1) + 'T12:00:00Z',
    ])
      await post(1, base() + '/repayment-promises', {
        recipientId: ids[0],
        payOn,
      }).expect(400);
    await post(3, base() + '/repayment-promises', {
      recipientId: ids[0],
      payOn: promiseDate(8),
    }).expect(404);
    await post(0, base() + '/repayment-promises', {
      recipientId: ids[1],
      payOn: promiseDate(8),
    }).expect(400);
    const body = { recipientId: ids[0], payOn: promiseDate(8) };
    await post(1, base() + '/repayment-promises', {
      ...body,
      payerId: ids[2],
    }).expect(400);
    await post(1, base() + '/repayment-promises', body).expect(201);
    await post(1, base() + '/repayment-promises', body).expect(201);
    const result = (await agents[1].get(base() + '/balances').expect(200)).body;
    expect(result.repaymentPromises).toHaveLength(1);
    expect(result.repaymentPromises[0]).toMatchObject({
      payOn: body.payOn,
      amount: 500,
      version: 1,
      payerUserId: ids[1],
    });
    expect(
      result.balances.find((person: { id: string }) => person.id === ids[1])
        .reminderPausedUntil,
    ).toBeTruthy();
    expect(
      await prisma.notification.count({
        where: {
          userId: ids[0],
          href: `/nha-chung/${houseId}/chi-phi`,
          title: { contains: 'hẹn trả tiền' },
        },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { debtReminderId: state.id, emailRequired: true },
      }),
    ).toBe(0);
    await post(1, base() + '/repayment-promises', {
      ...body,
      payOn: promiseDate(10),
      version: 9,
    }).expect(409);
    await post(1, base() + '/repayment-promises', {
      ...body,
      payOn: promiseDate(10),
      version: 1,
    }).expect(201);
    await agents[1]
      .delete(base() + `/repayment-promises/${ids[0]}`)
      .set('Origin', origin)
      .send({ version: 1 })
      .expect(409);
    await agents[1]
      .delete(base() + `/repayment-promises/${ids[0]}`)
      .set('Origin', origin)
      .send({ version: 2 })
      .expect(200);
    expect(await prisma.repaymentPromise.count({ where: { houseId } })).toBe(0);
    expect(
      (await prisma.debtReminder.findUniqueOrThrow({ where: { id: state.id } }))
        .pausedUntil,
    ).toBeNull();
  });
  it('resumes reminders after the promised day in Vietnam and does not reset the weekly cadence', async () => {
    await create();
    await post(1, base() + '/repayment-promises', {
      recipientId: ids[0],
      payOn: promiseDate(1),
    }).expect(201);
    const promise = await prisma.repaymentPromise.findFirstOrThrow({
      where: { houseId },
    });
    expect(promise.remindAfter.toISOString()).toContain('16:59:59.999Z');
    const state = await ageDebt(),
      reminders = app.get(ExpenseRemindersService);
    await reminders.runDue(new Date(), houseId);
    expect(
      await prisma.notification.count({ where: { debtReminderId: state.id } }),
    ).toBe(0);
    const due = new Date(promise.remindAfter.getTime() + 1);
    await reminders.runDue(due, houseId);
    expect(
      await prisma.notification.count({ where: { debtReminderId: state.id } }),
    ).toBe(1);
    await reminders.runDue(new Date(due.getTime() + 6 * 86400000), houseId);
    expect(
      await prisma.notification.count({ where: { debtReminderId: state.id } }),
    ).toBe(1);
  });
  it('stops queued mail for pending or paid debt and starts a fresh seven-day clock for new debt', async () => {
    await create();
    const state = await ageDebt(),
      reminders = app.get(ExpenseRemindersService);
    await reminders.runDue(new Date(), houseId);
    const payment = (
      await post(1, base() + '/payments', paymentBody()).expect(201)
    ).body;
    expect(
      await prisma.notification.count({
        where: { debtReminderId: state.id, emailRequired: true },
      }),
    ).toBe(0);
    await reminders.runDue(new Date(Date.now() + 20 * 86400000), houseId);
    expect(
      await prisma.notification.count({ where: { debtReminderId: state.id } }),
    ).toBe(1);
    await post(0, base() + `/payments/${payment.id}`, {
      version: 1,
      action: 'confirm',
    }).expect(201);
    expect(
      (await prisma.debtReminder.findUniqueOrThrow({ where: { id: state.id } }))
        .debtSinceAt,
    ).toBeNull();
    await post(0, base() + '/settle').expect(201);
    await create();
    const fresh = await prisma.debtReminder.findUniqueOrThrow({
      where: { id: state.id },
    });
    expect(fresh.lastReminderAt).toBeNull();
    expect(fresh.nextReminderAt!.getTime() - fresh.debtSinceAt!.getTime()).toBe(
      7 * 86400000,
    );
  });
  it('only pauses aggregated email when all outstanding creditor transfers have valid promises', async () => {
    await create({
      ...expenseBody(),
      amount: 2000,
      splits: [
        { userId: ids[0], amount: 1000 },
        { userId: ids[1], amount: 1000 },
      ],
    });
    await create({
      ...expenseBody(),
      payerId: ids[2],
      amount: 2000,
      splits: [
        { userId: ids[2], amount: 1000 },
        { userId: ids[1], amount: 1000 },
      ],
    });
    await post(1, base() + '/repayment-promises', {
      recipientId: ids[0],
      payOn: promiseDate(9),
    }).expect(201);
    let state = await prisma.debtReminder.findUniqueOrThrow({
      where: { houseId_participantId: { houseId, participantId: ids[1] } },
    });
    expect(state.pausedUntil).toBeNull();
    await post(1, base() + '/repayment-promises', {
      recipientId: ids[2],
      payOn: promiseDate(10),
    }).expect(201);
    state = await prisma.debtReminder.findUniqueOrThrow({
      where: { id: state.id },
    });
    expect(state.pausedUntil?.toISOString().slice(0, 10)).toBe(promiseDate(9));
    await create({
      ...expenseBody(),
      splits: [{ userId: ids[1], amount: 1000 }],
    });
    state = await prisma.debtReminder.findUniqueOrThrow({
      where: { id: state.id },
    });
    expect(state.pausedUntil).toBeNull();
  });
  it('retains personal debt history after leaving, permits settling it and denies other house data', async () => {
    const row = await create();
    const unrelated = await create({
      ...expenseBody(),
      title: 'Chỉ trưởng nhà',
      splits: [{ userId: ids[0], amount: 1000 }],
    });
    await create({
      ...expenseBody(),
      splits: [
        { userId: ids[0], amount: 500 },
        { userId: ids[2], amount: 500 },
      ],
    });
    const otherPayment = (
      await uploadPayment(2, paymentBody(250), await proofImage()).expect(201)
    ).body;
    await post(1, `/api/v1/houses/${houseId}/leave`).expect(201);
    await agents[1].get(`/api/v1/houses/${houseId}`).expect(404);
    await agents[1].get(base() + '/participants').expect(404);
    const result = (await agents[1].get(base()).expect(200)).body;
    expect(result.active).toBe(false);
    expect(result.items.map((expense: { id: string }) => expense.id)).toEqual([
      row.id,
    ]);
    await agents[1].get(base() + `/${unrelated.id}/history`).expect(404);
    await agents[1]
      .get(base() + `/payments/${otherPayment.id}/proof`)
      .expect(404);
    expect(
      (await agents[1].get(base() + '/balances').expect(200)).body.balances,
    ).toHaveLength(1);
    const payment = (
      await uploadPayment(1, paymentBody(), await proofImage()).expect(201)
    ).body;
    await agents[1].get(base() + `/payments/${payment.id}/proof`).expect(200);
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
