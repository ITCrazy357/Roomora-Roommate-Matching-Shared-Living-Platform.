import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class PeopleAccessService {
  constructor(private readonly prisma: PrismaService) {}

  getPairKey(userId: string, targetId: string) {
    return [userId.toLowerCase(), targetId.toLowerCase()].sort().join(':');
  }

  async cancelAppointments(
    tx: Prisma.TransactionClient,
    userId: string,
    pairKey: string,
    startsAfter?: Date,
  ) {
    const appointments = await tx.appointment.findMany({
      where: {
        conversation: { connection: { pairKey } },
        status: { in: ['PENDING', 'CONFIRMED'] },
        startsAt: startsAfter ? { gt: startsAfter } : undefined,
      },
    });
    if (!appointments.length) return;
    await tx.appointment.updateMany({
      where: { id: { in: appointments.map((item) => item.id) } },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    });
    await tx.appointmentChange.createMany({
      data: appointments.map((item) => ({
        appointmentId: item.id,
        actorId: userId,
        version: item.version + 1,
        status: 'CANCELLED' as const,
        startsAt: item.startsAt,
        place: item.place,
        note: item.note,
      })),
    });
  }

  async isBlocked(
    tx: Prisma.TransactionClient,
    userId: string,
    targetId: string,
  ) {
    return Boolean(
      await tx.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, targetId },
            { blockerId: targetId, targetId: userId },
          ],
        },
        select: { blockerId: true },
      }),
    );
  }

  async withUserLocks<T>(
    userId: string,
    targetId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock both users in a stable order for connection and conversation changes.
      const users = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE id IN (${userId}::uuid, ${targetId}::uuid) ORDER BY id FOR UPDATE`;
      if (users.length !== 2) this.unavailable();
      if (
        await tx.user.count({ where: { id: userId, lockedAt: { not: null } } })
      )
        this.unavailable();
      return work(tx);
    });
  }

  assertDifferentUsers(userId: string, targetId: string) {
    if (userId.toLowerCase() === targetId.toLowerCase())
      throw new BadRequestException({
        code: 'SELF_CONNECTION',
        message: 'Không thể thực hiện với chính mình',
      });
  }

  unavailable(): never {
    throw new NotFoundException({
      code: 'PERSON_UNAVAILABLE',
      message: 'Không thể truy cập hồ sơ hoặc kết nối',
    });
  }

  rateLimit(): never {
    throw new HttpException(
      {
        code: 'RATE_LIMITED',
        message: 'Bạn đã thao tác quá nhiều. Vui lòng thử lại sau',
      },
      429,
    );
  }
}
