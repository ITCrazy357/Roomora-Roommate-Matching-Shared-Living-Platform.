import { PrismaClient } from '../dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../dist/modules/auth/password.service.js';
import { IdentityCryptoService } from '../dist/modules/identity/identity-crypto.service.js';

const url = new URL(process.env.DATABASE_URL);
if (
  process.env.NODE_ENV !== 'test' ||
  process.env.ROOMORA_E2E_FIXTURE !== 'true' ||
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  !['/roomora_operations', '/roomora_ui'].includes(url.pathname)
)
  throw new Error('Fixture requires an explicit isolated local database');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.href }),
});
try {
  if (await prisma.user.count())
    throw new Error('Fixture database must be empty');
  const passwordHash = await new PasswordService().hash(
    'Roomora-browser-test-only-2026',
  );
  const crypto = new IdentityCryptoService(
    new ConfigService({ IDENTITY_ENCRYPTION_KEY: '11'.repeat(32) }),
  );
  for (const project of ['desktop', 'mobile']) {
    for (const role of ['owner', 'viewer']) {
      const user = await prisma.user.create({
        data: {
          email: `e2e-${role}-${project}@example.test`,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: {
            create: {
              displayName: `E2E ${role} ${project}`,
              visibility: 'PUBLIC',
              onboardingCompletedAt: new Date(),
            },
          },
        },
      });
      await prisma.identityDeclaration.create({
        data: {
          userId: user.id,
          documentLast4: '0123',
          encryptedData: crypto.encrypt(user.id, {
            fullName: 'Người kiểm thử',
            birthDate: '2001-01-01',
            documentNumber: '000000000123',
            phone: '0900000000',
            contactAddress: 'Địa chỉ giả kiểm thử',
          }),
        },
      });
      if (role === 'owner')
        await prisma.listing.create({
          data: {
            ownerId: user.id,
            status: 'PUBLISHED',
            type: 'ROOM_RENTAL',
            title: `E2E ${project} phòng thử nghiệm`,
            description: 'Dữ liệu giả chỉ dùng cho kiểm thử giao diện tự động.',
            provinceName: 'Thành phố Hồ Chí Minh',
            wardName: 'Phường kiểm thử',
            privateAddress: 'PRIVATE ADDRESS MUST NOT LEAK',
            rent: 3000000,
            deposit: 3000000,
            electricityCost: 200000,
            waterCost: 100000,
            internetCost: 50000,
            otherCost: 150000,
            availableSlots: 2,
            area: 25,
            publishedAt: new Date(),
            photos: {
              create: {
                url: '/images/home-balcony.webp',
                publicId: `e2e-${project}-photo`,
                position: 0,
              },
            },
          },
        });
    }
  }
  console.log(JSON.stringify({ fixture: true, users: 4, listings: 2 }));
} finally {
  await prisma.$disconnect();
}
