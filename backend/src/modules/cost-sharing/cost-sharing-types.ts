import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { vietnamDate } from '../expenses/expense-promises.service.js';

export interface SharingMember {
  userId: string;
  participantId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
}
export interface SharingShare {
  participantId: string;
  basisPoints: number;
}
export function sharingRoundView<T extends { members: Prisma.JsonValue }>(
  round: T,
  profiles: { userId: string; avatarUrl: string | null }[],
) {
  return {
    ...round,
    members: (round.members as unknown as SharingMember[]).map((member) => {
      const profile = profiles.find((row) => row.userId === member.userId);
      return profile ? { ...member, avatarUrl: profile.avatarUrl } : member;
    }),
  };
}
export interface SharingFallback {
  periodId: string;
  mode: 'EQUAL' | 'WEIGHTED';
  shares: SharingShare[];
  memberHash: string;
}
export const roundInclude = { votes: { orderBy: { userId: 'asc' as const } } };
export const periodInclude = {
  rounds: {
    orderBy: { number: 'desc' as const },
    take: 1,
    include: roundInclude,
  },
};
export type SharingPeriod = Prisma.CostSharingPeriodGetPayload<{
  include: typeof periodInclude;
}>;

export async function sharingMembers(
  tx: Prisma.TransactionClient,
  houseId: string,
) {
  const rows = await tx.houseMember.findMany({
    where: { houseId, leftAt: null },
    include: {
      user: {
        select: { profile: { select: { displayName: true, avatarUrl: true } } },
      },
    },
    orderBy: { userId: 'asc' },
  });
  return rows.map((row) => ({
    userId: row.userId,
    participantId: row.userId,
    displayName: row.user.profile?.displayName ?? 'Thành viên Roomora',
    avatarUrl: row.user.profile?.avatarUrl ?? null,
    joinedAt: row.joinedAt.toISOString(),
  }));
}
export const sharingHash = (members: SharingMember[]) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        members
          .map((row) => [row.userId, row.joinedAt])
          .sort((a, b) => a[0].localeCompare(b[0])),
      ),
    )
    .digest('hex');
export function sharingMonth(month: string) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    Number(month.slice(0, 4)) < 2000 ||
    Number(month.slice(0, 4)) > 2100
  )
    throw new BadRequestException({ code: 'REPORT_MONTH_INVALID' });
  return month;
}
export function sharingDeadline(month: string, day: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  // End of the chosen calendar day in UTC+7.
  return new Date(
    Date.UTC(year, monthNumber - 1, Math.min(day, last), 16, 59, 59, 999),
  );
}
export const currentSharingMonth = (now: Date) => vietnamDate(now).slice(0, 7);
export function validateSharingShares(
  mode: 'EQUAL' | 'WEIGHTED',
  shares: SharingShare[],
  members: SharingMember[],
) {
  const ids = members.map((row) => row.participantId).sort();
  if (
    shares.length !== ids.length ||
    new Set(shares.map((row) => row.participantId)).size !== shares.length ||
    shares.some(
      (row) =>
        !ids.includes(row.participantId) ||
        !Number.isInteger(row.basisPoints) ||
        row.basisPoints < 0 ||
        row.basisPoints > 10000,
    ) ||
    (mode === 'WEIGHTED' &&
      shares.reduce((sum, row) => sum + row.basisPoints, 0) !== 10000)
  )
    throw new BadRequestException({ code: 'SHARING_RATIOS_INVALID' });
  return ids.map((participantId) => ({
    participantId,
    basisPoints:
      mode === 'EQUAL'
        ? 0
        : shares.find((row) => row.participantId === participantId)!
            .basisPoints,
  }));
}
export function sharingAmounts(
  amount: number,
  mode: 'EQUAL' | 'WEIGHTED',
  shares: SharingShare[],
) {
  const ordered = [...shares].sort((a, b) =>
    a.participantId.localeCompare(b.participantId),
  );
  const denominator = mode === 'EQUAL' ? ordered.length : 10000;
  const rows = ordered.map((row) => {
    const product = amount * (mode === 'EQUAL' ? 1 : row.basisPoints);
    return {
      participantId: row.participantId,
      amount: Math.floor(product / denominator),
      remainder: product % denominator,
    };
  });
  const extra = amount - rows.reduce((sum, row) => sum + row.amount, 0);
  const rank = [...rows].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      a.participantId.localeCompare(b.participantId),
  );
  for (let i = 0; i < extra; i++) rank[i].amount++;
  return rows.map(({ participantId, amount: value }) => ({
    participantId,
    amount: value,
  }));
}
