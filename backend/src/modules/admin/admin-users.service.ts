import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { adminPage, adminUserSelect } from './admin-views.js';
import type { AccountLockDto, AdminUsersQuery } from './dto/admin.dto.js';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminUsersQuery) {
    const where: Prisma.UserWhereInput = {
      role: 'USER',
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
          action: { in: ['USER_LOCKED', 'USER_UNLOCKED'] },
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

  async setLock(actorId: string, id: string, dto: AccountLockDto) {
    if (actorId === id)
      throw new BadRequestException({ code: 'ADMIN_LOCK_FORBIDDEN' });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id },
        select: adminUserSelect,
      });
      if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
      if (user.role !== 'USER')
        throw new BadRequestException({ code: 'ADMIN_LOCK_FORBIDDEN' });
      if (
        user.moderationVersion !== dto.version ||
        Boolean(user.lockedAt) === dto.locked
      ) {
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
          lockReason: dto.locked ? dto.reason : null,
          moderationVersion: { increment: 1 },
        },
        select: adminUserSelect,
      });
      if (dto.locked) {
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
          action: dto.locked ? 'USER_LOCKED' : 'USER_UNLOCKED',
          reason: dto.reason,
          snapshot: { version: updated.moderationVersion, locked: dto.locked },
        },
      });
      return updated;
    });
  }
}
