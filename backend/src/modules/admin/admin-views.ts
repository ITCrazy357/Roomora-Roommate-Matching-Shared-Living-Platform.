import type { Prisma } from '../../generated/prisma/client.js';

// Deliberately excludes password, private profile, House and conversation data.
export const adminUserSelect = {
  id: true,
  role: true,
  email: true,
  createdAt: true,
  emailVerifiedAt: true,
  lockedAt: true,
  lockReason: true,
  moderationVersion: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;

export function adminPage<T>(
  items: T[],
  total: number,
  query: { page: number; limit: number },
) {
  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    pages: Math.ceil(total / query.limit),
  };
}
