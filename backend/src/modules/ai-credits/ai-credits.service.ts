import {
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { AiCreditUse, Prisma } from '../../generated/prisma/client.js';

export const aiCreditPlan = {
  code: 'AI_50_CREDITS',
  name: 'Gói AI 50 lượt',
  amount: 59000,
  credits: 50,
  durationDays: 0,
  currency: 'VND',
} as const;
export const freeAiCredits = 5;

@Injectable()
export class AiCreditsService {
  constructor(private readonly prisma: PrismaService) {}

  private async lock(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    return tx.aiWallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  // Hồi phục lượt đã giữ nếu process chết; request provider chỉ chờ tối đa 20s.
  private async recover(tx: Prisma.TransactionClient, userId: string) {
    const stale = await tx.aiCreditUse.findMany({
      where: {
        userId,
        status: 'PENDING',
        createdAt: { lt: new Date(Date.now() - 120000) },
      },
    });
    for (const use of stale) await this.releaseIn(tx, use);
  }

  async usage(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId);
      await this.recover(tx, userId);
      const wallet = await tx.aiWallet.findUniqueOrThrow({ where: { userId } });
      const packs = await tx.aiCreditPack.findMany({
        where: { userId, revokedAt: null, held: false, used: { lt: 50 } },
      });
      const freeRemaining = freeAiCredits - wallet.freeUsed;
      const paidRemaining = packs.reduce(
        (sum, pack) => sum + pack.credits - pack.used,
        0,
      );
      return {
        freeTotal: freeAiCredits,
        freeRemaining,
        paidRemaining,
        remaining: freeRemaining + paidRemaining,
        plan: aiCreditPlan,
      };
    });
  }

  async reserve(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { role: true, lockedAt: true, closedAt: true },
      });
      if (user.role !== 'USER' || user.lockedAt || user.closedAt)
        throw new ForbiddenException({ code: 'AI_ACCOUNT_UNAVAILABLE' });
      await this.recover(tx, userId);
      const wallet = await tx.aiWallet.findUniqueOrThrow({ where: { userId } });
      let packId: string | null = null;
      if (wallet.freeUsed < freeAiCredits) {
        await tx.aiWallet.update({
          where: { userId },
          data: { freeUsed: { increment: 1 } },
        });
      } else {
        const pack = await tx.aiCreditPack.findFirst({
          where: { userId, held: false, revokedAt: null, used: { lt: 50 } },
          orderBy: [{ createdAt: 'asc' }, { orderId: 'asc' }],
        });
        if (!pack)
          throw new HttpException(
            {
              code: 'AI_LIMIT_REACHED',
              message: 'Đã hết lượt AI. Mua gói 59.000đ để có thêm 50 lượt.',
            },
            429,
          );
        packId = pack.orderId;
        await tx.aiCreditPack.update({
          where: { orderId: packId },
          data: { used: { increment: 1 } },
        });
      }
      return tx.aiCreditUse.create({ data: { userId, packId } });
    });
  }

  async complete(
    use: AiCreditUse,
    save?: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, use.userId);
      const changed = await tx.aiCreditUse.updateMany({
        where: { id: use.id, status: 'PENDING' },
        data: { status: 'COMPLETED' },
      });
      if (!changed.count)
        throw new ServiceUnavailableException({ code: 'AI_UNAVAILABLE' });
      if (save) await save(tx);
    });
  }

  async release(use: AiCreditUse) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, use.userId);
      await this.releaseIn(tx, use);
    });
  }

  private async releaseIn(tx: Prisma.TransactionClient, use: AiCreditUse) {
    const changed = await tx.aiCreditUse.updateMany({
      where: { id: use.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    if (!changed.count) return;
    if (use.packId)
      await tx.aiCreditPack.update({
        where: { orderId: use.packId },
        data: { used: { decrement: 1 } },
      });
    else
      await tx.aiWallet.update({
        where: { userId: use.userId },
        data: { freeUsed: { decrement: 1 } },
      });
  }
}
