import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { adminPage, adminUserSelect } from './admin-views.js';
import type {
  AccountLockDto,
  AccountRestoreDto,
  AdminUsersQuery,
} from './dto/admin.dto.js';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminUsersQuery) {
    const where: Prisma.UserWhereInput = {
      role: 'USER',
      closedAt:
        query.status === 'CLOSED'
          ? { not: null }
          : query.status
            ? null
            : undefined,
      lockedAt:
        query.status === 'LOCKED'
          ? { not: null }
          : query.status === 'ACTIVE'
            ? null
            : undefined,
      OR: query.search
        ? [
            { email: { contains: query.search, mode: 'insensitive' } },
            {
              profile: {
                displayName: { contains: query.search, mode: 'insensitive' },
              },
            },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.user.findMany({
          where,
          select: adminUserSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.user.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return adminPage(items, total, query);
  }

  async history(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: 'USER' },
      select: adminUserSelect,
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    return {
      user,
      actions: await this.prisma.adminAction.findMany({
        where: {
          entityId: id,
          action: {
            in: [
              'USER_LOCKED',
              'USER_UNLOCKED',
              'ACCOUNT_CLOSED',
              'ACCOUNT_REOPENED',
            ],
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        include: {
          actor: {
            select: { id: true, profile: { select: { displayName: true } } },
          },
        },
      }),
    };
  }

  restore(actorId: string, id: string, dto: AccountRestoreDto) {
    return this.setLock(
      actorId,
      id,
      { version: dto.version, reason: dto.reason, locked: false },
      true,
    );
  }

  async setLock(
    actorId: string,
    id: string,
    dto: AccountLockDto,
    restore = false,
  ) {
    if (actorId === id)
      throw new BadRequestException({ code: 'ADMIN_LOCK_FORBIDDEN' });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id },
        select: adminUserSelect,
      });
      if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
      if (user.role !== 'USER' || (user.closedAt && !restore))
        throw new BadRequestException({ code: 'ADMIN_LOCK_FORBIDDEN' });
      if (user.moderationVersion !== dto.version)
        throw new ConflictException({ code: 'ADMIN_VERSION_CONFLICT' });
      if (restore && !user.closedAt)
        throw new BadRequestException({ code: 'ACCOUNT_NOT_CLOSED' });
      if (Boolean(user.lockedAt) === dto.locked) {
        throw new ConflictException({
          code: 'ADMIN_VERSION_CONFLICT',
          message: 'Tài khoản đã thay đổi, hãy tải lại',
        });
      }
      const now = new Date();
      const updated = await tx.user.update({
        where: { id },
        data: {
          lockedAt: dto.locked ? now : null,
          closedAt: restore ? null : undefined,
          lockReason: dto.locked ? dto.reason : null,
          moderationVersion: { increment: 1 },
        },
        select: adminUserSelect,
      });
      if (dto.locked) {
        await tx.authOtp.updateMany({
          where: { userId: id, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.authToken.updateMany({
          where: { userId: id, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.$executeRaw`SELECT pg_notify('roomora_updates', ${JSON.stringify([id])})`;
      }
      await tx.adminAction.create({
        data: {
          actorId,
          entityId: id,
          action: restore
            ? 'ACCOUNT_REOPENED'
            : dto.locked
              ? 'USER_LOCKED'
              : 'USER_UNLOCKED',
          reason: dto.reason,
          snapshot: { version: updated.moderationVersion, locked: dto.locked },
        },
      });
      return updated;
    });
  }
}
