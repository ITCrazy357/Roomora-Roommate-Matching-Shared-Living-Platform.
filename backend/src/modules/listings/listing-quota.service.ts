import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { boostPlan } from '../billing/billing-types.js';

// Vietnam has a fixed UTC+7 offset. A week starts Monday at 00:00 local time.
export function listingWeek(now: Date) {
  const offset = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - daysSinceMonday);
  local.setUTCHours(0, 0, 0, 0);
  const startsAt = new Date(local.getTime() - offset);
  return { startsAt, resetsAt: new Date(startsAt.getTime() + 7 * 86400000) };
}

@Injectable()
export class ListingQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Use the payment/refund/submit user lock for a coherent quota snapshot.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      return this.read(tx, userId, new Date());
    });
  }

  private async read(tx: Prisma.TransactionClient, userId: string, now: Date) {
    const { startsAt, resetsAt } = listingWeek(now);
    const used = await tx.listingSubmission.count({
      where: { userId, createdAt: { gte: startsAt, lt: resetsAt } },
    });
    // An account benefit lasts for the purchased period, even if its listing
    // closes. Pending/late payments without an activated boost do not qualify.
    const boost = await tx.listingBoost.findFirst({
      where: {
        startsAt: { lte: now },
        endsAt: { gt: now },
        order: {
          userId,
          planCode: boostPlan.code,
          status: 'PAID',
          refundedAt: null,
        },
      },
      orderBy: { endsAt: 'desc' },
      select: { endsAt: true },
    });
    const limit = boost ? 8 : 3;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      startsAt,
      resetsAt,
      bonusUntil: boost?.endsAt ?? null,
    };
  }

  // Caller must hold the user lock and update the listing in this transaction.
  async consume(
    tx: Prisma.TransactionClient,
    userId: string,
    listingId: string,
  ) {
    if (await tx.listingSubmission.findUnique({ where: { listingId } })) return;
    const now = new Date();
    const quota = await this.read(tx, userId, now);
    if (quota.remaining === 0)
      throw new HttpException(
        {
          code: 'LISTING_WEEKLY_LIMIT',
          message: `Bạn đã dùng hết ${quota.limit} lượt đăng tin tìm phòng/ở ghép trong tuần.`,
          ...quota,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await tx.listingSubmission.create({
      data: { userId, listingId, createdAt: now },
    });
  }
}
