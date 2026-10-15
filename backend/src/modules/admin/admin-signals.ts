import type { Prisma } from '../../generated/prisma/client.js';

// NOTIFY is delivered after commit. Payloads contain account IDs only.
export async function signalAdminChange(
  tx: Prisma.TransactionClient,
  userIds: string[] = [],
) {
  const admins = await tx.user.findMany({
    where: { role: 'ADMIN', lockedAt: null, closedAt: null },
    select: { id: true },
  });
  const recipients = [
    ...new Set([...userIds, ...admins.map((user) => user.id)]),
  ];
  for (let index = 0; index < recipients.length; index += 100)
    await tx.$queryRaw`SELECT pg_notify('roomora_updates', ${JSON.stringify(recipients.slice(index, index + 100))})::text`;
}
