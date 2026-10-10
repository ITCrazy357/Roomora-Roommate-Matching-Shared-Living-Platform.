import { ConflictException, Injectable } from '@nestjs/common';
import type { ExpenseCategory, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { CostSharingPeriodsService } from './cost-sharing-periods.service.js';
import {
  currentSharingMonth,
  periodInclude,
  sharingAmounts,
  sharingHash,
  sharingMembers,
  sharingMonth,
  type SharingShare,
} from './cost-sharing-types.js';

@Injectable()
export class CostSharingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly periods: CostSharingPeriodsService,
  ) {}
  async resolve(
    tx: Prisma.TransactionClient,
    houseId: string,
    month: string,
    category: ExpenseCategory,
  ) {
    sharingMonth(month);
    let row = await tx.costSharingPeriod.findFirst({
      where: { houseId, month, category, kind: 'MONTHLY' },
      include: periodInclude,
    });
    const setting = await tx.costSharingSetting.findUnique({
      where: { houseId_category: { houseId, category } },
    });
    if (!row && setting?.enabled && month === currentSharingMonth(new Date())) {
      await this.periods.sync(tx, houseId);
      row = await tx.costSharingPeriod.findFirst({
        where: { houseId, month, category, kind: 'MONTHLY' },
        include: periodInclude,
      });
    }
    if (!row) {
      if (setting?.enabled) {
        const first = await tx.costSharingPeriod.findFirst({
          where: { houseId, category, kind: 'MONTHLY' },
          orderBy: { month: 'asc' },
        });
        if (!first || month >= first.month)
          return { status: 'PENDING' as const, periodId: null };
      }
      return { status: 'MANUAL' as const, periodId: null };
    }
    const period = await this.periods.refresh(tx, row),
      hash = sharingHash(await sharingMembers(tx, houseId));
    if (period.resultMode && period.resultMemberHash === hash)
      return {
        status: 'READY' as const,
        periodId: period.id,
        mode: period.resultMode,
        shares: period.resultShares as unknown as SharingShare[],
        source: period.status,
        roundId: period.rounds[0].id,
        month,
        category,
      };
    return {
      status:
        period.resultMemberHash && period.resultMemberHash !== hash
          ? ('NEEDS_REVIEW' as const)
          : period.status,
      periodId: period.id,
    };
  }
  async preview(
    userId: string,
    houseId: string,
    month: string,
    category: ExpenseCategory,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      await this.access.active(tx, userId, houseId);
      return this.resolve(tx, houseId, month, category);
    });
  }
  async apply(
    tx: Prisma.TransactionClient,
    houseId: string,
    month: string,
    category: ExpenseCategory,
    amount: number,
  ) {
    const rule = await this.resolve(tx, houseId, month, category);
    if (rule.status === 'MANUAL') return null;
    if (rule.status !== 'READY')
      throw new ConflictException({
        code:
          rule.status === 'NEEDS_REVIEW'
            ? 'SHARING_MEMBERS_CHANGED'
            : 'SHARING_NOT_AGREED',
      });
    return {
      periodId: rule.periodId,
      splits: sharingAmounts(amount, rule.mode, rule.shares),
      mode: rule.mode,
      snapshot: {
        periodId: rule.periodId,
        roundId: rule.roundId,
        month,
        category,
        mode: rule.mode,
        shares: rule.shares,
        source: rule.source,
      } as unknown as Prisma.InputJsonValue,
    };
  }
}
