export const PRESENCE_IDLE_MS = 3 * 60 * 1000;

export function presenceSelect() {
  return {
    lastActiveAt: true,
    lockedAt: true,
    sessions: {
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
        lastActiveAt: { not: null },
      },
      orderBy: { lastActiveAt: 'desc' },
      take: 1,
      select: { lastActiveAt: true },
    },
  } as const;
}

export function presenceView(user: {
  lastActiveAt: Date | null;
  lockedAt: Date | null;
  sessions: { lastActiveAt: Date | null }[];
}) {
  const active = user.sessions[0]?.lastActiveAt;
  return {
    online:
      !user.lockedAt &&
      !!active &&
      Date.now() - active.getTime() < PRESENCE_IDLE_MS,
    lastActiveAt: user.lastActiveAt,
  };
}
