import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';

describe('Profile budget consistency (HTTP and PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const userIds = [randomUUID(), randomUUID()];
  const agents: ReturnType<typeof request.agent>[] = [];
  const origin = 'http://localhost:3000';
  const initial = { budgetMin: 1_000_000, budgetMax: 2_000_000 };
  const patch = (body: object, user = 0) =>
    agents[user].patch('/api/v1/profiles/me').set('Origin', origin).send(body);

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
    const password = 'Budget-test-' + randomUUID();
    const passwordHash = await app.get(PasswordService).hash(password);
    for (const id of userIds) {
      const email = `budget-${id}@example.test`;
      await prisma.user.create({
        data: {
          id,
          email,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: 'Budget test', ...initial } },
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
  }, 30000);

  beforeEach(async () => {
    await prisma.profile.update({
      where: { userId: userIds[0] },
      data: { ...initial, bio: null },
    });
  });

  it('serializes competing partial updates and rejects the now-invalid range', async () => {
    let release!: () => void;
    let acquired!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM profiles WHERE user_id = ${userIds[0]}::uuid FOR UPDATE`;
      acquired();
      await gate;
    });
    const pending: Promise<request.Response>[] = [];
    try {
      await Promise.race([locked, blocker]);
      pending.push(
        patch({ budgetMin: 1_800_000 }).then((response) => response),
      );
      pending.push(
        patch({ budgetMax: 1_500_000 }).then((response) => response),
      );
      // Both writes must reach the database before releasing the blocking row.
      // The old implementation reads stale budgets before it blocks on UPDATE.
      await vi.waitFor(
        async () => {
          const [waiting] = await prisma.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%profiles%'
        `;
          expect(waiting.count).toBeGreaterThanOrEqual(2);
        },
        { interval: 10, timeout: 3000 },
      );
      release();
      const results = await Promise.all(pending);
      expect(
        results.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([200, 400]);
      expect(
        results.find((response) => response.status === 400)!.body.code,
      ).toBe('BUDGET_RANGE_INVALID');
      const profile = await prisma.profile.findUniqueOrThrow({
        where: { userId: userIds[0] },
      });
      expect([
        { budgetMin: 1_800_000, budgetMax: 2_000_000 },
        { budgetMin: 1_000_000, budgetMax: 1_500_000 },
      ]).toContainEqual({
        budgetMin: profile.budgetMin,
        budgetMax: profile.budgetMax,
      });
    } finally {
      release();
      await blocker;
      await Promise.allSettled(pending);
    }
  });

  it.each([
    { budgetMin: null, budgetMax: 0 },
    { budgetMin: 3_000_000, budgetMax: null },
    { budgetMin: null, budgetMax: null },
    { budgetMin: 2_000_000, budgetMax: 2_000_000 },
  ])('accepts nullable and equal budget bounds: %j', async (bounds) => {
    const response = await patch(bounds).expect(200);
    expect(response.body).toMatchObject(bounds);
    expect(
      await prisma.profile.findUniqueOrThrow({ where: { userId: userIds[0] } }),
    ).toMatchObject(bounds);
  });

  it.each([{ budgetMin: 3_000_000 }, { budgetMax: 500_000 }])(
    'rejects an invalid partial range without changing the profile: %j',
    async (bounds) => {
      const response = await patch({
        ...bounds,
        bio: 'Must not be saved',
      }).expect(400);
      expect(response.body.code).toBe('BUDGET_RANGE_INVALID');
      expect(
        await prisma.profile.findUniqueOrThrow({
          where: { userId: userIds[0] },
        }),
      ).toMatchObject({ ...initial, bio: null });
    },
  );

  it('keeps independent concurrent edits to the same profile', async () => {
    await Promise.all([
      patch({ budgetMin: 1_200_000 }).expect(200),
      patch({ bio: 'Independent edit' }).expect(200),
    ]);
    expect(
      await prisma.profile.findUniqueOrThrow({ where: { userId: userIds[0] } }),
    ).toMatchObject({
      budgetMin: 1_200_000,
      budgetMax: initial.budgetMax,
      bio: 'Independent edit',
    });
  });

  it('enforces the range even for a direct database write', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await expect(
        client.query(
          'UPDATE profiles SET budget_min = $1, budget_max = $2 WHERE user_id = $3',
          [3_000_000, 1_000_000, userIds[0]],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'profiles_budget_range_valid',
      });
    } finally {
      await client.end();
    }
    expect(
      await prisma.profile.findUniqueOrThrow({ where: { userId: userIds[0] } }),
    ).toMatchObject(initial);
  });

  it('adds the migration guard without rewriting legacy budgets and validates only after correction', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    const addCheck = readFileSync(
      new URL(
        '../prisma/migrations/20261026110000_profile_budget_range_check/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const validateCheck = readFileSync(
      new URL(
        '../prisma/migrations/20261026110100_validate_profile_budget_range/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await client.connect();
    try {
      await client.query('BEGIN');
      // Session-local shadow table: exercise the original migration SQL safely.
      await client.query(
        'CREATE TEMP TABLE profiles (budget_min integer, budget_max integer)',
      );
      const {
        rows: [table],
      } = await client.query(
        "SELECT relpersistence FROM pg_class WHERE oid = 'profiles'::regclass",
      );
      expect(table.relpersistence).toBe('t');
      await client.query(
        'INSERT INTO pg_temp.profiles VALUES (2000000, 1000000)',
      );
      await client.query(addCheck);

      await client.query('SAVEPOINT invalid_write');
      await expect(
        client.query('UPDATE pg_temp.profiles SET budget_min = 3000000'),
      ).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK TO SAVEPOINT invalid_write');
      await client.query('SAVEPOINT validation');
      await expect(client.query(validateCheck)).rejects.toMatchObject({
        code: '23514',
      });
      await client.query('ROLLBACK TO SAVEPOINT validation');
      expect(
        (await client.query('SELECT * FROM pg_temp.profiles')).rows,
      ).toEqual([{ budget_min: 2_000_000, budget_max: 1_000_000 }]);

      await client.query('UPDATE pg_temp.profiles SET budget_max = budget_min');
      await client.query(validateCheck);
      const {
        rows: [constraint],
      } = await client.query(
        "SELECT convalidated FROM pg_constraint WHERE conrelid = 'pg_temp.profiles'::regclass AND conname = 'profiles_budget_range_valid'",
      );
      expect(constraint.convalidated).toBe(true);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('keeps budget updates scoped to the authenticated account', async () => {
    await patch({ userId: userIds[0], budgetMin: null }, 1).expect(400);
    await patch({ budgetMin: null }, 1).expect(200);
    expect(
      await prisma.profile.findUniqueOrThrow({ where: { userId: userIds[0] } }),
    ).toMatchObject(initial);
  });

  afterAll(async () => {
    if (prisma)
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app?.close();
  });
});
