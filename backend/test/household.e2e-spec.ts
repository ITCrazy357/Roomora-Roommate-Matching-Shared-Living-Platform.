import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { HouseAccessService } from '../src/modules/houses/house-access.service.js';
import { HouseholdAccessService } from '../src/modules/household/household-access.service.js';
import { RecurringSchedulerService } from '../src/modules/household/recurring-scheduler.service.js';
import { vietnamDate } from '../src/modules/expenses/expense-promises.service.js';

describe('Phase 8 household (real HTTP and PostgreSQL)', () => {
  let app: INestApplication,
    prisma: PrismaService,
    houseId: string,
    otherHouseId: string,
    guestId: string;
  const ids: string[] = [],
    agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000',
    today = vietnamDate(new Date()),
    month = today.slice(0, 7);
  const base = () => `/api/v1/houses/${houseId}/household`;
  const expensePath = () => `/api/v1/houses/${houseId}/expenses`;
  const post = (index: number, path: string, body: object = {}) =>
    agents[index].post(path).set('Origin', origin).send(body);
  const patch = (index: number, path: string, body: object) =>
    agents[index].patch(path).set('Origin', origin).send(body);
  const chore = () => ({
    clientId: randomUUID(),
    title: 'Dọn bếp',
    note: 'Lau bàn và bếp',
    assigneeId: ids[1],
    dueOn: today,
  });
  const rule = (amount: number | null = 1001) => ({
    clientId: randomUUID(),
    title: 'Internet',
    amount,
    category: 'INTERNET',
    payerId: ids[1],
    participantIds: [ids[0], ids[1]],
    dayOfMonth: Number(today.slice(8)),
    firstOn: today,
  });
  const confirmation = () => ({
    title: 'Internet thực tế',
    amount: 1001,
    category: 'INTERNET',
    payerId: ids[1],
    splitMode: 'EQUAL',
    participantIds: [ids[0], ids[1]],
    spentOn: today,
    version: 1,
  });
  const scheduler = () =>
    app.get(RecurringSchedulerService).run(new Date(), houseId);
  async function draft(amount: number | null = 1001) {
    const row = (await post(0, base() + '/recurring', rule(amount)).expect(201))
      .body;
    await scheduler();
    return prisma.recurringExpenseDraft.findFirstOrThrow({
      where: { ruleId: row.id },
    });
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
    const password = 'Roomora-' + randomUUID(),
      passwordHash = await app.get(PasswordService).hash(password);
    for (let i = 0; i < 4; i++) {
      const id = randomUUID(),
        email = `phase8-${id}@example.test`;
      ids.push(id);
      await prisma.user.create({
        data: {
          id,
          email,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: `Thành viên ${i}` } },
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
      await post(0, '/api/v1/houses', { name: 'Nhà thử Phase 8' }).expect(201)
    ).body.id;
    otherHouseId = (
      await post(3, '/api/v1/houses', { name: 'Nhà khác' }).expect(201)
    ).body.id;
    for (const userId of [ids[1], ids[2]]) {
      await prisma.houseMember.create({ data: { houseId, userId } });
      await prisma.houseParticipant.create({
        data: { houseId, id: userId, userId, displayName: 'Thành viên' },
      });
    }
    guestId = (
      await post(0, expensePath() + '/participants', {
        displayName: 'Người ở cùng ngoài app',
      }).expect(201)
    ).body.id;
  }, 30000);
  async function clear() {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.houseActivity.deleteMany({ where: { houseId } });
    await prisma.recurringExpenseDraft.deleteMany({
      where: { rule: { houseId } },
    });
    await prisma.recurringExpense.deleteMany({ where: { houseId } });
    await prisma.repaymentPromise.deleteMany({ where: { houseId } });
    await prisma.debtReminder.deleteMany({ where: { houseId } });
    await prisma.expenseAdjustment.deleteMany({
      where: { expense: { houseId } },
    });
    await prisma.debtPayment.deleteMany({ where: { houseId } });
    await prisma.expense.deleteMany({ where: { houseId } });
    await prisma.houseMember.updateMany({
      where: { houseId },
      data: { leftAt: null },
    });
    await prisma.houseParticipant.updateMany({
      where: { houseId },
      data: { leftAt: null },
    });
    await prisma.house.update({
      where: { id: houseId },
      data: { closedAt: null },
    });
  }
  beforeEach(clear);
  afterAll(async () => {
    if (prisma && houseId) {
      await clear();
      await prisma.house.deleteMany({
        where: { id: { in: [houseId, otherHouseId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('requires authentication, house membership, and origin for writes', async () => {
    await request(app.getHttpServer())
      .get(base() + '/chores')
      .expect(401);
    for (const suffix of [
      '/chores',
      '/shopping',
      '/recurring',
      '/drafts',
      '/reports?month=' + month,
      '/reports/export?month=' + month,
      '/reports/pdf?month=' + month,
    ])
      await agents[3].get(base() + suffix).expect(404);
    await post(3, base() + '/chores', chore()).expect(404);
    await agents[0]
      .post(base() + '/chores')
      .send(chore())
      .expect(403);
  });
  it('validates assignment, calendar dates, quantity limits, and unknown fields', async () => {
    await post(0, base() + '/chores', { ...chore(), assigneeId: null }).expect(
      400,
    );
    await post(0, base() + '/chores', {
      ...chore(),
      dueOn: '2026-02-30',
    }).expect(400);
    await post(0, base() + '/shopping', {
      ...chore(),
      quantity: 'x'.repeat(101),
    }).expect(400);
    await post(0, base() + '/chores', { ...chore(), admin: true }).expect(400);
    await post(0, base() + '/chores', {
      ...chore(),
      assigneeId: ids[3],
    }).expect(400);
  });
  it('deduplicates concurrent creates and rejects changed retry payloads', async () => {
    const body = chore(),
      rows = await Promise.all([
        post(0, base() + '/chores', body).expect(201),
        post(0, base() + '/chores', body).expect(201),
      ]);
    expect(rows[0].body.id).toBe(rows[1].body.id);
    await post(0, base() + '/chores', { ...body, title: 'Khác' }).expect(409);
    expect(await prisma.houseActivity.count({ where: { houseId } })).toBe(1);
    expect(rows[0].body).not.toHaveProperty('contentHash');
    expect(
      await prisma.notification.count({
        where: { userId: ids[1], title: 'Việc nhà: Dọn bếp' },
      }),
    ).toBe(1);
  });
  it('allows the assignee to finish, protects editing, and rejects stale versions', async () => {
    const body = chore(),
      row = (await post(0, base() + '/chores', body).expect(201)).body;
    await patch(2, base() + '/chores/' + row.id, {
      ...body,
      version: 1,
    }).expect(403);
    await post(2, base() + `/chores/${row.id}/status`, {
      version: 1,
      status: 'DONE',
    }).expect(403);
    const updated = (
      await patch(0, base() + '/chores/' + row.id, {
        ...body,
        title: 'Dọn bếp kỹ',
        version: 1,
      }).expect(200)
    ).body;
    await post(1, base() + `/chores/${row.id}/status`, {
      version: 1,
      status: 'DONE',
    }).expect(409);
    const done = (
      await post(1, base() + `/chores/${row.id}/status`, {
        version: updated.version,
        status: 'DONE',
      }).expect(201)
    ).body;
    expect(done.completedById).toBe(ids[1]);
    expect(done.completedAt).toBeTruthy();
    await patch(0, base() + '/chores/' + row.id, {
      ...body,
      version: done.version,
    }).expect(409);
  });
  it('serializes conflicting edits so only one version wins', async () => {
    const body = chore(),
      row = (await post(0, base() + '/chores', body).expect(201)).body;
    const results = await Promise.all(
      ['A', 'B'].map((title) =>
        patch(0, base() + '/chores/' + row.id, { ...body, title, version: 1 }),
      ),
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
  });
  it('supports cancel, reopen, pagination, and separates shopping from chores', async () => {
    const row = (await post(0, base() + '/chores', chore()).expect(201)).body;
    await post(0, base() + `/chores/${row.id}/status`, {
      version: 1,
      status: 'CANCELLED',
    }).expect(201);
    await post(1, base() + `/chores/${row.id}/status`, {
      version: 2,
      status: 'OPEN',
    }).expect(403);
    await post(0, base() + `/chores/${row.id}/status`, {
      version: 2,
      status: 'OPEN',
    }).expect(201);
    await post(0, base() + '/chores', chore()).expect(201);
    const list = (
      await agents[0]
        .get(base() + '/chores?limit=1&page=2&status=OPEN')
        .expect(200)
    ).body;
    expect(list).toMatchObject({ total: 2, pages: 2, page: 2 });
    expect(list.items).toHaveLength(1);
    await post(0, base() + `/shopping/${row.id}/status`, {
      version: 3,
      status: 'DONE',
    }).expect(404);
    expect(
      (await agents[0].get(base() + '/shopping').expect(200)).body.total,
    ).toBe(0);
  });
  it('supports people outside the app and records completion manually without granting access', async () => {
    const row = (
      await post(0, base() + '/chores', {
        ...chore(),
        assigneeId: guestId,
      }).expect(201)
    ).body;
    expect(row.assignee.isGuest).toBe(true);
    await post(1, base() + `/chores/${row.id}/status`, {
      version: 1,
      status: 'DONE',
    }).expect(403);
    expect(
      (
        await post(0, base() + `/chores/${row.id}/status`, {
          version: 1,
          status: 'DONE',
        }).expect(201)
      ).body.completedById,
    ).toBe(ids[0]);
    expect(
      await prisma.notification.count({
        where: { userId: ids[0], title: 'Việc nhà: Dọn bếp' },
      }),
    ).toBe(1);
  });
  it('marks shopping bought without creating expenses or debt', async () => {
    const row = (
      await post(1, base() + '/shopping', {
        clientId: randomUUID(),
        title: 'Nước rửa chén',
        quantity: '2 chai',
      }).expect(201)
    ).body;
    await post(2, base() + `/shopping/${row.id}/status`, {
      version: 1,
      status: 'DONE',
    }).expect(201);
    expect(await prisma.expense.count({ where: { houseId } })).toBe(0);
  });
  it('revokes household access when leaving while preserving existing data', async () => {
    const row = (await post(0, base() + '/chores', chore()).expect(201)).body;
    await post(1, `/api/v1/houses/${houseId}/leave`).expect(201);
    await agents[1].get(base() + '/chores').expect(404);
    await post(1, base() + `/chores/${row.id}/status`, {
      version: 1,
      status: 'DONE',
    }).expect(404);
    await post(0, base() + '/chores', chore()).expect(400);
    expect(await prisma.houseActivity.count({ where: { houseId } })).toBe(1);
  });
  it('validates recurring rule amounts, dates, and active participant lists', async () => {
    await post(0, base() + '/recurring', rule(0)).expect(400);
    const { amount: _amount, ...missing } = rule();
    await post(0, base() + '/recurring', missing).expect(400);
    await post(0, base() + '/recurring', {
      ...rule(),
      participantIds: [ids[0], ids[0]],
    }).expect(400);
    await post(0, base() + '/recurring', {
      ...rule(),
      participantIds: [ids[3]],
    }).expect(400);
    await post(0, base() + '/recurring', {
      ...rule(),
      firstOn: '2000-01-01',
      dayOfMonth: 1,
    }).expect(400);
    await post(0, base() + '/recurring', { ...rule(), dayOfMonth: 32 }).expect(
      400,
    );
  });
  it('deduplicates rules and permits only creator/owner to pause or edit', async () => {
    const body = rule(),
      row = (await post(1, base() + '/recurring', body).expect(201)).body;
    expect(
      (await post(1, base() + '/recurring', body).expect(201)).body.id,
    ).toBe(row.id);
    await post(1, base() + '/recurring', { ...body, amount: 2000 }).expect(409);
    await post(2, base() + `/recurring/${row.id}/enabled`, {
      version: 1,
      enabled: false,
    }).expect(403);
    await patch(2, base() + '/recurring/' + row.id, {
      ...body,
      version: 1,
    }).expect(403);
    await post(0, base() + `/recurring/${row.id}/enabled`, {
      version: 1,
      enabled: false,
    }).expect(201);
    await scheduler();
    expect(
      await prisma.recurringExpenseDraft.count({ where: { ruleId: row.id } }),
    ).toBe(0);
    await post(1, base() + `/recurring/${row.id}/enabled`, {
      version: 2,
      enabled: true,
    }).expect(201);
    await scheduler();
    expect(
      await prisma.recurringExpenseDraft.count({ where: { ruleId: row.id } }),
    ).toBe(1);
  });
  it('creates only drafts and one notification across two scheduler instances', async () => {
    const row = (await post(0, base() + '/recurring', rule()).expect(201)).body;
    const second = new RecurringSchedulerService(
      prisma,
      app.get(HouseAccessService),
      app.get(HouseholdAccessService),
      app.get(ConfigService),
    );
    await Promise.all([scheduler(), second.run(new Date(), houseId)]);
    await scheduler();
    expect(
      await prisma.recurringExpenseDraft.count({ where: { ruleId: row.id } }),
    ).toBe(1);
    expect(await prisma.expense.count({ where: { houseId } })).toBe(0);
    expect(
      await prisma.notification.count({
        where: {
          userId: ids[1],
          title: { startsWith: 'Cần xác nhận khoản định kỳ:' },
        },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.recurringExpense.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).nextOn.getTime(),
    ).toBeGreaterThan(new Date(today).getTime());
  });
  it('catches up bounded monthly periods after downtime without duplicated drafts', async () => {
    const row = (await post(0, base() + '/recurring', rule()).expect(201)).body;
    const past = new Date(today);
    past.setUTCMonth(past.getUTCMonth() - 3, 1);
    await prisma.recurringExpense.update({
      where: { id: row.id },
      data: { nextOn: past, dayOfMonth: 1 },
    });
    await scheduler();
    await scheduler();
    expect(
      await prisma.recurringExpenseDraft.count({ where: { ruleId: row.id } }),
    ).toBe(4);
    expect(await prisma.expense.count({ where: { houseId } })).toBe(0);
  });
  it('keeps generated snapshots unchanged after rule edits', async () => {
    const body = rule(),
      row = (await post(0, base() + '/recurring', body).expect(201)).body;
    await scheduler();
    const current = await prisma.recurringExpense.findUniqueOrThrow({
      where: { id: row.id },
    });
    await patch(0, base() + '/recurring/' + row.id, {
      ...body,
      title: 'Quy tắc mới',
      amount: 5000,
      version: current.version,
    }).expect(200);
    expect(
      (
        await prisma.recurringExpenseDraft.findFirstOrThrow({
          where: { ruleId: row.id },
        })
      ).amount,
    ).toBe(1001);
    await scheduler();
    expect(
      await prisma.recurringExpenseDraft.count({ where: { ruleId: row.id } }),
    ).toBe(1);
  });
  it('requires permission and explicitly confirms a variable bill with exact integer splits', async () => {
    const row = await draft(null);
    await post(2, base() + `/drafts/${row.id}/confirm`, confirmation()).expect(
      403,
    );
    await post(1, base() + `/drafts/${row.id}/confirm`, {
      ...confirmation(),
      amount: 1.5,
    }).expect(400);
    const expense = (
      await post(
        1,
        base() + `/drafts/${row.id}/confirm`,
        confirmation(),
      ).expect(201)
    ).body;
    expect(expense.amount).toBe(1001);
    expect(
      expense.splits.map((s: { amount: number }) => s.amount).sort(),
    ).toEqual([500, 501]);
    expect(
      (
        await prisma.recurringExpenseDraft.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).expenseId,
    ).toBe(expense.id);
    expect(
      await prisma.expenseAdjustment.count({
        where: { expenseId: expense.id, action: 'CREATE' },
      }),
    ).toBe(1);
  });
  it('confirms exactly once under simultaneous requests from different authorized users', async () => {
    const row = await draft(),
      body = confirmation();
    const results = await Promise.all([
      post(0, base() + `/drafts/${row.id}/confirm`, body).expect(201),
      post(1, base() + `/drafts/${row.id}/confirm`, body).expect(201),
    ]);
    expect(results[0].body.id).toBe(results[1].body.id);
    expect(await prisma.expense.count({ where: { houseId } })).toBe(1);
    await post(0, base() + `/drafts/${row.id}/confirm`, {
      ...body,
      amount: 2000,
    }).expect(409);
  });
  it('rejects outdated draft versions and skipped confirmations without ledger writes', async () => {
    const row = await draft();
    await post(0, base() + `/drafts/${row.id}/confirm`, {
      ...confirmation(),
      version: 99,
    }).expect(409);
    await post(0, base() + `/drafts/${row.id}/skip`, { version: 1 }).expect(
      201,
    );
    await post(0, base() + `/drafts/${row.id}/confirm`, confirmation()).expect(
      409,
    );
    await scheduler();
    expect(await prisma.expense.count({ where: { houseId } })).toBe(0);
  });
  it('requires a fresh participant review when someone leaves after draft generation', async () => {
    const row = await draft();
    await post(1, `/api/v1/houses/${houseId}/leave`).expect(201);
    await post(0, base() + `/drafts/${row.id}/confirm`, confirmation()).expect(
      400,
    );
    expect(
      (
        await prisma.recurringExpenseDraft.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).status,
    ).toBe('PENDING');
    await post(0, base() + `/drafts/${row.id}/confirm`, {
      ...confirmation(),
      payerId: ids[0],
      participantIds: [ids[0], ids[2]],
    }).expect(201);
  });
  it('returns the confirmed expense to the owner even after its original author leaves', async () => {
    const row = await draft(),
      body = confirmation();
    const expense = (
      await post(1, base() + `/drafts/${row.id}/confirm`, body).expect(201)
    ).body;
    await post(1, `/api/v1/houses/${houseId}/leave`).expect(201);
    const retry = (
      await post(0, base() + `/drafts/${row.id}/confirm`, body).expect(201)
    ).body;
    expect(retry.id).toBe(expense.id);
    expect(await prisma.expense.count({ where: { houseId } })).toBe(1);
  });
  it('uses UTC+7 calendar dates for scheduled drafts', async () => {
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const row = (
      await post(0, base() + '/recurring', {
        ...rule(),
        firstOn: tomorrow.toISOString().slice(0, 10),
        dayOfMonth: tomorrow.getUTCDate(),
      }).expect(201)
    ).body;
    await app
      .get(RecurringSchedulerService)
      .run(new Date(`${today}T16:59:59Z`), houseId);
    expect(
      await prisma.recurringExpenseDraft.count({ where: { ruleId: row.id } }),
    ).toBe(0);
    await app
      .get(RecurringSchedulerService)
      .run(new Date(`${today}T17:00:00Z`), houseId);
    expect(
      await prisma.recurringExpenseDraft.count({ where: { ruleId: row.id } }),
    ).toBe(1);
  });
  it('skips elapsed paused periods when reactivating instead of catching them up', async () => {
    const row = (await post(0, base() + '/recurring', rule()).expect(201)).body;
    await post(0, base() + `/recurring/${row.id}/enabled`, {
      version: 1,
      enabled: false,
    }).expect(201);
    const past = new Date(today);
    past.setUTCMonth(past.getUTCMonth() - 3, 1);
    await prisma.recurringExpense.update({
      where: { id: row.id },
      data: { nextOn: past, dayOfMonth: 1 },
    });
    await post(0, base() + `/recurring/${row.id}/enabled`, {
      version: 2,
      enabled: true,
    }).expect(201);
    await scheduler();
    const pending = await prisma.recurringExpenseDraft.findMany({
      where: { ruleId: row.id },
    });
    expect(pending.length).toBeLessThanOrEqual(1);
    expect(pending.every((item) => item.dueOn >= new Date(today))).toBe(true);
  });
  it('rolls back confirmation when a payment is pending', async () => {
    const row = await draft();
    await post(0, expensePath(), {
      title: 'Trước đó',
      clientId: randomUUID(),
      amount: 1000,
      payerId: ids[0],
      splitMode: 'EQUAL',
      participantIds: [ids[0], ids[1]],
    }).expect(201);
    await post(1, expensePath() + '/payments', {
      clientId: randomUUID(),
      recipientId: ids[0],
      amount: 500,
      method: 'CASH',
    }).expect(201);
    await post(0, base() + `/drafts/${row.id}/confirm`, confirmation()).expect(
      409,
    );
    expect(
      (
        await prisma.recurringExpenseDraft.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).status,
    ).toBe('PENDING');
    expect(await prisma.expense.count({ where: { houseId } })).toBe(1);
  });
  it('routes reminders for people outside the app through the current owner', async () => {
    const body = {
      ...rule(),
      payerId: guestId,
      participantIds: [ids[0], guestId],
    };
    const row = (await post(0, base() + '/recurring', body).expect(201)).body;
    await scheduler();
    expect(
      await prisma.notification.count({
        where: {
          userId: ids[0],
          title: { startsWith: 'Cần xác nhận khoản định kỳ:' },
        },
      }),
    ).toBe(1);
    const pending = await prisma.recurringExpenseDraft.findFirstOrThrow({
      where: { ruleId: row.id },
    });
    await post(0, base() + `/drafts/${pending.id}/confirm`, {
      ...confirmation(),
      payerId: guestId,
      participantIds: [ids[0], guestId],
    }).expect(201);
  });
  it('stops generation for closed houses', async () => {
    const row = (await post(0, base() + '/recurring', rule()).expect(201)).body;
    await prisma.house.update({
      where: { id: houseId },
      data: { closedAt: new Date() },
    });
    await scheduler();
    expect(
      await prisma.recurringExpenseDraft.count({ where: { ruleId: row.id } }),
    ).toBe(0);
    await agents[0].get(base() + '/reports?month=' + month).expect(404);
  });
  it('reports by spent date and category, excludes cancellations and drafts, and keeps whole-ledger debt separate', async () => {
    const input = {
      title: 'Điện',
      clientId: randomUUID(),
      amount: 1001,
      category: 'ELECTRICITY',
      spentOn: today,
      payerId: ids[0],
      splitMode: 'EQUAL',
      participantIds: [ids[0], ids[1]],
    };
    await post(0, expensePath(), input).expect(201);
    await post(0, expensePath(), {
      ...input,
      clientId: randomUUID(),
      amount: 200,
      category: 'WATER',
      spentOn: '2000-01-01',
    }).expect(201);
    const canceled = (
      await post(0, expensePath(), {
        ...input,
        clientId: randomUUID(),
        amount: 9999,
      }).expect(201)
    ).body;
    await post(0, expensePath() + `/${canceled.id}/cancel`, {
      version: canceled.version,
      reason: 'Ghi nhầm khoản',
    }).expect(201);
    await draft();
    const report = (
      await agents[1].get(base() + '/reports?month=' + month).expect(200)
    ).body;
    expect(report).toMatchObject({ total: 1001, count: 1, month });
    expect(
      report.categories.find(
        (r: { category: string }) => r.category === 'ELECTRICITY',
      ).amount,
    ).toBe(1001);
    expect(
      report.members.reduce(
        (sum: number, row: { owed: number }) => sum + row.owed,
        0,
      ),
    ).toBe(1001);
    expect(
      report.ledger.balances.reduce(
        (sum: number, row: { paid: number }) => sum + row.paid,
        0,
      ),
    ).toBe(1201);
    const empty = (
      await agents[0].get(base() + '/reports?month=2001-01').expect(200)
    ).body;
    expect(empty.total).toBe(0);
    expect(empty.ledger.transfers.length).toBeGreaterThan(0);
  });
  it('exports a private UTF-8 spreadsheet with safe formulas and preserves historical expense fields on old API edits', async () => {
    const input = {
      title: '=SUM(1,2)',
      clientId: randomUUID(),
      amount: 1000,
      category: 'WATER',
      spentOn: '2000-01-01',
      payerId: ids[0],
      splitMode: 'EQUAL',
      participantIds: [ids[0], ids[1]],
    };
    const row = (await post(0, expensePath(), input).expect(201)).body;
    const { category: _category, spentOn: _spentOn, ...legacy } = input;
    const updated = (
      await patch(0, expensePath() + '/' + row.id, {
        ...legacy,
        version: row.version,
        reason: 'Sửa nội dung',
      }).expect(200)
    ).body;
    expect(updated.category).toBe('WATER');
    expect(updated.spentOn.slice(0, 10)).toBe('2000-01-01');
    const csv = await agents[0]
      .get(base() + '/reports/export?month=2000-01')
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['cache-control']).toBe('private, no-store');
    expect(csv.headers['content-disposition']).toContain('Roomora-2000-01.csv');
    expect(csv.text).toContain('"\'=SUM(1,2)"');
    expect(csv.text).toContain('CÔNG NỢ TOÀN BỘ SỔ');
  });
  it('counts all activity statuses independently of filtering and pagination', async () => {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await post(0, base() + '/chores', {
      ...chore(),
      dueOn: yesterday.toISOString().slice(0, 10),
    }).expect(201);
    await post(0, base() + '/chores', chore()).expect(201);
    const done = (await post(0, base() + '/chores', chore()).expect(201)).body;
    await post(0, base() + `/chores/${done.id}/status`, {
      version: 1,
      status: 'DONE',
    }).expect(201);
    await post(0, base() + '/shopping', {
      clientId: randomUUID(),
      title: 'Khác loại',
    }).expect(201);
    const result = (
      await agents[0].get(base() + '/chores?status=OPEN&limit=1').expect(200)
    ).body;
    expect(result.items).toHaveLength(1);
    expect(result).toMatchObject({
      total: 2,
      summary: { open: 2, done: 1, cancelled: 0, overdue: 1 },
    });
  });
  it('downloads a private multipage Vietnamese PDF with every expense and correct totals', async () => {
    for (let i = 0; i < 45; i++) {
      await post(0, expensePath(), {
        title: `Khoản chi ${i + 1} · Tiền điện và đồ dùng sinh hoạt chung có nội dung dài để kiểm tra xuống dòng và phân trang`,
        clientId: randomUUID(),
        amount: 1001,
        category: 'ELECTRICITY',
        spentOn: today,
        payerId: ids[0],
        splitMode: 'EQUAL',
        participantIds: [ids[0], ids[1]],
      }).expect(201);
    }
    const pdf = await agents[1]
      .get(base() + '/reports/pdf?month=' + month)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
        res.on('error', callback);
      })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain(
      `Roomora-${month}.pdf`,
    );
    expect(pdf.headers['cache-control']).toBe('private, no-store');
    expect(pdf.headers['x-content-type-options']).toBe('nosniff');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    const task = getDocument({
      data: new Uint8Array(pdf.body),
      useSystemFonts: false,
    });
    const document = await task.promise;
    try {
      expect(document.numPages).toBeGreaterThan(2);
      const pages: string[] = [];
      for (let i = 1; i <= document.numPages; i++) {
        const page = await document.getPage(i);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' '),
        );
      }
      const text = pages.join(' ').replace(/\s+/g, ' ');
      expect(text).toContain('Bảng chi phí & quyết toán');
      expect(text).toContain('45.045 đ');
      expect(text).toContain('45 khoản chi');
      for (let i = 1; i <= 45; i++) expect(text).toContain(`Khoản chi ${i} ·`);
      expect(text).toContain('Công nợ toàn bộ sổ tại thời điểm xuất');
      expect(text).toContain('Chưa khấu trừ thanh toán đang chờ xác nhận');
      expect(
        pages.every((page, i) =>
          page.includes(`Trang ${i + 1}/${document.numPages}`),
        ),
      ).toBe(true);
      expect(
        pages.filter((page) => page.includes('Khoản chi / Danh mục')).length,
      ).toBeGreaterThan(1);
    } finally {
      await task.destroy();
    }
  }, 15000);
  it('validates PDF month and requires a session before exporting', async () => {
    await request(app.getHttpServer())
      .get(base() + '/reports/pdf?month=' + month)
      .expect(401);
    await agents[0].get(base() + '/reports/pdf?month=1999-12').expect(400);
    await agents[0].get(base() + '/reports/pdf?month=2026-13').expect(400);
    await agents[0].get(base() + '/reports/pdf?month=invalid').expect(400);
    const pdf = await agents[0]
      .get(base() + '/reports/pdf?month=2001-01')
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });
});
