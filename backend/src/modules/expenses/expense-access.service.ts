import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { expenseInclude, type ExpenseRow } from './expense-views.js';

@Injectable()
export class ExpenseAccessService {
  constructor(private readonly access: HouseAccessService) {}

  async noPending(tx: Prisma.TransactionClient, houseId: string) {
    if (await tx.debtPayment.count({ where: { houseId, status: 'PENDING' } }))
      throw new ConflictException({ code: 'PAYMENT_PENDING' });
  }

  async expense(
    db: Prisma.TransactionClient,
    userId: string,
    houseId: string,
    id: string,
  ) {
    const house = await this.access.finance(db, userId, houseId);
    const row = await db.expense.findFirst({
      where: {
        id,
        houseId,
        ...(!house.active
          ? {
              OR: [
                { payer: { userId } },
                { createdById: userId },
                { splits: { some: { participant: { userId } } } },
              ],
            }
          : {}),
      },
      include: expenseInclude,
    });
    if (!row) throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND' });
    return row;
  }

  editable(userId: string, ownerId: string, row: ExpenseRow, version: number) {
    if (userId !== ownerId && userId !== row.createdById)
      throw new ForbiddenException({ code: 'EXPENSE_FORBIDDEN' });
    if (row.version !== version || row.status === 'CANCELLED')
      throw new ConflictException({ code: 'EXPENSE_CHANGED' });
  }
}
