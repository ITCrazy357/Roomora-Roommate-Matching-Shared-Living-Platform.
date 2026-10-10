import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { CostSharingSchedulerService } from '../src/modules/cost-sharing/cost-sharing-scheduler.service.js';
import {
  currentSharingMonth,
  type SharingPeriod,
} from '../src/modules/cost-sharing/cost-sharing-types.js';

describe('Monthly cost sharing (real HTTP and PostgreSQL)', () => {
  let app: INestApplication, prisma: PrismaService, houseId: string;
  const ids: string[] = [],
    agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000',
    month = currentSharingMonth(new Date()),
    today = month + '-01';
  const deadline = () => new Date(Date.now() + 3600000).toISOString();
  const base = () => `/api/v1/houses/${houseId}/cost-sharing`;
  const expenses = () => `/api/v1/houses/${houseId}/expenses`;
  const post = (index: number, path: string, body: object) =>
    agents[index].post(path).set('Origin', origin).send(body);
  const setting = (category = 'ELECTRICITY', enabled = true, day = 31) =>
    agents[0]
      .put(base() + '/settings/' + category)
      .set('Origin', origin)
      .send({ enabled, deadlineDay: day });
  const vote = (
    index: number,
    row: SharingPeriod,
    choice = 'EQUAL',
    version = 0,
  ) =>
    post(index, base() + `/periods/${row.id}/votes`, {
      roundId: row.rounds[0].id,
      choice,
      version,
    });
  const proposal = (row: SharingPeriod, weights = [5000, 3000, 2000]) => ({
    roundId: row.rounds[0].id,
    mode: 'WEIGHTED',
    reason: 'Ít sử dụng điện nước',
    shares: ids.slice(0, 3).map((participantId, index) => ({
      participantId,
      basisPoints: weights[index],
    })),
  });
  async function period(category = 'ELECTRICITY') {
    return (
      await agents[0].get(base() + `?month=${month}`).expect(200)
    ).body.periods.find(
      (row: SharingPeriod) =>
        row.kind === 'MONTHLY' && row.category === category,
    ) as SharingPeriod;
  }
  async function open(category = 'ELECTRICITY') {
    await setting(category).expect(200);
    return period(category);
  }
  async function agree(row: SharingPeriod, choice = 'EQUAL') {
    for (let i = 0; i < 3; i++)
      row = (await vote(i, row, choice).expect(201)).body;
    return row;
  }
  const input = (category = 'ELECTRICITY', spentOn = today) => ({
    clientId: randomUUID(),
    title: 'Điện thực tế',
    amount: 1001,
    category,
    spentOn,
    payerId: ids[0],
    splitMode: 'EQUAL',
    participantIds: [ids[0]],
  });
  async function expire(row: SharingPeriod) {
    await prisma.costSharingPeriod.update({
      where: { id: row.id },
      data: { deadlineAt: new Date(Date.now() - 1000) },
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
        email = `sharing-${id}@example.test`;
      ids.push(id);
      await prisma.user.create({
        data: {
          id,
          email,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: {
            create: {
              displayName: `Người ${i}`,
              avatarUrl: 'https://example.test/avatar.png',
            },
          },
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
      await post(0, '/api/v1/houses', { name: 'Nhà thử đồng thuận' }).expect(
        201,
      )
    ).body.id;
    for (const userId of ids.slice(1, 3)) {
      await prisma.houseMember.create({ data: { houseId, userId } });
      await prisma.houseParticipant.create({
        data: { houseId, id: userId, userId, displayName: 'Người dùng' },
      });
    }
  }, 30000);
  async function clear() {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.expenseAdjustment.deleteMany({
      where: { expense: { houseId } },
    });
    await prisma.expense.deleteMany({ where: { houseId } });
    await prisma.costSharingPeriod.deleteMany({ where: { houseId } });
    await prisma.costSharingSetting.deleteMany({ where: { houseId } });
    await prisma.houseMember.updateMany({
      where: { houseId },
      data: { leftAt: null },
    });
    await prisma.houseParticipant.updateMany({
      where: { houseId },
      data: { leftAt: null },
    });
  }
  beforeEach(clear);
  afterAll(async () => {
    if (prisma && houseId) {
      await clear();
      await prisma.house.delete({ where: { id: houseId } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('enforces authentication, membership, owner rights and origin', async () => {
    await request(app.getHttpServer())
      .get(base() + `?month=${month}`)
      .expect(401);
    await agents[3].get(base() + `?month=${month}`).expect(404);
    await agents[1]
      .put(base() + '/settings/ELECTRICITY')
      .set('Origin', origin)
      .send({ enabled: true, deadlineDay: 7 })
      .expect(403);
    const row = await open();
    await vote(3, row).expect(404);
    await agents[0]
      .post(base() + `/periods/${row.id}/votes`)
      .send({ roundId: row.rounds[0].id, choice: 'EQUAL', version: 0 })
      .expect(403);
    await agents[3].get(base() + `/periods/${row.id}`).expect(404);
  });
  it('opens exactly one monthly period and uses day 7 in Vietnamese time', async () => {
    await Promise.all([
      setting('INTERNET', true, 7).expect(200),
      agents[0]
        .put(base() + '/settings/INTERNET')
        .set('Origin', origin)
        .send({ enabled: true })
        .expect(200),
    ]);
    const row = await period('INTERNET');
    expect(new Date(row.deadlineAt).toISOString()).toBe(
      month + '-07T16:59:59.999Z',
    );
    expect(
      await prisma.costSharingPeriod.count({
        where: { houseId, kind: 'MONTHLY', category: 'INTERNET', month },
      }),
    ).toBe(1);
    expect(row.rounds[0].members).toHaveLength(3);
  });
  it('requires all equal preferences and prevents changing an agreed result', async () => {
    let row = await open();
    row = (await vote(0, row).expect(201)).body;
    expect(row.status).toBe('OPEN');
    row = (await vote(1, row).expect(201)).body;
    expect(row.status).toBe('OPEN');
    row = (await vote(2, row).expect(201)).body;
    expect(row.resultMode).toBe('EQUAL');
    await vote(2, row, 'WEIGHTED', 1).expect(409);
    await post(0, base() + `/periods/${row.id}/reopen`, {
      roundId: row.rounds[0].id,
      deadlineAt: deadline(),
    }).expect(409);
  });
  it('shows current profile avatars without changing membership snapshots', async () => {
    const row = await open(),
      url = 'https://example.test/new-avatar.png';
    await prisma.profile.update({
      where: { userId: ids[0] },
      data: { avatarUrl: url },
    });
    const current = await period();
    expect(
      (
        current.rounds[0].members as unknown as {
          userId: string;
          avatarUrl: string;
        }[]
      ).find((member) => member.userId === ids[0])!.avatarUrl,
    ).toBe(url);
    const history = (
      await agents[0].get(base() + `/periods/${row.id}`).expect(200)
    ).body.items[0];
    expect(
      history.members.find(
        (member: { userId: string }) => member.userId === ids[0],
      ).avatarUrl,
    ).toBe(url);
    const snapshot = await prisma.costSharingRound.findUniqueOrThrow({
      where: { id: row.rounds[0].id },
    });
    expect(snapshot.members).toEqual(row.rounds[0].members);
  });
  it('keeps one current vote and all revisions; retry does not duplicate events', async () => {
    const row = await open();
    await vote(0, row).expect(201);
    await vote(0, row).expect(201);
    await vote(0, row, 'WEIGHTED', 1).expect(201);
    await vote(0, row, 'EQUAL', 0).expect(409);
    const history = (
      await agents[1].get(base() + `/periods/${row.id}`).expect(200)
    ).body.items[0];
    expect(history.votes).toHaveLength(1);
    expect(history.votes[0].version).toBe(2);
    expect(history.events.map((e: { choice: string }) => e.choice)).toEqual([
      'EQUAL',
      'WEIGHTED',
    ]);
  });
  it('serializes concurrent updates of the same vote', async () => {
    const row = await open();
    const replies = await Promise.all([
      vote(0, row, 'EQUAL'),
      vote(0, row, 'WEIGHTED'),
    ]);
    expect(replies.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(
      await prisma.costSharingVote.count({
        where: { roundId: row.rounds[0].id },
      }),
    ).toBe(1);
  });
  it('serializes final votes and returns an idempotent final retry', async () => {
    const row = await open();
    await Promise.all([
      vote(0, row).expect(201),
      vote(1, row).expect(201),
      vote(2, row).expect(201),
    ]);
    const final = await period();
    expect(final.status).toBe('AGREED');
    await vote(2, final).expect(201);
    expect(
      await prisma.costSharingVoteEvent.count({
        where: { roundId: row.rounds[0].id },
      }),
    ).toBe(3);
  });
  it('requires a weighted preference before proposing', async () => {
    const row = await open();
    await post(
      0,
      base() + `/periods/${row.id}/proposals`,
      proposal(row),
    ).expect(409);
  });
  it('validates percentages, participant coverage and outsiders', async () => {
    const row = await open();
    await vote(0, row, 'WEIGHTED').expect(201);
    for (const weights of [
      [5000, 3000, 1000],
      [-1, 5000, 5001],
      [5000.1, 2999.9, 2000],
    ])
      await post(
        1,
        base() + `/periods/${row.id}/proposals`,
        proposal(row, weights),
      ).expect(400);
    const wrong = proposal(row);
    wrong.shares[2].participantId = ids[3];
    await post(1, base() + `/periods/${row.id}/proposals`, wrong).expect(400);
    const duplicate = proposal(row);
    duplicate.shares[2].participantId = ids[0];
    await post(1, base() + `/periods/${row.id}/proposals`, duplicate).expect(
      400,
    );
    await post(1, base() + `/periods/${row.id}/proposals`, {
      ...proposal(row),
      shares: proposal(row).shares.slice(0, 2),
    }).expect(400);
  });
  it('rejects, revises and requires new unanimous votes on the same proposal', async () => {
    let row = await open();
    await vote(0, row, 'WEIGHTED').expect(201);
    const old = row.rounds[0].id;
    row = (
      await post(
        1,
        base() + `/periods/${row.id}/proposals`,
        proposal(row),
      ).expect(201)
    ).body;
    await post(2, base() + `/periods/${row.id}/votes`, {
      roundId: old,
      choice: 'EQUAL',
      version: 0,
    }).expect(409);
    await vote(0, row, 'AGREE').expect(201);
    row = (await vote(1, row, 'REJECT').expect(201)).body;
    await vote(2, row, 'AGREE').expect(409);
    row = (
      await post(
        2,
        base() + `/periods/${row.id}/proposals`,
        proposal(row, [4000, 4000, 2000]),
      ).expect(201)
    ).body;
    expect(row.rounds[0].votes).toHaveLength(0);
    row = await agree(row, 'AGREE');
    expect(row.resultMode).toBe('WEIGHTED');
    const history = (
      await agents[0].get(base() + `/periods/${row.id}`).expect(200)
    ).body.items;
    expect(history).toHaveLength(3);
    expect(history[1].status).toBe('REJECTED');
  });
  it('allows zero percent representatives but still needs every member vote', async () => {
    let row = await open();
    await vote(0, row, 'WEIGHTED').expect(201);
    row = (
      await post(
        1,
        base() + `/periods/${row.id}/proposals`,
        proposal(row, [10000, 0, 0]),
      ).expect(201)
    ).body;
    await vote(0, row, 'AGREE').expect(201);
    await vote(1, row, 'AGREE').expect(201);
    expect((await period()).status).toBe('OPEN');
    await vote(2, row, 'AGREE').expect(201);
    const expense = (await post(0, expenses(), input()).expect(201)).body;
    expect(
      expense.splits.find(
        (s: { participantId: string }) => s.participantId === ids[0],
      ).amount,
    ).toBe(1001);
    expect(
      expense.splits.filter((s: { amount: number }) => s.amount === 0),
    ).toHaveLength(2);
  });
  it('blocks unresolved expenses and late votes without an approved default', async () => {
    const row = await open();
    await expire(row);
    expect((await period()).status).toBe('UNRESOLVED');
    await vote(0, row).expect(409);
    const res = await post(0, expenses(), input()).expect(409);
    expect(res.body.code).toBe('SHARING_NOT_AGREED');
    expect(await prisma.expense.count({ where: { houseId } })).toBe(0);
  });
  it('falls back only to a prior unanimously approved default', async () => {
    let row = (
      await post(0, base() + '/defaults', {
        category: 'ELECTRICITY',
        deadlineAt: deadline(),
      }).expect(201)
    ).body;
    row = await agree(row);
    const monthly = await open();
    expect(monthly.fallbackSnapshot.periodId).toBe(row.id);
    await expire(monthly);
    expect((await period()).status).toBe('FALLBACK');
    const expense = (await post(0, expenses(), input()).expect(201)).body;
    expect(expense.sharingSnapshot.source).toBe('FALLBACK');
    expect(expense.splits).toHaveLength(3);
  });
  it('does not use a default approved after opening the monthly period', async () => {
    const row = await open();
    const fallback = (
      await post(0, base() + '/defaults', {
        category: 'ELECTRICITY',
        deadlineAt: deadline(),
      }).expect(201)
    ).body;
    await agree(fallback);
    await expire(row);
    expect((await period()).status).toBe('UNRESOLVED');
  });
  it('expires and replaces a pending default without a uniqueness error', async () => {
    const row = (
      await post(0, base() + '/defaults', {
        category: 'ELECTRICITY',
        deadlineAt: deadline(),
      }).expect(201)
    ).body;
    await expire(row);
    const next = (
      await post(0, base() + '/defaults', {
        category: 'ELECTRICITY',
        deadlineAt: deadline(),
      }).expect(201)
    ).body;
    expect(next.id).not.toBe(row.id);
  });
  it('applies weighted monthly rules rather than client-selected splits', async () => {
    let row = await open();
    await vote(0, row, 'WEIGHTED').expect(201);
    row = (
      await post(
        1,
        base() + `/periods/${row.id}/proposals`,
        proposal(row),
      ).expect(201)
    ).body;
    await agree(row, 'AGREE');
    const body = input(),
      expense = (await post(0, expenses(), body).expect(201)).body;
    expect(expense.sharingPeriodId).toBe(row.id);
    expect(
      expense.splits
        .map((s: { participantId: string; amount: number }) => [
          s.participantId,
          s.amount,
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual(
      [
        [ids[0], 501],
        [ids[1], 300],
        [ids[2], 200],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    const retry = (await post(0, expenses(), body).expect(201)).body;
    expect(retry.id).toBe(expense.id);
    const manual = (await post(0, expenses(), input('OTHER')).expect(201)).body;
    expect(manual.sharingPeriodId).toBeNull();
  });
  it('preserves old manual expenses when enabling the monthly rule', async () => {
    const body = input(),
      old = (await post(0, expenses(), body).expect(201)).body;
    await agree(await open());
    const updated = (
      await agents[0]
        .patch(expenses() + '/' + old.id)
        .set('Origin', origin)
        .send({
          ...body,
          clientId: randomUUID(),
          amount: 1002,
          version: old.version,
          reason: 'Sửa số tiền thực tế',
        })
        .expect(200)
    ).body;
    expect(updated.sharingPeriodId).toBeNull();
    expect(updated.splits).toHaveLength(1);
    expect(updated.splits[0].amount).toBe(1002);
  });
  it('keeps current periods enforced after disabling future automatic periods', async () => {
    await open();
    await setting('ELECTRICITY', false).expect(200);
    await post(0, expenses(), input()).expect(409);
  });
  it('invalidates membership changes and preserves expense snapshots on reopening', async () => {
    const row = await agree(await open()),
      body = input(),
      expense = (await post(0, expenses(), body).expect(201)).body;
    await prisma.houseMember.updateMany({
      where: { houseId, userId: ids[2] },
      data: { leftAt: new Date() },
    });
    await prisma.houseParticipant.update({
      where: { houseId_id: { houseId, id: ids[2] } },
      data: { leftAt: new Date() },
    });
    expect((await period()).membershipChanged).toBe(true);
    await post(0, expenses(), input()).expect(409);
    await vote(2, row).expect(404);
    const next = (
      await post(0, base() + `/periods/${row.id}/reopen`, {
        roundId: row.rounds[0].id,
        deadlineAt: deadline(),
      }).expect(201)
    ).body;
    await vote(0, next).expect(201);
    await vote(1, next).expect(201);
    const original = await prisma.expense.findUniqueOrThrow({
      where: { id: expense.id },
      include: { splits: true },
    });
    expect(original.splits).toHaveLength(3);
    expect(original.sharingSnapshot).toEqual(expense.sharingSnapshot);
    const edited = (
      await agents[0]
        .patch(expenses() + '/' + expense.id)
        .set('Origin', origin)
        .send({
          ...body,
          clientId: randomUUID(),
          amount: 1002,
          version: expense.version,
          reason: 'Sửa giữ quy tắc cũ',
        })
        .expect(200)
    ).body;
    expect(edited.splits).toHaveLength(3);
    expect(edited.sharingSnapshot).toEqual(expense.sharingSnapshot);
  });
  it('matches category and month when explicitly moving an expense', async () => {
    const old = (await post(0, expenses(), input('OTHER')).expect(201)).body;
    await agree(await open());
    const moved = (
      await agents[0]
        .patch(expenses() + '/' + old.id)
        .set('Origin', origin)
        .send({
          ...input(),
          version: old.version,
          reason: 'Chuyển đúng danh mục điện',
        })
        .expect(200)
    ).body;
    expect(moved.sharingPeriodId).not.toBeNull();
    expect(moved.splits).toHaveLength(3);
    const next = new Date(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth() + 1,
        1,
        12,
      ),
      nextMonth = currentSharingMonth(next);
    await post(0, expenses(), input('ELECTRICITY', nextMonth + '-01')).expect(
      409,
    );
    const historical = (
      await post(0, expenses(), input('ELECTRICITY', '2001-01-01')).expect(201)
    ).body;
    expect(historical.sharingPeriodId).toBeNull();
  });
  it('does not reuse a default after membership changes', async () => {
    const fallback = (
      await post(0, base() + '/defaults', {
        category: 'ELECTRICITY',
        deadlineAt: deadline(),
      }).expect(201)
    ).body;
    await agree(fallback);
    await prisma.houseMember.updateMany({
      where: { houseId, userId: ids[2] },
      data: { leftAt: new Date() },
    });
    const row = await open();
    expect(row.fallbackSnapshot).toBeNull();
    await expire(row);
    expect((await period()).status).toBe('UNRESOLVED');
  });
  it('does not reuse votes after the same person leaves and rejoins', async () => {
    const row = await open();
    await vote(0, row).expect(201);
    await prisma.houseMember.updateMany({
      where: { houseId, userId: ids[1] },
      data: { joinedAt: new Date() },
    });
    await vote(1, row).expect(409);
    const current = await period();
    expect(current.status).toBe('NEEDS_REVIEW');
    const next = (
      await post(0, base() + `/periods/${row.id}/reopen`, {
        roundId: row.rounds[0].id,
        deadlineAt: deadline(),
      }).expect(201)
    ).body;
    expect(next.rounds[0].votes).toHaveLength(0);
  });
  it('does not reopen an old default while another default is open', async () => {
    const first = (
      await post(0, base() + '/defaults', {
        category: 'ELECTRICITY',
        deadlineAt: deadline(),
      }).expect(201)
    ).body;
    await expire(first);
    await post(0, base() + '/defaults', {
      category: 'ELECTRICITY',
      deadlineAt: deadline(),
    }).expect(201);
    const res = await post(0, base() + `/periods/${first.id}/reopen`, {
      roundId: first.rounds[0].id,
      deadlineAt: deadline(),
    }).expect(409);
    expect(res.body.code).toBe('SHARING_DEFAULT_ALREADY_OPEN');
  });
  it('opens next month once from the scheduler and does not change old expenses', async () => {
    await agree(await open());
    const expense = (await post(0, expenses(), input()).expect(201)).body;
    const future = new Date(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth() + 1,
      1,
      12,
    );
    const nextMonth = currentSharingMonth(future);
    await app.get(CostSharingSchedulerService).run(future, houseId);
    await app.get(CostSharingSchedulerService).run(future, houseId);
    expect(
      await prisma.costSharingPeriod.count({
        where: { houseId, month: nextMonth, kind: 'MONTHLY' },
      }),
    ).toBe(1);
    const original = await prisma.expense.findUniqueOrThrow({
      where: { id: expense.id },
    });
    expect(original.sharingSnapshot).toEqual(expense.sharingSnapshot);
  }, 15000);
});
