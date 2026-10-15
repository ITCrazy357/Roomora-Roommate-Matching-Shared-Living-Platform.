import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { adminPage, adminUserSelect } from './admin-views.js';
import { signalAdminChange } from './admin-signals.js';
import type { AdminReportsQuery, HandleReportDto } from './dto/admin.dto.js';

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminReportsQuery) {
    const where: Prisma.UserReportWhereInput = {
      status: query.status,
      listingId:
        query.type === 'USER'
          ? null
          : query.type === 'LISTING'
            ? { not: null }
            : undefined,
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.userReport.findMany({
          where,
          include: {
            reporter: { select: adminUserSelect },
            target: { select: adminUserSelect },
            listing: {
              select: {
                id: true,
                title: true,
                status: true,
                version: true,
                deletedAt: true,
              },
            },
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
      if (dto.removeListing) {
        if (
          !report.listingId ||
          dto.status !== 'RESOLVED' ||
          !dto.listingVersion
        )
          throw new BadRequestException({ code: 'REPORT_ACTION_INVALID' });
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${report.targetId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM listings WHERE id = ${report.listingId}::uuid FOR UPDATE`;
        const changedListing = await tx.listing.updateMany({
          where: {
            id: report.listingId,
            version: dto.listingVersion,
            status: 'PUBLISHED',
            deletedAt: null,
          },
          data: {
            status: 'REJECTED',
            rejectionReason: dto.note,
            publishedAt: null,
            postingRound: { increment: 1 },
            boostUntil: null,
            version: { increment: 1 },
          },
        });
        if (!changedListing.count)
          throw new ConflictException({ code: 'ADMIN_VERSION_CONFLICT' });
        await tx.serviceOrder.updateMany({
          where: { listingId: report.listingId, status: 'PENDING' },
          data: { status: 'EXPIRED', payUrl: null },
        });
        await tx.listingReview.create({
          data: {
            listingId: report.listingId,
            adminId: actorId,
            decision: 'REJECTED',
            reason: dto.note,
            version: dto.listingVersion,
          },
        });
      }
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
            listingId: report.listingId,
            removedListing: dto.removeListing === true,
            version: dto.version + 1,
            status: dto.status,
          },
        },
      });
      await signalAdminChange(tx, [report.reporterId, report.targetId]);
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
