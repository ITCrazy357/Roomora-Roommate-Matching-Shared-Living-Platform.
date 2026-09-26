import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { CloudinaryService } from '../src/modules/cloudinary/cloudinary.service.js';

describe('Profile multipart and official location API (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  const email = `avatar-e2e-${randomUUID()}@example.test`;
  const origin = 'http://localhost:3000';
  const storage = {
    uploadAvatar: vi
      .fn()
      .mockImplementation((_, owner: string) =>
        Promise.resolve({
          publicId: `roomora/avatars/${owner}/test`,
          secureUrl: 'https://res.cloudinary.com/demo/image/upload/test.jpg',
        }),
      ),
    deleteAvatar: vi.fn().mockResolvedValue(undefined),
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
    await app.init();
    prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await app
          .get(PasswordService)
          .hash('Avatar-an-toan-2026'),
        emailVerifiedAt: new Date(),
        profile: { create: { displayName: 'Avatar E2E' } },
      },
    });
    userId = user.id;
  });
  afterAll(async () => {
    if (prisma && userId) await prisma.user.delete({ where: { id: userId } });
    await app?.close();
  });

  it('enforces session, origin, size, ownership and private location projection', async () => {
    const server = app.getHttpServer();
    const agent = request.agent(server);
    await request(server)
      .post('/api/v1/profiles/me/avatar')
      .set('Origin', origin)
      .attach('avatar', Buffer.from('png'), 'avatar.png')
      .expect(401);
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: 'Avatar-an-toan-2026' })
      .expect(200);
    await agent
      .post('/api/v1/profiles/me/avatar')
      .set('Origin', 'https://evil.example')
      .attach('avatar', Buffer.from('png'), 'avatar.png')
      .expect(403);
    await agent
      .post('/api/v1/profiles/me/avatar')
      .set('Origin', origin)
      .expect(400);
    await agent
      .post('/api/v1/profiles/me/avatar')
      .set('Origin', origin)
      .attach('avatar', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
      .expect(413);
    expect(storage.uploadAvatar).not.toHaveBeenCalled();
    const upload = await agent
      .post('/api/v1/profiles/me/avatar')
      .set('Origin', origin)
      .attach(
        'avatar',
        Buffer.from('adapter is unit tested separately'),
        'avatar.png',
      )
      .expect(201);
    expect(upload.body.avatarUrl).toBe(
      'https://res.cloudinary.com/demo/image/upload/test.jpg',
    );
    expect(upload.body).not.toHaveProperty('avatarPublicId');
    expect(storage.uploadAvatar).toHaveBeenCalledWith(
      expect.anything(),
      userId,
    );
    expect(
      (await prisma.profile.findUniqueOrThrow({ where: { userId } }))
        .avatarPublicId,
    ).toBe(`roomora/avatars/${userId}/test`);
    await agent
      .patch('/api/v1/profiles/me')
      .set('Origin', origin)
      .send({ avatarUrl: null })
      .expect(400);
    await agent
      .post('/api/v1/profiles/me/avatar')
      .set('Origin', origin)
      .field('userId', randomUUID())
      .attach('avatar', Buffer.from('png'), 'avatar.png')
      .expect(400);

    const provinces = await request(server)
      .get('/api/v1/locations/provinces')
      .expect(200);
    expect(provinces.body).toHaveLength(34);
    const wards = await request(server)
      .get('/api/v1/locations/provinces/01/wards')
      .expect(200);
    expect(wards.body).toContainEqual({
      code: '00004',
      name: 'Phường Ba Đình',
    });
    for (const locations of [
      null,
      [{ provinceCode: '79', wardCode: '00004' }],
      [{ provinceCode: '01', wardCode: '00004', userId }],
      Array.from({ length: 6 }, () => ({ provinceCode: '01' })),
    ]) {
      await agent
        .patch('/api/v1/profiles/me')
        .set('Origin', origin)
        .send({ desiredLocations: locations })
        .expect(400);
    }
    const saved = await agent
      .patch('/api/v1/profiles/me')
      .set('Origin', origin)
      .send({
        desiredLocations: [{ provinceCode: '01', wardCode: '00004' }],
        showDesiredAreas: false,
      })
      .expect(200);
    expect(saved.body.desiredAreas).toEqual([
      'Phường Ba Đình, Thành phố Hà Nội',
    ]);
    const publicProfile = await request(server)
      .get(`/api/v1/profiles/${userId}`)
      .expect(200);
    expect(publicProfile.body).not.toHaveProperty('desiredLocations');
    expect(publicProfile.body).not.toHaveProperty('desiredAreas');
    await agent
      .delete('/api/v1/profiles/me/avatar')
      .set('Origin', origin)
      .expect(200)
      .expect(({ body }) => expect(body.avatarUrl).toBeNull());
  });
});
