import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { calculateHouseBalances } from '../expenses/expense-ledger.js';
import { AuthOtpService } from './auth-otp.service.js';
import type { AccountClosureDto } from './dto/account-closure.dto.js';

@Injectable()
export class AccountClosureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: AuthOtpService,
  ) {}

  async request(userId: string, request: Request) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.role !== 'USER')
      throw new ForbiddenException({ code: 'ACCOUNT_CLOSURE_FORBIDDEN' });
    return this.otp.issue(user.email, 'ACCOUNT_CLOSURE', request);
  }

  close(userId: string, dto: AccountClosureDto, request: Request) {
    return this.otp.consume(
      dto,
      'ACCOUNT_CLOSURE',
      request,
      async (tx, user) => {
        if (user.id !== userId)
          throw new ForbiddenException({ code: 'TOKEN_INVALID' });
        await this.requireSettled(tx, userId);
        const now = new Date();
        // Keep historical references. lockedAt also applies every existing public filter.
        await tx.user.update({
          where: { id: userId },
          data: {
            closedAt: now,
            lockedAt: now,
            lockReason: 'Người dùng đã đóng tài khoản',
            moderationVersion: { increment: 1 },
          },
        });
        await tx.profile.updateMany({
          where: { userId },
          data: {
            visibility: 'PRIVATE',
            showBudget: false,
            showDesiredAreas: false,
            showLifestyle: false,
          },
        });
        await tx.listing.updateMany({
          where: { ownerId: userId, status: { not: 'CLOSED' } },
          data: {
            status: 'CLOSED',
            postingRound: { increment: 1 },
            boostUntil: null,
            version: { increment: 1 },
          },
        });
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.authToken.updateMany({
          where: { userId, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.authOtp.updateMany({
          where: { userId, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.houseInvite.updateMany({
          where: { email: user.email, status: 'PENDING' },
          data: { status: 'REVOKED' },
        });
        // Disable connection actions and keep conversation records for history.
        await tx.connection.updateMany({
          where: {
            OR: [{ senderId: userId }, { receiverId: userId }],
            status: { in: ['PENDING', 'ACCEPTED'] },
          },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });
        const appointments = await tx.appointment.findMany({
          where: {
            conversation: {
              connection: {
                OR: [{ senderId: userId }, { receiverId: userId }],
              },
            },
            status: { in: ['PENDING', 'CONFIRMED'] },
            startsAt: { gt: now },
          },
        });
        for (const item of appointments) {
          const changed = await tx.appointment.updateMany({
            where: { id: item.id, version: item.version },
            data: { status: 'CANCELLED', version: { increment: 1 } },
          });
          if (!changed.count)
            throw new ConflictException({ code: 'ACCOUNT_CLOSURE_CHANGED' });
          await tx.appointmentChange.create({
            data: {
              appointmentId: item.id,
              actorId: userId,
              version: item.version + 1,
              status: 'CANCELLED',
              startsAt: item.startsAt,
              place: item.place,
              note: 'Tài khoản đã đóng',
            },
          });
        }
        await tx.adminAction.create({
          data: {
            actorId: userId,
            entityId: userId,
            action: 'ACCOUNT_CLOSED',
            snapshot: { closedAt: now.toISOString() },
          },
        });
        await tx.$executeRaw`SELECT pg_notify('roomora_updates', ${JSON.stringify([userId])})`;
        return { closed: true };
      },
    );
  }

  private async requireSettled(tx: Prisma.TransactionClient, userId: string) {
    if (await tx.houseMember.count({ where: { userId, leftAt: null } }))
      throw new ConflictException({
        code: 'ACCOUNT_HAS_HOUSE',
        message: 'Chuyển quyền trưởng nhà và rời nhà trước khi đóng tài khoản.',
      });
    const people = await tx.houseParticipant.findMany({
      where: { userId },
      orderBy: { houseId: 'asc' },
    });
    for (const person of people) {
      await tx.$queryRaw`SELECT id FROM houses WHERE id = ${person.houseId}::uuid FOR UPDATE`;
      const balance = (await calculateHouseBalances(tx, person.houseId)).find(
        (row) => row.id === person.id,
      );
      if (
        balance &&
        (balance.balance !== 0 ||
          balance.pendingSent ||
          balance.pendingReceived)
      )
        throw new ConflictException({
          code: 'ACCOUNT_HAS_DEBT',
          message:
            'Hoàn tất công nợ và các khoản chuyển tiền đang chờ trong nhà cũ.',
        });
    }
    if (
      await tx.serviceOrder.count({
        where: {
          userId,
          OR: [
            { status: 'PENDING' },
            {
              refund: {
                status: { in: ['PENDING', 'APPROVED', 'PROCESSING', 'FAILED'] },
              },
            },
          ],
        },
      })
    )
      throw new ConflictException({
        code: 'ACCOUNT_HAS_PAYMENT',
        message:
          'Hoàn tất đối soát thanh toán hoặc hoàn tiền trước khi đóng tài khoản.',
      });
  }
}
