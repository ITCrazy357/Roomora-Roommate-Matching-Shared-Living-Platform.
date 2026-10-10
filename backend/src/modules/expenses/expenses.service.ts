import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateExpenseDto, ExpenseQueryDto } from './dto/expenses.dto.js';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private unavailable(): never {
    throw new NotFoundException({
      code: 'HOUSE_NOT_FOUND',
    });
  }

  private async canAccessHouse(userId: string, houseId: string) {
    const house = await this.prisma.house.findFirst({
      where: {
        id: houseId,
        closedAt: null,
        members: {
          some: {
            userId,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!house) {
      this.unavailable();
    }
    return house;
  }

  async create(userId: string, houseId: string, dto: CreateExpenseDto) {
    const splitUserIds = dto.splits.map((split) => split.userId);

    const uniqueUserIds = new Set(splitUserIds);

    if (uniqueUserIds.size !== splitUserIds.length) {
      throw new BadRequestException({
        code: 'EXPENSE_DUPLICATE_SPLIT_USERS',
      });
    }

    const splitTotal = dto.splits.reduce(
      (total, split) => total + split.amount,
      0,
    );

    if (splitTotal !== dto.amount) {
      throw new BadRequestException({
        code: 'EXPENSE_SPLIT_AMOUNT_MISMATCH',
      });
    }

    if (!uniqueUserIds.has(dto.payerId)) {
      throw new BadRequestException({
        code: 'EXPENSE_PAYER_NOT_PARTICIPANT',
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const house = await transaction.house.updateMany({
        where: {
          id: houseId,
          closedAt: null,
          members: {
            some: {
              userId: userId,
              leftAt: null,
            },
          },
        },
        data: {
          updatedAt: new Date(),
        },
      });

      if (!house.count) {
        this.unavailable();
      }

      const members = await transaction.houseMember.findMany({
        where: {
          houseId,
          leftAt: null,
          userId: {
            in: [...uniqueUserIds],
          },
        },
        select: {
          userId: true,
        },
      });

      if (members.length !== uniqueUserIds.size) {
        throw new BadRequestException({
          code: 'EXPENSE_MEMBER_NOT_ACTIVE',
        });
      }

      return transaction.expense.create({
        data: {
          houseId,
          payerId: dto.payerId,
          createdById: userId,
          title: dto.title,
          description: dto.description,
          amount: dto.amount,
          receiptUrl: dto.receiptUrl,
          splits: {
            create: dto.splits.map((split) => ({
              userId: split.userId,
              amount: split.amount,
            })),
          },
        },

        include: {
          splits: {
            orderBy: {
              userId: 'asc',
            },
            select: {
              id: true,
              userId: true,
              amount: true,
            },
          },
        },
      });
    });
  }

  async list(userId: string, houseId: string, query: ExpenseQueryDto) {
    await this.canAccessHouse(userId, houseId);

    const where = {
      houseId,
    };

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          payer: {
            select: {
              id: true,
              profile: {
                select: {
                  displayName: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              profile: {
                select: {
                  displayName: true,
                },
              },
            },
          },
          splits: {
            orderBy: {
              userId: 'asc',
            },
            select: {
              id: true,
              userId: true,
              amount: true,
            },
          },
        },
        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.expense.count({
        where,
      }),
    ]);

    return {
      items,
      total,
      page: query.page,
      pages: Math.ceil(total / query.limit),
    };
  }

  async getBalances(userId: string, houseId: string) {
    await this.canAccessHouse(userId, houseId);

    const [members, expenses] = await Promise.all([
      this.prisma.houseMember.findMany({
        where: {
          houseId,
        },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              profile: {
                select: {
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.expense.findMany({
        where: {
          houseId,
          status: {
            not: 'CANCELLED',
          },
        },
        select: {
          payerId: true,
          amount: true,
          splits: {
            select: {
              userId: true,
              amount: true,
            },
          },
        },
      }),
    ]);

    const balanceMap = new Map<
      string,
      {
        paid: number;
        owed: number;
      }
    >();

    for (const member of members) {
      balanceMap.set(member.userId, {
        paid: 0,
        owed: 0,
      });
    }

    for (const expense of expenses) {
      const payer = balanceMap.get(expense.payerId);

      if (payer) {
        payer.paid += expense.amount;
      }

      for (const split of expense.splits) {
        const member = balanceMap.get(split.userId);

        if (member) {
          member.owed += split.amount;
        }
      }
    }

    const balances = members.map((member) => {
      const value = balanceMap.get(member.userId)!;
      const balance = value.paid - value.owed;

      return {
        userId: member.userId,
        displayName: member.user.profile?.displayName ?? null,
        avatarUrl: member.user.profile?.avatarUrl ?? null,
        paid: value.paid,
        owed: value.owed,
        balance,
        status: balance > 0 ? 'RECEIVE' : balance < 0 ? 'PAY' : 'SETTLED',
      };
    });

    const totalBalance = balances.reduce(
      (total, item) => total + item.balance,
      0,
    );

    return {
      balances,
      totalBalance,
    };
  }

  async getSettlements(userId: string, houseId: string) {
    await this.canAccessHouse(userId, houseId);

    const balances = await this.getBalances(userId, houseId);

    const creditors = balances.balances
      .filter((item) => item.balance > 0)
      .map((item) => ({
        ...item,
        remaining: item.balance,
      }))
      .sort((a, b) => b.remaining - a.remaining);

    const debtors = balances.balances
      .filter((item) => item.balance < 0)
      .map((item) => ({
        ...item,
        remaining: -item.balance,
      }))
      .sort((a, b) => b.remaining - a.remaining);

    const transfers: Array<{
      payerId: string;
      payerName: string;
      recipientId: string;
      recipientName: string;
      amount: number;
    }> = [];

    let creditorIndex = 0;
    let debtorIndex = 0;

    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];

      //Đề xuất cần phải trả
      const amount = Math.min(creditor.remaining, debtor.remaining);

      if (amount > 0) {
        transfers.push({
          payerId: debtor.userId,
          payerName: debtor.displayName ?? '',
          recipientId: creditor.userId,
          recipientName: creditor.displayName ?? '',
          amount,
        });
      }

      creditor.remaining -= amount;
      debtor.remaining -= amount;

      if (creditor.remaining === 0) {
        creditorIndex++;
      }

      if (debtor.remaining === 0) {
        debtorIndex++;
      }
    }

    return transfers;
  }
}
