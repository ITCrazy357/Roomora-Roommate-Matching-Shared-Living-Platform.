import { BadRequestException } from '@nestjs/common';
import type { CreateExpenseDto } from './dto/expenses.dto.js';

export function expenseSplits(input: CreateExpenseDto) {
  let splits: { participantId: string; amount: number }[];

  if (input.splitMode === 'EQUAL') {
    if (input.splits !== undefined || !input.participantIds?.length)
      throw new BadRequestException({ code: 'EXPENSE_SPLIT_INVALID' });

    const ids = [...input.participantIds].sort();

    const share = Math.floor(input.amount / ids.length);

    const remainder = input.amount % ids.length;

    splits = ids.map((participantId, index) => ({
      participantId,
      amount: share + (index < remainder ? 1 : 0),
    }));
  } else {
    if (input.participantIds !== undefined || !input.splits?.length)
      throw new BadRequestException({ code: 'EXPENSE_SPLIT_INVALID' });
    splits = input.splits.map((split) => {
      if (
        split.userId &&
        split.participantId &&
        split.userId !== split.participantId
      )
        throw new BadRequestException({ code: 'EXPENSE_SPLIT_INVALID' });
      return {
        participantId: (split.participantId ?? split.userId)!,
        amount: split.amount,
      };
    });
  }
  if (
    new Set(splits.map((split) => split.participantId)).size !== splits.length
  )
    throw new BadRequestException({ code: 'EXPENSE_DUPLICATE_SPLIT_USERS' });
  if (splits.reduce((total, split) => total + split.amount, 0) !== input.amount)
    throw new BadRequestException({ code: 'EXPENSE_SPLIT_AMOUNT_MISMATCH' });
  return splits.sort((a, b) => a.participantId.localeCompare(b.participantId));
}

export function settlementTransfers(
  balances: { participantId: string; displayName: string; balance: number }[],
) {
  const order = (
    a: { remaining: number; participantId: string },
    b: { remaining: number; participantId: string },
  ) =>
    b.remaining - a.remaining || a.participantId.localeCompare(b.participantId);
  const creditors = balances
    .filter((item) => item.balance > 0)
    .map((item) => ({ ...item, remaining: item.balance }))
    .sort(order);
  const debtors = balances
    .filter((item) => item.balance < 0)
    .map((item) => ({ ...item, remaining: -item.balance }))
    .sort(order);
  const transfers: {
    payerId: string;
    payerName: string;
    recipientId: string;
    recipientName: string;
    amount: number;
  }[] = [];
  let creditorIndex = 0,
    debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex],
      debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.remaining, debtor.remaining);
    transfers.push({
      payerId: debtor.participantId,
      payerName: debtor.displayName,
      recipientId: creditor.participantId,
      recipientName: creditor.displayName,
      amount,
    });
    creditor.remaining -= amount;
    debtor.remaining -= amount;
    if (!creditor.remaining) creditorIndex++;
    if (!debtor.remaining) debtorIndex++;
  }
  return transfers;
}
