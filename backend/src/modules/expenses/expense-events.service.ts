import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../communications/notifications.service.js';
import type { ExpenseRow } from './expense-views.js';
import { ExpenseRemindersService } from './expense-reminders.service.js';

@Injectable()
export class ExpenseEventsService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly reminders: ExpenseRemindersService,
  ) {}

  private snapshot(row: ExpenseRow): Prisma.InputJsonObject {
    return {
      title: row.title,
      category: row.category,
      spentOn: row.spentOn.toISOString().slice(0, 10),
      description: row.description,
      payerId: row.payerId,
      amount: row.amount,
      status: row.status,
      splitMode: row.splitMode,
      sharingPeriodId: row.sharingPeriodId,
      sharingSnapshot: row.sharingSnapshot,
      receiptUrl: row.receiptUrl,
      hasReceipt: !!row.receipt,
      splits: row.splits.map((split) => ({
        participantId: split.participantId,
        amount: split.amount,
      })),
    };
  }

  async record(
    tx: Prisma.TransactionClient,
    userId: string,
    before: ExpenseRow | null,
    after: ExpenseRow,
    action: string,
    reason: string,
  ) {
    await tx.expenseAdjustment.create({
      data: {
        expenseId: after.id,
        createdById: userId,
        oldAmount: before?.amount ?? 0,
        newAmount: after.amount,
        action,
        reason,
        version: after.version,
        ...(before ? { oldSnapshot: this.snapshot(before) } : {}),
        newSnapshot: this.snapshot(after),
      },
    });
  }

  async signal(
    tx: Prisma.TransactionClient,
    houseId: string,
    extra: string[] = [],
  ) {
    await this.reminders.sync(tx, houseId);
    const members = await tx.houseMember.findMany({
      where: { houseId, leftAt: null },
      select: { userId: true },
    });
    await this.notifications.signal(tx, [
      ...new Set([...extra, ...members.map((member) => member.userId)]),
    ]);
  }
}
