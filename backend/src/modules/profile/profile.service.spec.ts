import { ProfileService } from './profile.service.js';
import { LocationsService } from '../locations/locations.service.js';
import type { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import type { PrismaService } from '../../database/prisma.service.js';

describe('Profile avatar consistency and location privacy', () => {
  const existing = {
    userId: 'owner',
    avatarUrl: 'https://example.test/old.jpg',
    avatarPublicId: 'roomora/avatars/owner/old',
    updatedAt: new Date(),
    desiredLocations: [],
    desiredAreas: [],
    budgetMin: null,
    budgetMax: null,
    visibility: 'PUBLIC',
    showDesiredAreas: false,
    showBudget: false,
    showLifestyle: false,
  };
  function setup() {
    const prisma = {
      profile: {
        findUnique: vi.fn().mockResolvedValue(existing),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi
          .fn()
          .mockImplementation(({ data }) => ({ ...existing, ...data })),
      },
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'owner', profile: existing }),
      },
    };
    const cloudinary = {
      uploadAvatar: vi
        .fn()
        .mockResolvedValue({
          publicId: 'roomora/avatars/owner/new',
          secureUrl: 'https://example.test/new.jpg',
        }),
      deleteAvatar: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProfileService(
      prisma as unknown as PrismaService,
      cloudinary as unknown as CloudinaryService,
      new LocationsService(),
    );
    return { service, prisma, cloudinary };
  }

  it('persists a replacement before deleting the previous owned asset', async () => {
    const { service, prisma, cloudinary } = setup();
    await service.uploadAvatar('owner', {} as Express.Multer.File);
    expect(prisma.profile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'owner',
          updatedAt: existing.updatedAt,
          avatarPublicId: existing.avatarPublicId,
        },
      }),
    );
    expect(cloudinary.deleteAvatar).toHaveBeenCalledWith(
      existing.avatarPublicId,
      'owner',
    );
    expect(prisma.profile.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      cloudinary.deleteAvatar.mock.invocationCallOrder[0],
    );
  });

  it.each(['database failure', 'concurrent replacement'])(
    'cleans up only the new asset on %s',
    async (reason) => {
      const { service, prisma, cloudinary } = setup();
      if (reason === 'database failure')
        prisma.profile.updateMany.mockRejectedValue(new Error('DB down'));
      else prisma.profile.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.uploadAvatar('owner', {} as Express.Multer.File),
      ).rejects.toThrow();
      expect(cloudinary.deleteAvatar).toHaveBeenCalledExactlyOnceWith(
        'roomora/avatars/owner/new',
        'owner',
      );
    },
  );

  it('does not touch the existing avatar if provider upload fails', async () => {
    const { service, prisma, cloudinary } = setup();
    cloudinary.uploadAvatar.mockRejectedValue(
      new Error('provider unavailable'),
    );
    await expect(
      service.uploadAvatar('owner', {} as Express.Multer.File),
    ).rejects.toThrow();
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
    expect(cloudinary.deleteAvatar).not.toHaveBeenCalled();
  });

  it('projects labels from validated codes and never accepts mixed location inputs', async () => {
    const { service, prisma } = setup();
    await service.updateMine('owner', {
      desiredLocations: [{ provinceCode: '01', wardCode: '00004' }],
    });
    expect(prisma.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          desiredAreas: ['Phường Ba Đình, Thành phố Hà Nội'],
          desiredLocations: [{ provinceCode: '01', wardCode: '00004' }],
        }),
      }),
    );
    await expect(
      service.updateMine('owner', {
        desiredLocations: [{ provinceCode: '79', wardCode: '00004' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.updateMine('owner', { desiredLocations: [], desiredAreas: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('does not leak location codes or storage identifiers in a public response', async () => {
    const { service } = setup();
    const profile = await service.getPublic('owner');
    expect(profile.desiredLocations).toBeUndefined();
    expect(profile.desiredAreas).toBeUndefined();
    expect(profile).not.toHaveProperty('avatarPublicId');
  });

  it('limits avatar attempts before making more provider calls', async () => {
    const { service, cloudinary } = setup();
    for (let index = 0; index < 10; index++)
      await service.uploadAvatar('owner', {} as Express.Multer.File);
    await expect(
      service.uploadAvatar('owner', {} as Express.Multer.File),
    ).rejects.toMatchObject({ status: 429 });
    expect(cloudinary.uploadAvatar).toHaveBeenCalledTimes(10);
  });
});
