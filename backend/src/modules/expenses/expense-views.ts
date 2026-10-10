import type { Prisma } from '../../generated/prisma/client.js';

export const personSelect = {
  id: true,
  userId: true,
  displayName: true,
  leftAt: true,
  user: {
    select: { profile: { select: { displayName: true, avatarUrl: true } } },
  },
} as const;

export const expenseInclude = {
  payer: { select: personSelect },
  createdBy: { select: { profile: { select: { displayName: true } } } },
  splits: {
    orderBy: { participantId: 'asc' },
    include: { participant: { select: personSelect } },
  },
  receipt: { select: { expenseId: true } },
} as const;

export const paymentInclude = {
  payer: { select: personSelect },
  recipient: { select: personSelect },
  proof: { select: { paymentId: true } },
} as const;

export type ExpenseRow = Prisma.ExpenseGetPayload<{
  include: typeof expenseInclude;
}>;

export type PersonRow = Prisma.HouseParticipantGetPayload<{
  select: typeof personSelect;
}>;

export function participantView(row: PersonRow) {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.user?.profile?.displayName ?? row.displayName,
    avatarUrl: row.user?.profile?.avatarUrl ?? null,
    leftAt: row.leftAt,
    isGuest: !row.userId,
  };
}

export function expenseView(row: ExpenseRow) {
  const {
    contentHash: _hash,
    payer,
    createdBy,
    splits,
    receipt,
    ...expense
  } = row;
  return {
    ...expense,
    payer: participantView(payer),
    createdByName: createdBy.profile?.displayName ?? 'Thành viên Roomora',
    hasReceipt: !!receipt,
    splits: splits.map((split) => ({
      id: split.id,
      participantId: split.participantId,
      userId: split.participant.userId,
      amount: split.amount,
      displayName: participantView(split.participant).displayName,
    })),
  };
}

export function paymentView(
  row: Prisma.DebtPaymentGetPayload<{ include: typeof paymentInclude }>,
) {
  const { contentHash: _hash, payer, recipient, proof, ...payment } = row;
  return {
    ...payment,
    payer: participantView(payer),
    recipient: participantView(recipient),
    hasProof: !!proof,
    confirmationType: row.confirmedAt
      ? recipient.userId
        ? 'RECEIVER'
        : 'OWNER_RECORDED'
      : null,
  };
}
