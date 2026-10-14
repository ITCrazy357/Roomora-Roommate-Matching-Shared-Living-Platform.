import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const url = new URL(process.env.DATABASE_URL ?? '');
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  url.pathname !== '/roomora_phase12'
) {
  throw new Error(
    'Fixtures are allowed only in the isolated local roomora_phase12 database',
  );
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.href }),
});
try {
  if ((await prisma.user.count()) || (await prisma.listing.count()))
    throw new Error('Fixture database must be empty');
  const users = Array.from({ length: 200 }, (_, i) => ({
    id: randomUUID(),
    email: `load-${i}@example.test`,
    emailVerifiedAt: new Date(),
  }));
  await prisma.user.createMany({ data: users });
  await prisma.profile.createMany({
    data: users.map((user, i) => ({
      userId: user.id,
      displayName: `Load user ${i}`,
    })),
  });
  for (let batch = 0; batch < 20; batch++) {
    await prisma.listing.createMany({
      data: Array.from({ length: 500 }, (_, i) => {
        const index = batch * 500 + i;
        return {
          ownerId: users[index % users.length].id,
          status: 'PUBLISHED',
          type: 'ROOM_RENTAL',
          title: `Load listing ${index}`,
          rent: 2000000 + (index % 20) * 100000,
          provinceCode: '79',
          wardCode: '26734',
          publishedAt: new Date(Date.now() - index * 1000),
        };
      }),
    });
  }
  await prisma.notification.createMany({
    data: Array.from({ length: 500 }, (_, i) => ({
      userId: users[0].id,
      type: 'HOUSE',
      title: `Load notification ${i}`,
      href: '/nha-chung',
    })),
  });
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      userId: users[0].id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await prisma.$executeRawUnsafe('ANALYZE');
  const fixture = {
    users: 200,
    listings: 10000,
    notifications: 500,
    cookie: `${process.env.LOAD_COOKIE_NAME ?? '__Host-roomora_session'}=${token}`,
  };
  await writeFile(
    process.env.LOAD_FIXTURE_FILE ?? '.verification/phase12-fixture.json',
    JSON.stringify(fixture, null, 2),
    { flag: 'wx' },
  );
  console.log(
    'Seeded 200 users, 10000 listings, 500 notifications and one real database session',
  );
} finally {
  await prisma.$disconnect();
}
