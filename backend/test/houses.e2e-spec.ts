import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { NotificationsService } from '../src/modules/communications/notifications.service.js';

describe('Phase 6 houses and listing types (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const agents: ReturnType<typeof request.agent>[] = [];
  const ids: string[] = [];
  const houses: string[] = [];
  const prefix = `phase6-${randomUUID()}`;
  const password = `Roomora-${randomUUID()}`;
  const origin = 'http://localhost:3000';
  const deliverMail = vi.fn().mockResolvedValue(undefined);
  const info = {
    name: 'Nhà An Hải',
    address: 'Căn 802, Đà Nẵng',
    description: 'Cùng chia sẻ không gian.',
    rules: 'Giữ bếp sạch.',
  };
  const post = (
    agent: ReturnType<typeof request.agent>,
    path: string,
    body?: object,
  ) =>
    agent
      .post(`/api/v1${path}`)
      .set('Origin', origin)
      .send(body ?? {});
  const put = (
    agent: ReturnType<typeof request.agent>,
    path: string,
    body: object,
  ) => agent.put(`/api/v1${path}`).set('Origin', origin).send(body);

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
    const notifications = app.get(NotificationsService);
    vi.spyOn(notifications, 'onModuleInit').mockImplementation(() => {});
    vi.spyOn(notifications, 'deliver').mockImplementation(deliverMail);
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const passwordHash = await app.get(PasswordService).hash(password);
    for (const name of ['owner', 'member', 'outsider']) {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-${name}@example.test`,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: `${prefix} ${name}` } },
        },
      });
      ids.push(user.id);
      const agent = request.agent(app.getHttpServer());
      await post(agent, '/auth/login', { email: user.email, password }).expect(
        200,
      );
      agents.push(agent);
    }
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      await prisma.house.deleteMany({ where: { id: { in: houses } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('requires a session and keeps house data private', async () => {
    await request(app.getHttpServer()).get('/api/v1/houses').expect(401);
    const created = (await post(agents[0], '/houses', info).expect(201)).body;
    houses.push(created.id);
    expect(created.ownerId).toBe(ids[0]);
    expect(created.members).toHaveLength(1);
    const secondHouse = await post(agents[0], '/houses', info).expect(409);
    expect(secondHouse.body.code).toBe('HOUSE_ALREADY_JOINED');
    await agents[2].get(`/api/v1/houses/${created.id}`).expect(404);
    await put(agents[2], `/houses/${created.id}`, info).expect(404);
    await agents[2]
      .get(`/api/v1/houses/${created.id}/invite-candidates`)
      .expect(404);
    await post(agents[0], `/houses/${created.id}/invites`, {
      userId: ids[2],
    }).expect(400);
    const connection = (
      await post(agents[0], '/connections', { targetId: ids[1] }).expect(201)
    ).body;
    await post(agents[1], `/connections/${connection.id}/accept`, {
      version: connection.version,
    }).expect(201);
    const candidates = (
      await agents[0]
        .get(`/api/v1/houses/${created.id}/invite-candidates`)
        .expect(200)
    ).body;
    expect(candidates).toEqual([
      expect.objectContaining({ userId: ids[1], status: 'AVAILABLE' }),
    ]);
    expect(JSON.stringify(candidates)).not.toContain(
      `${prefix}-member@example.test`,
    );

    const invited = (
      await post(agents[0], `/houses/${created.id}/invites`, {
        userId: ids[1],
      }).expect(201)
    ).body;
    expect(invited.invites).toHaveLength(1);
    expect(invited.invites[0].label).toContain('member');
    expect(JSON.stringify(invited)).not.toContain(
      `${prefix}-member@example.test`,
    );
    const savedInvite = await prisma.houseInvite.findUniqueOrThrow({
      where: { id: invited.invites[0].id },
    });
    expect(savedInvite.email).toBe(`${prefix}-member@example.test`);
    const emailNotice = await prisma.notification.findFirstOrThrow({
      where: { userId: ids[1], type: 'HOUSE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(emailNotice.emailRequired).toBe(true);
    expect(emailNotice.href).toBe('/nha-chung');
    expect(deliverMail).toHaveBeenCalled();
    expect(
      (
        await agents[0]
          .get(`/api/v1/houses/${created.id}/invite-candidates`)
          .expect(200)
      ).body[0].status,
    ).toBe('INVITED');
    const inviteId = invited.invites[0].id;
    await agents[1].get(`/api/v1/houses/${created.id}`).expect(404);
    await post(agents[2], `/houses/invites/${inviteId}/accept`).expect(404);
    const joined = (
      await post(agents[1], `/houses/invites/${inviteId}/accept`).expect(201)
    ).body;
    expect(joined.members).toHaveLength(2);
    expect(joined.invites).toHaveLength(0);
    await post(agents[1], '/houses', info).expect(409);
    expect(
      (
        await agents[0]
          .get(`/api/v1/houses/${created.id}/invite-candidates`)
          .expect(200)
      ).body[0].status,
    ).toBe('MEMBER');
    await post(agents[1], `/houses/invites/${inviteId}/accept`).expect(404);
    await put(agents[1], `/houses/${created.id}`, info).expect(404);
    await agents[1]
      .get(`/api/v1/houses/${created.id}/invite-candidates`)
      .expect(404);
    const otherHouse = (
      await post(agents[2], '/houses', {
        ...info,
        name: 'Nhà của người khác',
      }).expect(201)
    ).body;
    houses.push(otherHouse.id);
    const otherConnection = (
      await post(agents[2], '/connections', { targetId: ids[1] }).expect(201)
    ).body;
    await post(agents[1], `/connections/${otherConnection.id}/accept`, {
      version: otherConnection.version,
    }).expect(201);
    const otherInvite = (
      await post(agents[2], `/houses/${otherHouse.id}/invites`, {
        userId: ids[1],
      }).expect(201)
    ).body.invites[0];
    const blockedJoin = await post(
      agents[1],
      `/houses/invites/${otherInvite.id}/accept`,
    ).expect(409);
    expect(blockedJoin.body.code).toBe('HOUSE_ALREADY_JOINED');
    expect(
      (await agents[1].get('/api/v1/houses/invites').expect(200)).body.map(
        (invite: { id: string }) => invite.id,
      ),
    ).toContain(otherInvite.id);
    await post(agents[2], `/houses/${otherHouse.id}/leave`).expect(201);
    const closedHouse = await prisma.house.findUniqueOrThrow({
      where: { id: otherHouse.id },
    });
    expect(closedHouse.closedAt).not.toBeNull();
    expect(
      (
        await prisma.houseInvite.findUniqueOrThrow({
          where: { id: otherInvite.id },
        })
      ).status,
    ).toBe('REVOKED');
    await agents[2].get(`/api/v1/houses/${otherHouse.id}`).expect(404);
    await post(agents[1], `/houses/invites/${otherInvite.id}/accept`).expect(
      404,
    );
    const replacement = (
      await post(agents[2], '/houses', {
        ...info,
        name: 'Nhà sau khi lưu trữ',
      }).expect(201)
    ).body;
    houses.push(replacement.id);
    await post(agents[1], `/houses/${created.id}/transfer`, {
      userId: ids[2],
    }).expect(404);

    const updated = (
      await put(agents[0], `/houses/${created.id}`, {
        ...info,
        rules: 'Sau 23h giữ yên tĩnh.',
      }).expect(200)
    ).body;
    expect(updated.rules).toContain('23h');
    const announcement = (
      await post(agents[1], `/houses/${created.id}/announcements`, {
        text: 'Họp nhà lúc 20h.',
        pinned: false,
      }).expect(201)
    ).body;
    expect(announcement.announcements[0].text).toBe('Họp nhà lúc 20h.');
    await post(agents[1], `/houses/${created.id}/announcements`, {
      text: 'Ghim thử',
      pinned: true,
    }).expect(404);
    await post(agents[0], `/houses/${created.id}/leave`).expect(409);
    await post(agents[0], `/houses/${created.id}/transfer`, {
      userId: ids[1],
    }).expect(201);
    await post(agents[0], `/houses/${created.id}/leave`).expect(201);
    await agents[0].get(`/api/v1/houses/${created.id}`).expect(404);
    const newHouses = await Promise.all([
      post(agents[0], '/houses', { ...info, name: 'Nhà mới A' }),
      post(agents[0], '/houses', { ...info, name: 'Nhà mới B' }),
    ]);
    expect(
      newHouses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    houses.push(newHouses.find((response) => response.status === 201)!.body.id);
    expect(
      (await agents[0].get('/api/v1/houses').expect(200)).body,
    ).toHaveLength(1);
    const final = (
      await agents[1].get(`/api/v1/houses/${created.id}`).expect(200)
    ).body;
    expect(final.ownerId).toBe(ids[1]);
    expect(final.events.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(['JOINED', 'OWNER_TRANSFERRED', 'LEFT']),
    );
  });

  it('keeps wanted-room details public without leaking private address', async () => {
    const created = (
      await post(agents[0], '/listings', {
        type: 'ROOM_WANTED',
        title: `${prefix} Tìm phòng gần trung tâm`,
        description:
          'Tìm phòng yên tĩnh gần trung tâm, có thể dọn vào tháng tới.',
        rent: 3000000,
        provinceCode: '01',
        wardCode: '00004',
        privateAddress: 'Địa chỉ riêng không được công khai',
      }).expect(201)
    ).body;
    expect(created.type).toBe('ROOM_WANTED');
    await post(agents[0], `/listings/${created.id}/submit`, {
      version: created.version,
    }).expect(201);
    const row = await prisma.listing.findUniqueOrThrow({
      where: { id: created.id },
    });
    await prisma.listing.update({
      where: { id: created.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        version: row.version + 1,
      },
    });
    const publicData = (
      await agents[2].get(`/api/v1/listings/${created.id}`).expect(200)
    ).body;
    expect(publicData.type).toBe('ROOM_WANTED');
    expect(JSON.stringify(publicData)).not.toContain('Địa chỉ riêng');
    await post(agents[0], `/listings/${created.id}/full`, {
      version: row.version + 1,
      isFull: true,
    }).expect(400);
    const filtered = (
      await agents[2]
        .get('/api/v1/listings')
        .query({ type: 'ROOM_WANTED', search: prefix })
        .expect(200)
    ).body;
    expect(filtered.items.map((item: { id: string }) => item.id)).toContain(
      created.id,
    );
    await prisma.listing.delete({ where: { id: created.id } });
  });

  it('lets only the owner mark a roommate listing full', async () => {
    const created = (
      await post(agents[0], '/listings', {
        title: `${prefix} Phòng đang tìm người ở ghép`,
        description:
          'Căn phòng có bếp chung và gần khu trung tâm, còn một chỗ trống.',
        rent: 2800000,
        currentResidents: 2,
        availableSlots: 1,
      }).expect(201)
    ).body;
    await prisma.listing.update({
      where: { id: created.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), version: 2 },
    });
    await post(agents[1], `/listings/${created.id}/full`, {
      version: 2,
      isFull: true,
    }).expect(404);
    const full = (
      await post(agents[0], `/listings/${created.id}/full`, {
        version: 2,
        isFull: true,
      }).expect(201)
    ).body;
    expect(full.isFull).toBe(true);
    expect(
      (await agents[2].get(`/api/v1/listings/${created.id}`).expect(200)).body
        .isFull,
    ).toBe(true);
    await post(agents[0], `/listings/${created.id}/full`, {
      version: 2,
      isFull: false,
    }).expect(409);
    await prisma.listing.delete({ where: { id: created.id } });
  });

  it('hides accepted connections from public roommate search', async () => {
    const sent = (
      await post(agents[0], '/connections', {
        targetId: ids[2],
        message: 'Mình muốn trao đổi về phòng ở.',
      }).expect(201)
    ).body;
    await post(agents[2], `/connections/${sent.id}/accept`, {
      version: sent.version,
    }).expect(201);
    const search = (
      await agents[0]
        .get('/api/v1/people')
        .query({ q: prefix, limit: 24 })
        .expect(200)
    ).body;
    expect(
      search.items.map((item: { userId: string }) => item.userId),
    ).not.toContain(ids[2]);
    const accepted = (
      await agents[0]
        .get('/api/v1/connections')
        .query({ tab: 'accepted' })
        .expect(200)
    ).body;
    expect(
      accepted.items.map((item: { userId: string }) => item.userId),
    ).toContain(ids[2]);
    await prisma.profile.update({
      where: { userId: ids[2] },
      data: {
        visibility: 'PRIVATE',
        avatarUrl: 'https://res.cloudinary.com/demo/image/upload/avatar.jpg',
      },
    });
    const inbox = (await agents[0].get('/api/v1/conversations').expect(200))
      .body;
    expect(inbox.items[0].person.displayName).toContain('outsider');
    expect(inbox.items[0].person.avatarUrl).toContain('avatar.jpg');
  });
});
