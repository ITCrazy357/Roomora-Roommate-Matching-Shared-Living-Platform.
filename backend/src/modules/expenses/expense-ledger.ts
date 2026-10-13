import type { Prisma } from '../../generated/prisma/client.js';
import { personSelect, participantView } from './expense-views.js';

export interface BalanceExpenseDetail {
  id: string;
  expenseId: string;
  kind: 'EXPENSE' | 'CORRECTION';
  title: string;
  amount: number;
  totalAmount: number | null;
  paidAmount: number | null;
  occurredOn: Date;
  reason: string | null;
}

export interface BalancePaymentDetail {
  id: string;
  personName: string;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER';
  occurredOn: Date;
}

export interface BalanceDetails {
  paid: BalanceExpenseDetail[];
  owed: BalanceExpenseDetail[];
  sent: BalancePaymentDetail[];
  received: BalancePaymentDetail[];
  pendingSent: BalancePaymentDetail[];
  pendingReceived: BalancePaymentDetail[];
}

function emptyDetails(): BalanceDetails {
  return {
    paid: [],
    owed: [],
    sent: [],
    received: [],
    pendingSent: [],
    pendingReceived: [],
  };
}

export async function calculateHouseBalances(
  tx: Prisma.TransactionClient,
  houseId: string,
  includeDetails = false,
) {
  const people = await tx.houseParticipant.findMany({
    where: { houseId },
    select: personSelect,
    orderBy: { id: 'asc' },
  });
  const expenses = await tx.expense.findMany({
    where: { houseId, status: { not: 'CANCELLED' } },
    orderBy: includeDetails
      ? [{ spentOn: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
      : undefined,
    select: {
      id: true,
      title: true,
      spentOn: true,
      status: true,
      payerId: true,
      amount: true,
      paidAmount: true,
      splits: { select: { participantId: true, amount: true } },
    },
  });
  const payments = await tx.debtPayment.findMany({
    where: { houseId, status: { in: ['PENDING', 'CONFIRMED'] } },
    orderBy: includeDetails ? [{ createdAt: 'asc' }, { id: 'asc' }] : undefined,
  });
  const rows = new Map(
    people.map((person) => [
      person.id,
      {
        ...participantView(person),
        participantId: person.id,
        paid: 0,
        owed: 0,
        sent: 0,
        received: 0,
        pendingSent: 0,
        pendingReceived: 0,
        balance: 0,
        details: includeDetails ? emptyDetails() : undefined,
      },
    ]),
  );
  for (const expense of expenses) {
    rows.get(expense.payerId)!.paid += expense.amount;
    const detail = {
      id: expense.id,
      expenseId: expense.id,
      kind: 'EXPENSE' as const,
      title: expense.title,
      amount: expense.amount,
      totalAmount: expense.amount,
      paidAmount: expense.paidAmount,
      occurredOn: expense.spentOn,
      reason: null,
    };
    if (expense.status !== 'SETTLED')
      rows.get(expense.payerId)!.details?.paid.push(detail);
    for (const split of expense.splits) {
      rows.get(split.participantId)!.owed += split.amount;
      if (split.amount && expense.status !== 'SETTLED')
        rows
          .get(split.participantId)!
          .details?.owed.push({ ...detail, amount: split.amount });
    }
  }
  const corrections = await tx.expenseCorrection.findMany({
    where: { houseId },
    orderBy: includeDetails
      ? [{ recordedOn: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
      : undefined,
    select: {
      id: true,
      expenseId: true,
      recordedOn: true,
      settledAt: true,
      reason: true,
      expense: { select: { title: true } },
      shares: {
        select: { participantId: true, paidDelta: true, owedDelta: true },
      },
    },
  });
  for (const correction of corrections) {
    for (const share of correction.shares) {
      rows.get(share.participantId)!.paid += share.paidDelta;
      rows.get(share.participantId)!.owed += share.owedDelta;
      const detail = {
        id: correction.id,
        expenseId: correction.expenseId,
        kind: 'CORRECTION' as const,
        title: correction.expense.title,
        totalAmount: null,
        paidAmount: null,
        occurredOn: correction.recordedOn,
        reason: correction.reason,
      };
      if (share.paidDelta && !correction.settledAt)
        rows
          .get(share.participantId)!
          .details?.paid.push({ ...detail, amount: share.paidDelta });
      if (share.owedDelta && !correction.settledAt)
        rows
          .get(share.participantId)!
          .details?.owed.push({ ...detail, amount: share.owedDelta });
    }
  }
  for (const payment of payments) {
    const payer = rows.get(payment.payerId)!,
      recipient = rows.get(payment.recipientId)!;
    const detail = {
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      occurredOn: payment.confirmedAt ?? payment.createdAt,
    };
    const sent = { ...detail, personName: recipient.displayName };
    const received = { ...detail, personName: payer.displayName };
    if (payment.status === 'CONFIRMED') {
      rows.get(payment.payerId)!.sent += payment.amount;
      rows.get(payment.recipientId)!.received += payment.amount;
      if (!payment.settledAt) {
        payer.details?.sent.push(sent);
        recipient.details?.received.push(received);
      }
    } else {
      rows.get(payment.payerId)!.pendingSent += payment.amount;
      rows.get(payment.recipientId)!.pendingReceived += payment.amount;
      payer.details?.pendingSent.push(sent);
      recipient.details?.pendingReceived.push(received);
    }
  }
  for (const row of rows.values())
    row.balance = row.paid - row.owed + row.sent - row.received;
  return [...rows.values()].map((row) => ({
    ...row,
    current: row.details
      ? {
          paid: row.details.paid.reduce((sum, item) => sum + item.amount, 0),
          owed: row.details.owed.reduce((sum, item) => sum + item.amount, 0),
          sent: row.details.sent.reduce((sum, item) => sum + item.amount, 0),
          received: row.details.received.reduce(
            (sum, item) => sum + item.amount,
            0,
          ),
          supplierTotal: row.details.paid
            .filter((item) => item.kind === 'EXPENSE')
            .reduce((sum, item) => sum + item.amount, 0),
          supplierPaid: row.details.paid.reduce(
            (sum, item) => sum + (item.paidAmount ?? 0),
            0,
          ),
        }
      : undefined,
  }));
}
