import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { CloudinaryService } from '../src/modules/cloudinary/cloudinary.service.js';

describe('Phase 3 listings (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let reader: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  const userIds: string[] = [];
  const origin = 'http://localhost:3000';
  const prefix = `phase3-${randomUUID()}`;
  const password = `Roomora-test-${randomUUID()}`;
  const storage = {
    uploadListingPhoto: vi.fn().mockImplementation((_: unknown, id: string) =>
      Promise.resolve({
        publicId: `roomora/listings/${id}/${randomUUID()}`,
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/room.jpg',
      }),
    ),
    deleteListingPhoto: vi.fn().mockResolvedValue(undefined),
  };
  const form = {
    title: `${prefix} Phòng sáng thoáng`,
    description:
      'Phòng sáng thoáng, bếp chung sạch sẽ, phù hợp với người thích không gian yên tĩnh.',
    rent: 2800000,
    deposit: 2800000,
    electricityCost: 200000,
    waterCost: 100000,
    internetCost: 50000,
    otherCost: 0,
    costNote: 'Điện tính theo sử dụng thực tế.',
    area: 32,
    availableSlots: 1,
    currentResidents: 1,
    availableFrom: '2026-10-01',
    provinceCode: '01',
    wardCode: '00004',
    privateAddress: 'PRIVATE ADDRESS — apartment 42',
    latitude: 21.03456,
    longitude: 105.82345,
    amenities: ['FURNISHED', 'WIFI'],
    roommateNote: 'Giữ bếp sạch sau khi nấu.',
    smokingPreference: 'NO_SMOKING',
  };

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CloudinaryService)
      .useValue(storage)
      .compile();
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
    const passwordHash = await app.get(PasswordService).hash(password);
    for (const [name, role] of [
      ['owner', 'USER'],
      ['reader', 'USER'],
      ['admin', 'ADMIN'],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-${name}@example.test`,
          passwordHash,
          role,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: name } },
        },
      });
      userIds.push(user.id);
    }
    [owner, reader, admin] = await Promise.all(
      ['owner', 'reader', 'admin'].map(async (name) => {
        const agent = request.agent(app.getHttpServer());
        await agent
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .send({ email: `${prefix}-${name}@example.test`, password })
          .expect(200);
        return agent;
      }),
    );
  }, 30000);
  afterAll(async () => {
    if (prisma && userIds.length) {
      await prisma.listing.deleteMany({ where: { ownerId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function draft(input: Record<string, unknown> = form) {
    return (
      await owner
        .post('/api/v1/listings')
        .set('Origin', origin)
        .send(input)
        .expect(201)
    ).body;
  }
  async function withPhoto(input: Record<string, unknown> = form) {
    const listing = await draft(input);
    return (
      await owner
        .post(`/api/v1/listings/${listing.id}/photos`)
        .set('Origin', origin)
        .field('version', listing.version)
        .attach(
          'photo',
          Buffer.from(
            'adapter is tested with actual image bytes in unit tests',
          ),
          'room.jpg',
        )
        .expect(201)
    ).body;
  }
  async function pending(input: Record<string, unknown> = form) {
    const listing = await withPhoto(input);
    return (
      await owner
        .post(`/api/v1/listings/${listing.id}/submit`)
        .set('Origin', origin)
        .send({ version: listing.version })
        .expect(201)
    ).body;
  }
  async function published(input: Record<string, unknown> = form) {
    const listing = await pending(input);
    return (
      await admin
        .post(`/api/v1/admin/listings/${listing.id}/review`)
        .set('Origin', origin)
        .send({ version: listing.version, decision: 'PUBLISHED' })
        .expect(201)
    ).body;
  }

  it('requires login/admin, rejects role injection and protects ownership', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/v1/listings')
      .set('Origin', origin)
      .send({})
      .expect(401);
    await request(server).get('/api/v1/admin/listings').expect(401);
    await reader.get('/api/v1/admin/listings').expect(403);
    await owner
      .post('/api/v1/listings')
      .set('Origin', origin)
      .send({ ...form, status: 'PUBLISHED', ownerId: userIds[1] })
      .expect(400);
    await owner
      .put('/api/v1/profiles/me')
      .set('Origin', origin)
      .send({ role: 'ADMIN' })
      .expect(404);
    await owner
      .patch('/api/v1/profiles/me')
      .set('Origin', origin)
      .send({ role: 'ADMIN' })
      .expect(400);
    const listing = await draft({});
    await reader.get(`/api/v1/listings/mine/${listing.id}`).expect(404);
    await reader
      .put(`/api/v1/listings/${listing.id}`)
      .set('Origin', origin)
      .send({ ...form, version: listing.version })
      .expect(404);
    await reader
      .post(`/api/v1/listings/${listing.id}/submit`)
      .set('Origin', origin)
      .send({ version: listing.version })
      .expect(404);
    await reader
      .post(`/api/v1/listings/${listing.id}/close`)
      .set('Origin', origin)
      .send({ version: listing.version })
      .expect(404);
    expect(
      (await admin.get('/api/v1/auth/me').expect(200)).body.user.role,
    ).toBe('ADMIN');
    expect(
      (await reader.get('/api/v1/auth/me').expect(200)).body.user.role,
    ).toBe('USER');
  });

  it('persists partial drafts but validates complete submissions and locations', async () => {
    const listing = await draft({ title: 'Nháp' });
    expect(listing.status).toBe('DRAFT');
    expect(
      (await owner.get(`/api/v1/listings/mine/${listing.id}`).expect(200)).body
        .title,
    ).toBe('Nháp');
    await request(app.getHttpServer())
      .get(`/api/v1/listings/${listing.id}`)
      .expect(404);
    await reader
      .post(`/api/v1/listings/${listing.id}/save`)
      .set('Origin', origin)
      .expect(404);
    await owner
      .post(`/api/v1/listings/${listing.id}/submit`)
      .set('Origin', origin)
      .send({ version: listing.version })
      .expect(400);
    for (const input of [
      { rent: -1 },
      { availableFrom: '2026-02-30' },
      { provinceCode: '79', wardCode: '00004' },
      { amenities: ['UNKNOWN'] },
      { latitude: 21, longitude: null },
      { rent: '2800000' },
    ]) {
      await owner
        .post('/api/v1/listings')
        .set('Origin', origin)
        .send({ ...form, ...input })
        .expect(400);
    }
    const complete = await draft();
    expect(complete.latitude).toBe(21.03);
    expect(complete.longitude).toBe(105.82);
    expect(complete.provinceName).toBe('Thành phố Hà Nội');
  });

  it('enforces upload ownership, origin, multipart limits and version', async () => {
    const listing = await draft();
    const path = `/api/v1/listings/${listing.id}/photos`;
    const calls = storage.uploadListingPhoto.mock.calls.length;
    await reader
      .post(path)
      .set('Origin', origin)
      .field('version', listing.version)
      .attach('photo', Buffer.from('image'), 'room.jpg')
      .expect(404);
    await owner
      .post(path)
      .set('Origin', 'https://evil.example')
      .field('version', listing.version)
      .attach('photo', Buffer.from('image'), 'room.jpg')
      .expect(403);
    await owner
      .post(path)
      .set('Origin', origin)
      .field('version', listing.version)
      .expect(400);
    await owner
      .post(path)
      .set('Origin', origin)
      .field('version', listing.version)
      .attach('photo', Buffer.alloc(5 * 1024 * 1024 + 1), 'room.jpg')
      .expect(413);
    await owner
      .post(path)
      .set('Origin', origin)
      .field('version', listing.version)
      .field('ownerId', userIds[1])
      .attach('photo', Buffer.from('image'), 'room.jpg')
      .expect(400);
    expect(storage.uploadListingPhoto.mock.calls).toHaveLength(calls);
    const upload = (
      await owner
        .post(path)
        .set('Origin', origin)
        .field('version', listing.version)
        .attach('photo', Buffer.from('image'), 'room.jpg')
        .expect(201)
    ).body;
    expect(upload.photos).toHaveLength(1);
    expect(upload.photos[0]).not.toHaveProperty('publicId');
    await owner
      .post(path)
      .set('Origin', origin)
      .field('version', listing.version)
      .attach('photo', Buffer.from('image'), 'room.jpg')
      .expect(409);
    await reader
      .delete(`${path}/${upload.photos[0].id}`)
      .set('Origin', origin)
      .send({ version: upload.version })
      .expect(404);
    await owner
      .delete(`${path}/${upload.photos[0].id}`)
      .set('Origin', origin)
      .send({ version: upload.version })
      .expect(200);
    expect(storage.deleteListingPhoto).toHaveBeenCalled();
  });

  it('rejects with a reason, records review and publishes only reviewed content', async () => {
    let listing = await pending();
    const path = `/api/v1/admin/listings/${listing.id}/review`;
    await admin
      .post(path)
      .set('Origin', origin)
      .send({ decision: 'REJECTED', version: listing.version })
      .expect(400);
    listing = (
      await admin
        .post(path)
        .set('Origin', origin)
        .send({
          decision: 'REJECTED',
          reason: 'Bổ sung cách tính tiền điện.',
          version: listing.version,
        })
        .expect(201)
    ).body;
    expect(listing.rejectionReason).toBe('Bổ sung cách tính tiền điện.');
    expect(listing.reviews).toHaveLength(1);
    await reader.get(`/api/v1/listings/${listing.id}`).expect(404);
    listing = (
      await owner
        .put(`/api/v1/listings/${listing.id}`)
        .set('Origin', origin)
        .send({
          ...form,
          version: listing.version,
          costNote: 'Điện chia theo hóa đơn thực tế.',
        })
        .expect(200)
    ).body;
    expect(listing.status).toBe('DRAFT');
    listing = (
      await owner
        .post(`/api/v1/listings/${listing.id}/submit`)
        .set('Origin', origin)
        .send({ version: listing.version })
        .expect(201)
    ).body;
    listing = (
      await admin
        .post(path)
        .set('Origin', origin)
        .send({ decision: 'PUBLISHED', version: listing.version })
        .expect(201)
    ).body;
    expect(listing.reviews).toHaveLength(2);
    const response = await reader
      .get(`/api/v1/listings/${listing.id}`)
      .expect(200);
    for (const key of [
      'privateAddress',
      'rejectionReason',
      'reviews',
      'version',
      'email',
      'passwordHash',
    ])
      expect(response.body).not.toHaveProperty(key);
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE ADDRESS');
    expect(JSON.stringify(response.body)).not.toContain('@example.test');
    expect(response.body.owner).toEqual(
      expect.objectContaining({ displayName: 'owner' }),
    );
    expect(response.body.photos[0]).not.toHaveProperty('publicId');
  });

  it('filters area, rent and amenities, sorts and paginates public records', async () => {
    const search = `${prefix} filtering`;
    const first = await published({
      ...form,
      title: `${search} one`,
      rent: 2000000,
    });
    const second = await published({
      ...form,
      title: `${search} two`,
      rent: 3000000,
    });
    await published({
      ...form,
      title: `${search} three`,
      rent: 4000000,
      amenities: ['PARKING'],
    });
    await draft({ ...form, title: `${search} hidden`, rent: 1000000 });
    const path = `/api/v1/listings?search=${encodeURIComponent(search)}&provinceCode=01&wardCode=00004&minRent=1500000&maxRent=3500000&amenities=FURNISHED,WIFI&sort=price_asc&limit=1`;
    const page1 = (await reader.get(path).expect(200)).body;
    const page2 = (await reader.get(`${path}&page=2`).expect(200)).body;
    expect(page1).toMatchObject({ total: 2, pages: 2, page: 1, limit: 1 });
    expect(page1.items.map((item: { id: string }) => item.id)).toEqual([
      first.id,
    ]);
    expect(page2.items.map((item: { id: string }) => item.id)).toEqual([
      second.id,
    ]);
    expect(JSON.stringify(page1)).not.toContain('privateAddress');
    expect(
      (await reader.get(`${path}&status=DRAFT`).expect(200)).body.total,
    ).toBe(2);
    for (const query of [
      'minRent=4&maxRent=2',
      'provinceCode=79&wardCode=00004',
      'wardCode=00004',
      'limit=500',
      'page=0',
      'amenities=UNKNOWN',
    ])
      await reader.get(`/api/v1/listings?${query}`).expect(400);
  });

  it('deduplicates favorites and hides edited or closed listings until approved again', async () => {
    let listing = await published();
    const savePath = `/api/v1/listings/${listing.id}/save`;
    await Promise.all([
      reader.post(savePath).set('Origin', origin).expect(201),
      reader.post(savePath).set('Origin', origin).expect(201),
    ]);
    expect(
      await prisma.savedListing.count({
        where: { userId: userIds[1], listingId: listing.id },
      }),
    ).toBe(1);
    expect(
      (await reader.get('/api/v1/listings/saved').expect(200)).body.items.map(
        (row: { id: string }) => row.id,
      ),
    ).toContain(listing.id);
    const later = await published({ ...form, rent: 3500000 });
    await reader
      .post(`/api/v1/listings/${later.id}/save`)
      .set('Origin', origin)
      .expect(201);
    expect(
      (await reader.get('/api/v1/listings/saved').expect(200)).body.items[0].id,
    ).toBe(later.id);
    expect(
      (await reader.get('/api/v1/listings/saved?sort=price_asc').expect(200))
        .body.items[0].id,
    ).toBe(listing.id);
    expect(
      (await reader.get(`/api/v1/listings/${listing.id}`).expect(200)).body
        .saved,
    ).toBe(true);
    listing = (
      await owner
        .put(`/api/v1/listings/${listing.id}`)
        .set('Origin', origin)
        .send({
          ...form,
          title: `${prefix} changed unpublished`,
          version: listing.version,
        })
        .expect(200)
    ).body;
    expect(listing.status).toBe('DRAFT');
    await reader.get(`/api/v1/listings/${listing.id}`).expect(404);
    expect(
      (await reader.get('/api/v1/listings/saved').expect(200)).body.items.map(
        (row: { id: string }) => row.id,
      ),
    ).not.toContain(listing.id);
    listing = (
      await owner
        .post(`/api/v1/listings/${listing.id}/submit`)
        .set('Origin', origin)
        .send({ version: listing.version })
        .expect(201)
    ).body;
    listing = (
      await admin
        .post(`/api/v1/admin/listings/${listing.id}/review`)
        .set('Origin', origin)
        .send({ decision: 'PUBLISHED', version: listing.version })
        .expect(201)
    ).body;
    await owner
      .post(`/api/v1/listings/${listing.id}/close`)
      .set('Origin', origin)
      .send({ version: listing.version })
      .expect(201);
    await reader.get(`/api/v1/listings/${listing.id}`).expect(404);
    await reader.delete(savePath).set('Origin', origin).expect(200);
    await reader.delete(savePath).set('Origin', origin).expect(200);
  });

  it('allows only one concurrent review and requires reloading stale content', async () => {
    const listing = await pending();
    const results = await Promise.all(
      ['PUBLISHED', 'REJECTED'].map((decision) =>
        admin
          .post(`/api/v1/admin/listings/${listing.id}/review`)
          .set('Origin', origin)
          .send({
            decision,
            reason: 'Kiểm tra lại ảnh.',
            version: listing.version,
          }),
      ),
    );
    expect(
      results
        .map((result) => result.status)
        .sort((first, second) => first - second),
    ).toEqual([201, 409]);
    expect(
      await prisma.listingReview.count({ where: { listingId: listing.id } }),
    ).toBe(1);
    await owner
      .put(`/api/v1/listings/${listing.id}`)
      .set('Origin', origin)
      .send({ ...form, version: listing.version })
      .expect(409);
    const changed = await pending();
    await owner
      .put(`/api/v1/listings/${changed.id}`)
      .set('Origin', origin)
      .send({ ...form, version: changed.version })
      .expect(200);
    await admin
      .post(`/api/v1/admin/listings/${changed.id}/review`)
      .set('Origin', origin)
      .send({ decision: 'PUBLISHED', version: changed.version })
      .expect(409);
  });

  it('cleans a uploaded asset if the draft changes while upload is in progress', async () => {
    const listing = await draft();
    const publicId = `roomora/listings/${listing.id}/raced-upload`;
    storage.uploadListingPhoto.mockImplementationOnce(async () => {
      await owner
        .put(`/api/v1/listings/${listing.id}`)
        .set('Origin', origin)
        .send({ ...form, version: listing.version })
        .expect(200);
      return {
        publicId,
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/room.jpg',
      };
    });
    await owner
      .post(`/api/v1/listings/${listing.id}/photos`)
      .set('Origin', origin)
      .field('version', listing.version)
      .attach('photo', Buffer.from('image'), 'room.jpg')
      .expect(409);
    expect(storage.deleteListingPhoto).toHaveBeenCalledWith(
      publicId,
      listing.id,
    );
    expect(
      await prisma.listingPhoto.count({ where: { listingId: listing.id } }),
    ).toBe(0);
  });

  it('enforces the eight-photo limit and blocks admins from self-review', async () => {
    let listing = await draft();
    for (let count = 0; count < 8; count++)
      listing = (
        await owner
          .post(`/api/v1/listings/${listing.id}/photos`)
          .set('Origin', origin)
          .field('version', listing.version)
          .attach('photo', Buffer.from('image'), 'room.jpg')
          .expect(201)
      ).body;
    await owner
      .post(`/api/v1/listings/${listing.id}/photos`)
      .set('Origin', origin)
      .field('version', listing.version)
      .attach('photo', Buffer.from('image'), 'room.jpg')
      .expect(400);
    await prisma.listing.update({
      where: { id: listing.id },
      data: { ownerId: userIds[2], status: 'PENDING' },
    });
    await admin
      .post(`/api/v1/admin/listings/${listing.id}/review`)
      .set('Origin', origin)
      .send({ decision: 'PUBLISHED', version: listing.version })
      .expect(400);
  });
});
