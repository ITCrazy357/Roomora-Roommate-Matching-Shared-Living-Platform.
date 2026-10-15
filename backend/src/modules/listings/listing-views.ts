import type { Prisma } from '../../generated/prisma/client.js';

export const details = {
  serviceOrders: { where: { status: 'PAID' }, select: { postingRound: true } },
  photos: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
  owner: {
    select: {
      id: true,
      lockedAt: true,
      identityDeclaration: { select: { status: true } },
      profile: {
        select: { displayName: true, avatarUrl: true, visibility: true },
      },
    },
  },
} satisfies Prisma.ListingInclude;

export type Listing = Prisma.ListingGetPayload<{ include: typeof details }>;

export const MAX_PHOTOS = 8;
