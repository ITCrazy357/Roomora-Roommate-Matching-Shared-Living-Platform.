import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';

describe('Demo declarations and support status (HTTP/PostgreSQL)', () => {
  let app: INestApplication,
    prisma: PrismaService,
    config: ConfigService,
    listener: Client;
  let admin: ReturnType<typeof request.agent>,
    other: ReturnType<typeof request.agent>,
    owner: ReturnType<typeof request.agent>;
  let userId: string, adminId: string, otherId: string, passwordHash: string;
  const ids: string[] = [],
    signals: string[][] = [];
  const origin = 'http://localhost:3000',
    base = '/api/v1',
    password = `Identity-${randomUUID()}`;
  const fields = {
    fullName: 'Họ Tên Riêng Tư Demo',
    birthDate: '2001-01-01',
    documentNumber: '000000000123',
    phone: '0900000000',
    contactAddress: 'Địa chỉ liên hệ giả phục vụ demo',
  };
  const declaration = { ...fields, version: 0, confirmDemo: true };
  const house = {
    name: 'Nhà kiểm thử khai báo',
    address: 'Địa chỉ kiểm thử',
    description: '',
    rules: '',
  };
  const listingForm = {
    type: 'ROOM_RENTAL',
    hasRoom: true,
    title: 'Cho thuê phòng thử nghiệm khai báo',
    description: 'Phòng sáng thoáng có bếp, wifi và khu vực sinh hoạt riêng.',
    rent: 2500000,
    area: 25,
    provinceCode: '01',
    wardCode: '00004',
    availableFrom: '2026-11-01',
    privateAddress: 'Địa chỉ riêng minh họa',
    latitude: 21.03,
    longitude: 105.82,
  };
  const put = (agent: typeof owner, path: string, body: object) =>
    agent
      .put(base + path)
      .set('Origin', origin)
      .send(body);
  const post = (agent: typeof owner, path: string, body: object) =>
    agent
      .post(base + path)
      .set('Origin', origin)
      .send(body);
  const patch = (agent: typeof owner, path: string, body: object) =>
    agent
      .patch(base + path)
      .set('Origin', origin)
      .send(body);

  async function account(role: 'ADMIN' | 'USER' = 'USER') {
    const email = `identity-test-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        role,
        passwordHash,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            displayName: 'Tài khoản thử hồ sơ',
            visibility: 'PUBLIC',
            onboardingCompletedAt: new Date(),
          },
        },
      },
    });
    ids.push(user.id);
    const agent = request.agent(app.getHttpServer());
    await post(agent, '/auth/login', { email, password }).expect(200);
    return { user, agent };
  }
  async function declare(version = 0, changes = {}) {
    return (
      await put(owner, '/identity/me', {
        ...declaration,
        version,
        ...changes,
      }).expect(200)
    ).body;
  }
  async function rental() {
    const row = (await post(owner, '/listings', listingForm).expect(201)).body;
    await prisma.listingPhoto.create({
      data: {
        listingId: row.id,
        publicId: `identity-fixture/${row.id}`,
        url: 'https://example.test/room.jpg',
        position: 0,
      },
    });
    return row;
  }
  async function ticket() {
    return (
      await post(owner, '/support/tickets', {
        subject: 'Cần hỗ trợ kiểm tra quyết toán',
        body: 'Nội dung yêu cầu hỗ trợ ban đầu.',
      }).expect(201)
    ).body;
  }
  async function waitSignal(user: string) {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const signal = signals.find(
        (item) => item.includes(user) && item.includes(adminId),
      );
      if (signal) return signal;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw Error('Missing committed update signal');
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
    config = app.get(ConfigService);
    config.set('IDENTITY_DECLARATION_REQUIRED', true);
    config.set('IDENTITY_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    passwordHash = await app.get(PasswordService).hash(password);
    const first = await account('ADMIN'),
      second = await account();
    admin = first.agent;
    adminId = first.user.id;
    other = second.agent;
    otherId = second.user.id;
    listener = new Client({
      connectionString: config.getOrThrow('DATABASE_URL'),
    });
    await listener.connect();
    await listener.query('LISTEN roomora_updates');
    listener.on('notification', (event) => {
      if (event.payload) {
        const payload: unknown = JSON.parse(event.payload);
        if (Array.isArray(payload)) signals.push(payload as string[]);
      }
    });
  });
  beforeEach(async () => {
    const created = await account();
    owner = created.agent;
    userId = created.user.id;
    signals.length = 0;
  });
  afterAll(async () => {
    await listener?.end();
    if (prisma && ids.length) {
      await prisma.adminAction.deleteMany({
        where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
      });
      await prisma.identityDeclaration.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.supportTicket.deleteMany({ where: { userId: { in: ids } } });
      await prisma.userReport.deleteMany({
        where: { reporterId: { in: ids } },
      });
      await prisma.house.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.listing.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('isolates private and admin endpoints and returns explicit empty declaration JSON', async () => {
    await request(app.getHttpServer())
      .get(base + '/identity/me')
      .expect(401);
    expect((await owner.get(base + '/identity/me').expect(200)).body).toEqual({
      declaration: null,
    });
    await owner.get(base + '/admin/identities').expect(403);
    await admin.get(base + '/identity/me').expect(403);
    await patch(owner, `/admin/identities/${userId}`, {
      status: 'APPROVED',
      version: 1,
      reason: 'Không đủ quyền',
    }).expect(403);
  });

  it('stores encrypted demo declarations, exposes own fields and no-store responses', async () => {
    const record = await declare();
    expect(record).toMatchObject({
      mode: 'DEMO',
      status: 'PENDING',
      documentMasked: '********0123',
      fields,
      version: 1,
      providerResult: null,
      documentImagesStored: false,
      biometricDataStored: false,
    });
    const stored = await prisma.identityDeclaration.findUniqueOrThrow({
      where: { userId },
    });
    expect(
      Buffer.from(stored.encryptedData).includes(
        Buffer.from(fields.documentNumber),
      ),
    ).toBe(false);
    expect(
      Buffer.from(stored.encryptedData).includes(Buffer.from(fields.fullName)),
    ).toBe(false);
    const mine = await owner.get(base + '/identity/me').expect(200);
    expect(mine.headers['cache-control']).toBe('no-store');
    expect(mine.body.declaration.fields).toEqual(fields);
    expect(
      JSON.stringify(
        (await owner.get(base + '/identity/status').expect(200)).body,
      ),
    ).not.toContain(fields.documentNumber);
    expect(
      (await other.get(base + '/identity/me').expect(200)).body.declaration,
    ).toBeNull();
  });

  it('validates data and refuses client-supplied approval, other owner IDs and stale versions', async () => {
    for (const changes of [
      { confirmDemo: false },
      { documentNumber: '123' },
      { birthDate: '2026-02-31' },
      { birthDate: '2100-01-01' },
      { phone: 'bad' },
      { status: 'APPROVED' },
      { userId: otherId },
    ])
      await put(owner, '/identity/me', { ...declaration, ...changes }).expect(
        400,
      );
    await declare();
    await put(owner, '/identity/me', declaration).expect(409);
    expect(await prisma.identityDeclaration.count({ where: { userId } })).toBe(
      1,
    );
  });

  it('requires declaration for new house creation and rental submission, but not room searches', async () => {
    await post(owner, '/houses', house).expect(403);
    const row = await rental();
    await post(owner, `/listings/${row.id}/submit`, {
      version: row.version,
    }).expect(403);
    const wanted = (
      await post(owner, '/listings', {
        ...listingForm,
        type: 'ROOM_WANTED',
        hasRoom: false,
      }).expect(201)
    ).body;
    await post(owner, `/listings/${wanted.id}/submit`, {
      version: wanted.version,
    }).expect(201);
    expect(await prisma.listingSubmission.count({ where: { userId } })).toBe(1);
  });

  it('permits house creation and rental submission immediately after PENDING declaration', async () => {
    await declare();
    await post(owner, '/houses', house).expect(201);
    const row = await rental();
    await post(owner, `/listings/${row.id}/submit`, {
      version: row.version,
    }).expect(201);
    expect(
      (
        await prisma.identityDeclaration.findUniqueOrThrow({
          where: { userId },
        })
      ).status,
    ).toBe('PENDING');
  });

  it('requires declaration when accepting a house invitation', async () => {
    await declare();
    const created = (await post(owner, '/houses', house).expect(201)).body;
    const target = await account();
    await prisma.connection.create({
      data: {
        senderId: userId,
        receiverId: target.user.id,
        pairKey: [userId, target.user.id]
          .sort((a, b) => a.localeCompare(b))
          .join(':'),
        status: 'ACCEPTED',
      },
    });
    await post(owner, `/houses/${created.id}/invites`, {
      userId: target.user.id,
    }).expect(201);
    const invite = await prisma.houseInvite.findFirstOrThrow({
      where: { houseId: created.id, email: target.user.email },
    });
    await post(target.agent, `/houses/invites/${invite.id}/accept`, {}).expect(
      403,
    );
    await put(target.agent, '/identity/me', declaration).expect(200);
    await post(target.agent, `/houses/invites/${invite.id}/accept`, {}).expect(
      201,
    );
  });

  it('returns masked admin lookup and audits detail access without leaking private fields', async () => {
    await declare();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const list = await admin
      .get(base + '/admin/identities')
      .query({ search: user.email })
      .expect(200);
    expect(list.body.total).toBe(1);
    const detail = await admin
      .get(base + `/admin/identities/${userId}`)
      .expect(200);
    for (const body of [list.body, detail.body]) {
      const value = JSON.stringify(body);
      expect(value).not.toContain(fields.documentNumber);
      expect(value).not.toContain(fields.fullName);
      expect(value).not.toContain('encryptedData');
    }
    expect(
      await prisma.adminAction.count({
        where: {
          entityId: userId,
          actorId: adminId,
          action: 'IDENTITY_VIEWED',
        },
      }),
    ).toBe(1);
  });

  it('requires a reason and current version to reveal private data and records minimal audit', async () => {
    await declare();
    await post(other, `/admin/identities/${userId}/reveal`, {
      version: 1,
      reason: 'Kiểm tra hồ sơ',
    }).expect(403);
    await post(admin, `/admin/identities/${userId}/reveal`, {
      version: 1,
      reason: '',
    }).expect(400);
    await post(admin, `/admin/identities/${userId}/reveal`, {
      version: 2,
      reason: 'Kiểm tra hồ sơ',
    }).expect(409);
    const result = await post(admin, `/admin/identities/${userId}/reveal`, {
      version: 1,
      reason: 'Đối chiếu hồ sơ demo theo yêu cầu',
    }).expect(201);
    expect(result.body.fields).toEqual(fields);
    expect(result.headers['cache-control']).toBe('no-store');
    const audit = await prisma.adminAction.findMany({
      where: { entityId: userId },
    });
    expect(
      audit.some(
        (item) =>
          item.action === 'IDENTITY_REVEALED' && item.actorId === adminId,
      ),
    ).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(fields.documentNumber);
    expect(JSON.stringify(audit)).not.toContain(fields.fullName);
  });

  it('publishes only the demo review status and checks declaration again at rental moderation', async () => {
    await declare();
    const row = await rental();
    const sent = (
      await post(owner, `/listings/${row.id}/submit`, {
        version: row.version,
      }).expect(201)
    ).body;
    await patch(admin, `/admin/identities/${userId}`, {
      version: 1,
      status: 'REJECTED',
      reason: 'Bổ sung thông tin còn thiếu trong demo',
    }).expect(200);
    await post(admin, `/admin/listings/${row.id}/review`, {
      version: sent.version,
      decision: 'PUBLISHED',
    }).expect(403);
    await declare(2);
    await patch(admin, `/admin/identities/${userId}`, {
      version: 3,
      status: 'APPROVED',
      reason: 'Đã kiểm tra hồ sơ demo thủ công',
    }).expect(200);
    await post(admin, `/admin/listings/${row.id}/review`, {
      version: sent.version,
      decision: 'PUBLISHED',
    }).expect(201);
    const view = (
      await request(app.getHttpServer())
        .get(base + `/listings/${row.id}`)
        .expect(200)
    ).body;
    expect(view.owner.identityStatus).toBe('APPROVED');
    expect(JSON.stringify(view)).not.toContain(fields.documentNumber);
    const person = (await other.get(base + `/people/${userId}`).expect(200))
      .body;
    expect(person.identityStatus).toBe('APPROVED');
    expect(JSON.stringify(person)).not.toContain(fields.fullName);
    const discovery = (
      await other
        .get(base + '/people')
        .query({ q: 'Tài khoản thử hồ sơ' })
        .expect(200)
    ).body;
    expect(
      discovery.items.find(
        (item: { userId: string }) => item.userId === userId,
      ),
    ).toMatchObject({ identityStatus: 'APPROVED' });
    await prisma.connection.create({
      data: {
        senderId: userId,
        receiverId: otherId,
        pairKey: [userId, otherId].sort((a, b) => a.localeCompare(b)).join(':'),
        status: 'ACCEPTED',
      },
    });
    const connections = (
      await other.get(base + '/connections?tab=accepted').expect(200)
    ).body;
    expect(
      connections.items.find(
        (item: { userId: string }) => item.userId === userId,
      ),
    ).toMatchObject({ identityStatus: 'APPROVED' });
  });

  it('clears old approval on resubmission and prevents stale admin decisions', async () => {
    await declare();
    await patch(admin, `/admin/identities/${userId}`, {
      version: 1,
      status: 'APPROVED',
      reason: 'Đã kiểm tra hồ sơ demo',
    }).expect(200);
    const updated = await declare(2, { fullName: 'Tên mới của hồ sơ demo' });
    expect(updated).toMatchObject({
      status: 'PENDING',
      version: 3,
      reviewedAt: null,
      reviewNote: null,
    });
    await patch(admin, `/admin/identities/${userId}`, {
      version: 2,
      status: 'APPROVED',
      reason: 'Quyết định trên dữ liệu cũ',
    }).expect(409);
  });

  it('does not write personal data without an encryption key', async () => {
    const key = config.get('IDENTITY_ENCRYPTION_KEY');
    config.set('IDENTITY_ENCRYPTION_KEY', '');
    try {
      await put(owner, '/identity/me', declaration).expect(503);
    } finally {
      config.set('IDENTITY_ENCRYPTION_KEY', key);
    }
    expect(await prisma.identityDeclaration.count({ where: { userId } })).toBe(
      0,
    );
  });

  it('saves support status without a reply and signals the user and admin after commit', async () => {
    const row = await ticket();
    signals.length = 0;
    await patch(admin, `/admin/support/tickets/${row.id}/status`, {
      version: 1,
      status: 'CLOSED',
    }).expect(200);
    for (const agent of [owner, admin]) {
      const path =
        agent === owner ? '/support/tickets' : '/admin/support/tickets';
      expect(
        (await agent.get(base + `${path}/${row.id}`).expect(200)).body,
      ).toMatchObject({ status: 'CLOSED', version: 2 });
      const list = (await agent.get(base + path).expect(200)).body;
      expect(
        list.items.find((item: { id: string }) => item.id === row.id).status,
      ).toBe('CLOSED');
    }
    expect(
      await prisma.supportMessage.count({ where: { ticketId: row.id } }),
    ).toBe(1);
    expect((await waitSignal(userId)).includes(adminId)).toBe(true);
    expect(
      await prisma.adminAction.count({
        where: { entityId: row.id, action: 'SUPPORT_CLOSED' },
      }),
    ).toBe(1);
  });

  it('protects the status-only endpoint and allows one concurrent version winner', async () => {
    const row = await ticket();
    await patch(owner, `/admin/support/tickets/${row.id}/status`, {
      version: 1,
      status: 'CLOSED',
    }).expect(403);
    const results = await Promise.all(
      ['IN_PROGRESS', 'RESOLVED'].map((status) =>
        patch(admin, `/admin/support/tickets/${row.id}/status`, {
          version: 1,
          status,
        }),
      ),
    );
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    expect(
      await prisma.supportMessage.count({ where: { ticketId: row.id } }),
    ).toBe(1);
    expect(
      await prisma.adminAction.count({ where: { entityId: row.id } }),
    ).toBe(1);
  });

  it('keeps reply-plus-status behavior and signals admin when the user responds', async () => {
    const row = await ticket();
    await patch(admin, `/admin/support/tickets/${row.id}`, {
      version: 1,
      status: 'WAITING_USER',
      body: 'Vui lòng bổ sung thông tin kiểm tra.',
    }).expect(200);
    signals.length = 0;
    await post(owner, `/support/tickets/${row.id}/replies`, {
      version: 2,
      body: 'Tôi đã bổ sung đầy đủ thông tin.',
    }).expect(201);
    const current = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(current).toMatchObject({ status: 'IN_PROGRESS', version: 3 });
    await waitSignal(userId);
    expect(
      await prisma.supportMessage.count({ where: { ticketId: row.id } }),
    ).toBe(3);
  });
});
