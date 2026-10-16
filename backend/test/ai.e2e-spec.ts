import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { declareIdentity } from './helpers/identity.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { AiCreditsService } from '../src/modules/ai-credits/ai-credits.service.js';
import { AiProviderService } from '../src/modules/ai/ai-provider.service.js';
import { AiUsageService } from '../src/modules/ai-usage/ai-usage.service.js';

describe('Phase 11 proposals, privacy and quota (HTTP/PostgreSQL)', () => {
  let app: INestApplication, prisma: PrismaService;
  let member: ReturnType<typeof request.agent>,
    other: ReturnType<typeof request.agent>,
    admin: ReturnType<typeof request.agent>;
  const ids: string[] = [],
    prefix = `ai-${randomUUID()}`,
    password = `Roomora-${randomUUID()}`;
  const origin = 'http://localhost:3000',
    base = '/api/v1/ai';
  let houseId: string;
  let modelResult: unknown = { description: 'Phòng theo thông tin đã nhập.' };
  let captured: Record<string, unknown>;
  let providerFailure = false;
  const fetchOriginal = globalThis.fetch;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiProviderService)
      .useFactory({
        inject: [AiCreditsService, AiUsageService],
        factory: (db: AiCreditsService, costs: AiUsageService) =>
          new AiProviderService(
            new ConfigService({
              OPENAI_API_KEY: 'mock-only',
            }),
            db,
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
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const hash = await app.get(PasswordService).hash(password);
    const agents = [];
    for (const role of ['member', 'other', 'admin']) {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-${role}@example.test`,
          passwordHash: hash,
          role: role === 'admin' ? 'ADMIN' : 'USER',
          emailVerifiedAt: new Date(),
          profile: {
            create: {
              displayName: role,
              visibility: 'PUBLIC',
              onboardingCompletedAt: new Date(),
              budgetMin: 2000000,
              budgetMax: 3000000,
              sleepSchedule: 'EARLY_BIRD',
            },
          },
        },
      });
      ids.push(user.id);
      if (user.role === 'USER') await declareIdentity(app, user.id);
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ email: user.email, password })
        .expect(200);
      agents.push(agent);
    }
    [member, other, admin] = agents;
    const house = await member
      .post('/api/v1/houses')
      .set('Origin', origin)
      .send({ name: prefix })
      .expect(201);
    houseId = house.body.id;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        if (String(url) !== 'https://api.openai.com/v1/responses')
          return fetchOriginal(url, init);
        captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
        if (providerFailure) throw new Error('simulated outage');
        return new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                content: [
                  { type: 'output_text', text: JSON.stringify(modelResult) },
                ],
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (prisma && ids.length) {
      await prisma.house.deleteMany({ where: { id: houseId } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });
  beforeEach(async () => {
    if (prisma) {
      await prisma.aiHouseSummary.deleteMany({
        where: { userId: { in: ids } },
      });
      for (const userId of ids)
        await prisma.aiWallet.upsert({
          where: { userId },
          create: { userId },
          update: { freeUsed: 0 },
        });
    }
  });
  it('requires authentication and excludes ADMIN from all assistance', async () => {
    await request(app.getHttpServer()).get(`${base}/usage`).expect(401);
    await admin.get(`${base}/usage`).expect(403);
    await admin
      .post(`${base}/listing-description`)
      .set('Origin', origin)
      .send({ title: 'A room' })
      .expect(403);
  });
  it('rejects untrusted origin and unexpected request fields', async () => {
    await member
      .post(`${base}/search-filters`)
      .set('Origin', 'https://untrusted.test')
      .send({ query: 'Tìm phòng' })
      .expect(403);
    await member
      .post(`${base}/search-filters`)
      .set('Origin', origin)
      .send({ query: 'Tìm phòng', userId: ids[1] })
      .expect(400);
  });
  it.each(['ROOMMATE', 'ROOM_WANTED', 'ROOM_RENTAL'])(
    'proposes a description for %s without saving or exposing private location',
    async (type) => {
      const before = await prisma.listing.count({ where: { ownerId: ids[0] } });
      modelResult = { description: 'Phòng theo thông tin đã nhập.' };
      const reply = await member
        .post(`${base}/listing-description`)
        .set('Origin', origin)
        .send({
          type,
          hasRoom: false,
          title: 'Nhu cầu phòng',
          privateAddress: 'private-address',
          latitude: 16.03,
          longitude: 108.03,
        })
        .expect(200);
      expect(reply.body.description).toBe('Phòng theo thông tin đã nhập.');
      expect(JSON.stringify(captured)).not.toContain('private-address');
      expect(JSON.stringify(captured)).not.toContain('108.03');
      expect(await prisma.listing.count({ where: { ownerId: ids[0] } })).toBe(
        before,
      );
    },
  );
  it('returns filters with unsupported criteria for user review', async () => {
    modelResult = {
      type: 'ROOM_RENTAL',
      provinceCode: '48',
      minRent: null,
      maxRent: 3000000,
      amenities: ['WIFI'],
      unsupported: ['Khoảng cách chưa được lọc.'],
    };
    const reply = await member
      .post(`${base}/search-filters`)
      .set('Origin', origin)
      .send({ query: 'Phòng Đà Nẵng dưới 3 triệu có Wi-Fi gần biển' })
      .expect(200);
    expect(reply.body.filters.maxRent).toBe(3000000);
    expect(reply.body.unsupported).toHaveLength(1);
  });
  it('does not read another house or spend its caller quota', async () => {
    const before = await other.get(`${base}/usage`).expect(200);
    await other
      .post(`${base}/houses/${houseId}/summary`)
      .set('Origin', origin)
      .send({ month: '2026-10' })
      .expect(404);
    await other
      .post(`${base}/receipt-draft`)
      .set('Origin', origin)
      .field('houseId', houseId)
      .attach('receipt', Buffer.from('bad'), 'receipt.png')
      .expect(404);
    expect((await other.get(`${base}/usage`)).body.remaining).toBe(
      before.body.remaining,
    );
  });
  it('validates report month and receipt bytes before calling AI', async () => {
    await member
      .post(`${base}/houses/${houseId}/summary`)
      .set('Origin', origin)
      .send({ month: '2026-13' })
      .expect(400);
    await member
      .post(`${base}/receipt-draft`)
      .set('Origin', origin)
      .field('houseId', houseId)
      .attach('receipt', Buffer.from('bad'), 'receipt.png')
      .expect(400);
  });
  it('reads receipt fields without creating an expense or payment', async () => {
    const image = await sharp({
      create: { width: 30, height: 30, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    modelResult = {
      title: 'Tiền điện',
      amount: 300000,
      category: 'ELECTRICITY',
      spentOn: '2026-10-14',
      warnings: [],
    };
    const reply = await member
      .post(`${base}/receipt-draft`)
      .set('Origin', origin)
      .field('houseId', houseId)
      .attach('receipt', image, 'receipt.png')
      .expect(200);
    expect(reply.body.amount).toBe(300000);
    expect(reply.body).not.toHaveProperty('paidAmount');
    expect(await prisma.expense.count({ where: { houseId } })).toBe(0);
    expect(await prisma.debtPayment.count({ where: { houseId } })).toBe(0);
  });
  it('keeps matching scores authoritative and blocked/private profiles inaccessible', async () => {
    modelResult = { ids: ['budget', 'sleepSchedule'] };
    const reply = await member
      .post(`${base}/people/${ids[1]}/explanation`)
      .set('Origin', origin)
      .send({})
      .expect(200);
    expect(reply.body.score).toBe(100);
    expect(reply.body.assessed).toBe(2);
    await prisma.profile.update({
      where: { userId: ids[1] },
      data: { visibility: 'PRIVATE' },
    });
    await member
      .post(`${base}/people/${ids[1]}/explanation`)
      .set('Origin', origin)
      .send({})
      .expect(404);
    await prisma.profile.update({
      where: { userId: ids[1] },
      data: { visibility: 'PUBLIC' },
    });
    await prisma.userBlock.create({
      data: { blockerId: ids[1], targetId: ids[0] },
    });
    await member
      .post(`${base}/people/${ids[1]}/explanation`)
      .set('Origin', origin)
      .send({})
      .expect(404);
    await prisma.userBlock.deleteMany({ where: { blockerId: ids[1] } });
  });
  it('summarizes the real report and never sends member names', async () => {
    modelResult = { ids: ['total', 'scope'] };
    const reply = await member
      .post(`${base}/houses/${houseId}/summary`)
      .set('Origin', origin)
      .send({ month: '2026-10' })
      .expect(200);
    expect(reply.body.total).toBe(0);
    expect(reply.body.highlights[0]).toContain('0 đ');
    const input = captured.input as { content: { text: string }[] }[];
    expect(input[0].content[0].text).not.toContain('member');
  });
  it('preserves manual operations when the provider fails', async () => {
    providerFailure = true;
    await member
      .post(`${base}/listing-description`)
      .set('Origin', origin)
      .send({ title: 'Nhu cầu phòng' })
      .expect(503);
    providerFailure = false;
    await member.get('/api/v1/houses/' + houseId).expect(200);
    await member
      .get('/api/v1/houses/' + houseId + '/household/reports?month=2026-10')
      .expect(200);
  });
  it('saves a private monthly summary and reads it without calling AI or spending credits', async () => {
    modelResult = { ids: ['total', 'scope'] };
    const path = `${base}/houses/${houseId}/summary`;
    expect(
      (await member.get(`${path}?month=2026-10`).expect(200)).body.summary,
    ).toBeNull();
    const saved = (
      await member
        .post(path)
        .set('Origin', origin)
        .send({ month: '2026-10' })
        .expect(200)
    ).body;
    expect(saved.month).toBe('2026-10');
    expect(saved.generatedAt).toBeTruthy();
    expect(saved.notes).toContain('Tháng 2026-10');
    expect((await member.get(`${base}/usage`)).body.remaining).toBe(4);
    await prisma.aiWallet.update({
      where: { userId: ids[0] },
      data: { freeUsed: 5 },
    });
    providerFailure = true;
    try {
      expect(
        (await member.get(`${path}?month=2026-10`).expect(200)).body.summary,
      ).toEqual(saved);
      expect(
        (
          await member
            .post(path)
            .set('Origin', origin)
            .send({ month: '2026-10' })
            .expect(200)
        ).body,
      ).toEqual(saved);
      expect((await member.get(`${base}/usage`)).body.remaining).toBe(0);
      expect(
        (await member.get(`${path}?month=2026-09`).expect(200)).body.summary,
      ).toBeNull();
      await member
        .post(path)
        .set('Origin', origin)
        .send({ month: '2026-09' })
        .expect(429);
    } finally {
      providerFailure = false;
    }
  });
  it('spends one use for a new month or explicit regeneration and preserves saved notes', async () => {
    modelResult = { ids: ['total', 'scope'] };
    const path = `${base}/houses/${houseId}/summary`;
    const first = (
      await member
        .post(path)
        .set('Origin', origin)
        .send({ month: '2026-10' })
        .expect(200)
    ).body;
    const notes = (
      await member
        .patch(`${path}/notes`)
        .set('Origin', origin)
        .send({
          month: '2026-10',
          notes: 'Ghi chú riêng đã đối chiếu.',
          version: first.version,
        })
        .expect(200)
    ).body;
    expect(notes.notes).toBe('Ghi chú riêng đã đối chiếu.');
    expect((await member.get(`${base}/usage`)).body.remaining).toBe(4);
    await member
      .patch(`${path}/notes`)
      .set('Origin', origin)
      .send({ month: '2026-10', notes: 'Bản cũ', version: first.version })
      .expect(409);
    await member
      .post(path)
      .set('Origin', origin)
      .send({ month: '2026-09' })
      .expect(200);
    const rebuilt = (
      await member
        .post(path)
        .set('Origin', origin)
        .send({ month: '2026-10', regenerate: true })
        .expect(200)
    ).body;
    expect(rebuilt.notes).toBe(notes.notes);
    expect(rebuilt.version).toBe(notes.version + 1);
    expect((await member.get(`${base}/usage`)).body.remaining).toBe(2);
  });
  it('keeps the saved summary and returns the use if regeneration fails', async () => {
    modelResult = { ids: ['total'] };
    const path = `${base}/houses/${houseId}/summary`;
    const first = (
      await member
        .post(path)
        .set('Origin', origin)
        .send({ month: '2026-10' })
        .expect(200)
    ).body;
    providerFailure = true;
    try {
      await member
        .post(path)
        .set('Origin', origin)
        .send({ month: '2026-10', regenerate: true })
        .expect(503);
    } finally {
      providerFailure = false;
    }
    expect((await member.get(`${path}?month=2026-10`)).body.summary).toEqual(
      first,
    );
    expect((await member.get(`${base}/usage`)).body.remaining).toBe(4);
    expect(
      (await prisma.aiHouseSummary.findFirst({ where: { userId: ids[0] } }))
        ?.generationId,
    ).toBeNull();
  });
  it('rolls back completed usage when saving the generated summary fails', async () => {
    modelResult = { ids: ['total'] };
    const credits = app.get(AiCreditsService);
    const complete = credits.complete.bind(credits);
    const write = vi
      .spyOn(credits, 'complete')
      .mockImplementationOnce((use, save) =>
        complete(use, async (tx) => {
          if (save) await save(tx);
          throw new Error('test failure before transaction commit');
        }),
      );
    try {
      await member
        .post(`${base}/houses/${houseId}/summary`)
        .set('Origin', origin)
        .send({ month: '2026-10' })
        .expect(503);
    } finally {
      write.mockRestore();
    }
    expect(
      (
        await member
          .get(`${base}/houses/${houseId}/summary?month=2026-10`)
          .expect(200)
      ).body.summary,
    ).toBeNull();
    expect((await member.get(`${base}/usage`)).body.remaining).toBe(5);
  });
  it('does not expose another member private summary and checks active membership when reading or saving', async () => {
    modelResult = { ids: ['total'] };
    const path = `${base}/houses/${houseId}/summary`;
    const first = (
      await member
        .post(path)
        .set('Origin', origin)
        .send({ month: '2026-10' })
        .expect(200)
    ).body;
    await other.get(`${path}?month=2026-10`).expect(404);
    await prisma.houseMember.create({ data: { houseId, userId: ids[1] } });
    try {
      expect(
        (await other.get(`${path}?month=2026-10`).expect(200)).body.summary,
      ).toBeNull();
      await other
        .patch(`${path}/notes`)
        .set('Origin', origin)
        .send({
          month: '2026-10',
          notes: 'Không phải bản của tôi',
          version: first.version,
        })
        .expect(404);
    } finally {
      await prisma.houseMember.delete({
        where: { houseId_userId: { houseId, userId: ids[1] } },
      });
    }
    await prisma.houseMember.update({
      where: { houseId_userId: { houseId, userId: ids[0] } },
      data: { leftAt: new Date() },
    });
    try {
      await member.get(`${path}?month=2026-10`).expect(404);
      await member
        .patch(`${path}/notes`)
        .set('Origin', origin)
        .send({
          month: '2026-10',
          notes: 'Không còn thành viên',
          version: first.version,
        })
        .expect(404);
    } finally {
      await prisma.houseMember.update({
        where: { houseId_userId: { houseId, userId: ids[0] } },
        data: { leftAt: null },
      });
    }
  });
  it('uses one credit when requests for the same month arrive at multiple service instances', async () => {
    modelResult = { ids: ['total'] };
    const { AiSummariesService } =
      await import('../src/modules/ai/ai-summaries.service.js');
    const { HouseAccessService } =
      await import('../src/modules/houses/house-access.service.js');
    const { AiInsightsService } =
      await import('../src/modules/ai/ai-insights.service.js');
    const services = Array.from(
      { length: 6 },
      () =>
        new AiSummariesService(
          prisma,
          app.get(HouseAccessService),
          app.get(AiInsightsService),
        ),
    );
    const replies = await Promise.allSettled(
      services.map((service) => service.generate(ids[0], houseId, '2026-10')),
    );
    expect(replies.some((reply) => reply.status === 'fulfilled')).toBe(true);
    expect((await member.get(`${base}/usage`)).body.remaining).toBe(4);
    expect(
      await prisma.aiHouseSummary.count({
        where: { userId: ids[0], generatedAt: { not: null } },
      }),
    ).toBe(1);
  });
  it('validates saved-summary queries and note edits without spending credits', async () => {
    const path = `${base}/houses/${houseId}/summary`;
    for (const month of ['2026-13', '1999-12', '2101-01'])
      await member.get(`${path}?month=${month}`).expect(400);
    await request(app.getHttpServer()).get(`${path}?month=2026-10`).expect(401);
    await admin.get(`${path}?month=2026-10`).expect(403);
    await member
      .patch(`${path}/notes`)
      .set('Origin', 'https://untrusted.test')
      .send({ month: '2026-10', notes: '', version: 0 })
      .expect(403);
    await member
      .patch(`${path}/notes`)
      .set('Origin', origin)
      .send({ month: '2026-10', notes: 'x'.repeat(5001), version: 0 })
      .expect(400);
    await member
      .post(path)
      .set('Origin', origin)
      .send({ month: '2026-10', regenerate: 'true' })
      .expect(400);
    expect((await member.get(`${base}/usage`)).body.remaining).toBe(5);
  });
  it('stores monthly totals above a single INTEGER expense without losing the snapshot', async () => {
    modelResult = { ids: ['total'] };
    const participant = await prisma.houseParticipant.findUniqueOrThrow({
      where: { houseId_userId: { houseId, userId: ids[0] } },
    });
    try {
      for (let index = 0; index < 3; index++)
        await prisma.expense.create({
          data: {
            houseId,
            payerId: participant.id,
            createdById: ids[0],
            title: `Chi phí lớn ${index}`,
            amount: 1000000000,
            spentOn: new Date('2026-10-14'),
            splits: {
              create: {
                houseId,
                participantId: participant.id,
                amount: 1000000000,
              },
            },
          },
        });
      const reply = await member
        .post(`${base}/houses/${houseId}/summary`)
        .set('Origin', origin)
        .send({ month: '2026-10' })
        .expect(200);
      expect(reply.body.total).toBe(3000000000);
      expect(reply.body.highlights[0]).toContain('3.000.000.000');
      const read = await member
        .get(`${base}/houses/${houseId}/summary?month=2026-10`)
        .expect(200);
      expect(read.body.summary.total).toBe(3000000000);
      expect((await member.get(`${base}/usage`)).body.remaining).toBe(4);
    } finally {
      await prisma.expense.deleteMany({ where: { houseId } });
    }
  });
  it('enforces five lifetime free credits under simultaneous requests', async () => {
    await prisma.aiWallet.update({
      where: { userId: ids[1] },
      data: { freeUsed: 4 },
    });
    modelResult = { description: 'Nhu cầu phòng có thể kiểm tra.' };
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        other
          .post(`${base}/listing-description`)
          .set('Origin', origin)
          .send({ title: 'Nhu cầu phòng' }),
      ),
    );
    expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
    expect(replies.filter((r) => r.status === 429)).toHaveLength(4);
    expect((await other.get(`${base}/usage`)).body.remaining).toBe(0);
    // Cấp service mới vẫn dùng hạn mức trong PostgreSQL.
    const restarted = new AiProviderService(
      new ConfigService({ OPENAI_API_KEY: 'mock-only' }),
      app.get(AiCreditsService),
      app.get(AiUsageService),
    );
    await expect(
      restarted.generate(ids[1], 'x', '', {}, {}),
    ).rejects.toMatchObject({ response: { code: 'AI_LIMIT_REACHED' } });
  });
  it('enforces the same quota across concurrent service instances', async () => {
    await prisma.aiWallet.update({
      where: { userId: ids[1] },
      data: { freeUsed: 4 },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => {
        const instance = new AiProviderService(
          new ConfigService({
            OPENAI_API_KEY: 'mock-only',
          }),
          app.get(AiCreditsService),
          app.get(AiUsageService),
        );
        return instance.generate(ids[1], 'test', '', {}, {});
      }),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({
          response: { code: 'AI_LIMIT_REACHED' },
        });
    expect((await other.get(`${base}/usage`)).body.remaining).toBe(0);
  });
});
