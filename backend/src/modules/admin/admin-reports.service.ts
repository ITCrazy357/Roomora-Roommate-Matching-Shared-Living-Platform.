import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { adminPage, adminUserSelect } from './admin-views.js';
import type { AdminReportsQuery, HandleReportDto } from './dto/admin.dto.js';

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminReportsQuery) {
    const where = { status: query.status };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.userReport.findMany({
          where,
          include: {
            reporter: { select: adminUserSelect },
            target: { select: adminUserSelect },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.userReport.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return adminPage(items, total, query);
  }

  async handle(actorId: string, id: string, dto: HandleReportDto) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.userReport.findUnique({ where: { id } });
      if (!report) throw new NotFoundException({ code: 'REPORT_NOT_FOUND' });
      const changed = await tx.userReport.updateMany({
        where: { id, status: 'OPEN', version: dto.version },
        data: {
          status: dto.status,
          handledAt: new Date(),
          handlingNote: dto.note,
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException({ code: 'ADMIN_VERSION_CONFLICT' });
      await tx.adminAction.create({
        data: {
          actorId,
          entityId: id,
          action: `REPORT_${dto.status}`,
          reason: dto.note,
          snapshot: {
            targetId: report.targetId,
            version: dto.version + 1,
            status: dto.status,
          },
        },
      });
      return tx.userReport.findUniqueOrThrow({ where: { id } });
    });
  }

  async history(id: string) {
    if (!(await this.prisma.userReport.count({ where: { id } })))
      throw new NotFoundException({ code: 'REPORT_NOT_FOUND' });
    return {
      actions: await this.prisma.adminAction.findMany({
        where: { entityId: id },
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
}
