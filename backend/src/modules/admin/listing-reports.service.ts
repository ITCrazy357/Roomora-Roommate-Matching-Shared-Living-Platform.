import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { ReportUserDto } from '../people/dto/people.dto.js';

@Injectable()
export class ListingReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, id: string, dto: ReportUserDto) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize duplicate submissions and the daily limit with account closure.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

      if (user.lockedAt)
        throw new BadRequestException({ code: 'ACCOUNT_LOCKED' });
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${id}::uuid FOR UPDATE`;

      const listing = await tx.listing.findFirst({
        where: {
          id,
          status: 'PUBLISHED',
          deletedAt: null,
          owner: { lockedAt: null },
        },
        select: {
          id: true,
          ownerId: true,
          title: true,
          description: true,
          type: true,
          rent: true,
          version: true,
        },
      });

      if (!listing) throw new NotFoundException({ code: 'LISTING_NOT_FOUND' });

      if (listing.ownerId === userId)
        throw new BadRequestException({ code: 'SELF_REPORT_NOT_ALLOWED' });

      if (
        await tx.userReport.count({
          where: { reporterId: userId, listingId: id },
        })
      )
        throw new ConflictException({ code: 'REPORT_EXISTS' });
      const count = await tx.userReport.count({
        where: {
          reporterId: userId,
          createdAt: { gt: new Date(Date.now() - 86400000) },
        },
      });

      if (count >= 5) throw new HttpException({ code: 'RATE_LIMITED' }, 429);
      const report = await tx.userReport.create({
        data: {
          reporterId: userId,
          targetId: listing.ownerId,
          listingId: id,
          listingSnapshot: listing,
          reason: dto.reason,
          details: dto.details,
        },
      });

      return { id: report.id, status: report.status };
    });
  }
}
