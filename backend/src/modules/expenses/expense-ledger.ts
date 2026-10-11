import type { Prisma } from '../../generated/prisma/client.js';
import { personSelect, participantView } from './expense-views.js';

export async function calculateHouseBalances(
  tx: Prisma.TransactionClient,
  houseId: string,
) {
  const people = await tx.houseParticipant.findMany({
    where: { houseId },
    select: personSelect,
    orderBy: { id: 'asc' },
  });
  const expenses = await tx.expense.findMany({
    where: { houseId, status: { not: 'CANCELLED' } },
    select: {
      payerId: true,
      amount: true,
      splits: { select: { participantId: true, amount: true } },
    },
  });
  const payments = await tx.debtPayment.findMany({
    where: { houseId, status: { in: ['PENDING', 'CONFIRMED'] } },
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
      },
    ]),
  );
  for (const expense of expenses) {
    rows.get(expense.payerId)!.paid += expense.amount;
    for (const split of expense.splits)
      rows.get(split.participantId)!.owed += split.amount;
  }
  const corrections = await tx.expenseCorrection.findMany({
    where: { houseId },
    select: {
      shares: {
        select: { participantId: true, paidDelta: true, owedDelta: true },
      },
    },
  });
  for (const correction of corrections) {
    for (const share of correction.shares) {
      rows.get(share.participantId)!.paid += share.paidDelta;
      rows.get(share.participantId)!.owed += share.owedDelta;
    }
  }
  for (const payment of payments) {
    if (payment.status === 'CONFIRMED') {
      rows.get(payment.payerId)!.sent += payment.amount;
      rows.get(payment.recipientId)!.received += payment.amount;
    } else {
      rows.get(payment.payerId)!.pendingSent += payment.amount;
      rows.get(payment.recipientId)!.pendingReceived += payment.amount;
    }
  }
  for (const row of rows.values())
    row.balance = row.paid - row.owed + row.sent - row.received;
  return [...rows.values()];
}
