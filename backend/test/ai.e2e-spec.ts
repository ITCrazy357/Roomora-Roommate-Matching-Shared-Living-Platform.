import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import {
  AiProviderService,
  aiMonth,
} from '../src/modules/ai/ai-provider.service.js';

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
        inject: [PrismaService],
        factory: (db: PrismaService) =>
          new AiProviderService(
            new ConfigService({
              OPENAI_API_KEY: 'mock-only',
              AI_MONTHLY_LIMIT: 50,
            }),
            db,
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
    expect((await other.get(`${base}/usage`)).body.used).toBe(before.body.used);
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
  it('enforces atomic monthly quota under simultaneous requests', async () => {
    await prisma.aiUsage.upsert({
      where: { userId_month: { userId: ids[1], month: aiMonth() } },
      create: { userId: ids[1], month: aiMonth(), count: 49 },
      update: { count: 49 },
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
    expect((await other.get(`${base}/usage`)).body.used).toBe(50);
    // Cấp service mới vẫn dùng hạn mức trong PostgreSQL.
    const restarted = new AiProviderService(
      new ConfigService({ OPENAI_API_KEY: 'mock-only', AI_MONTHLY_LIMIT: 50 }),
      prisma,
    );
    await expect(
      restarted.generate(ids[1], 'x', '', {}, {}),
    ).rejects.toMatchObject({ response: { code: 'AI_LIMIT_REACHED' } });
  });
  it('enforces the same quota across concurrent service instances', async () => {
    await prisma.aiUsage.update({
      where: { userId_month: { userId: ids[1], month: aiMonth() } },
      data: { count: 49 },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => {
        const instance = new AiProviderService(
          new ConfigService({
            OPENAI_API_KEY: 'mock-only',
            AI_MONTHLY_LIMIT: 50,
          }),
          prisma,
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
    expect((await other.get(`${base}/usage`)).body.used).toBe(50);
  });
});
