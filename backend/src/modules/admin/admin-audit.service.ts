import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { adminPage } from './admin-views.js';
import type { AdminAuditQuery } from './dto/admin.dto.js';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: AdminAuditQuery) {
    const where = { entityId: query.entityId, action: query.action };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.adminAction.findMany({
          where,
          include: {
            actor: {
              select: { id: true, profile: { select: { displayName: true } } },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.adminAction.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return adminPage(items, total, query);
  }
}
