import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  async summary() {
    const now = new Date();
    const [
      pendingListings,
      openReports,
      lockedUsers,
      activeAnnouncements,
      pendingRefunds,
    ] = await this.prisma.$transaction(
      [
        this.prisma.listing.count({ where: { status: 'PENDING' } }),
        this.prisma.userReport.count({ where: { status: 'OPEN' } }),
        this.prisma.user.count({
          where: { role: 'USER', lockedAt: { not: null } },
        }),
        this.prisma.systemAnnouncement.count({
          where: {
            published: true,
            displayFrom: { lte: now },
            displayUntil: { gt: now },
          },
        }),
        this.prisma.serviceRefundRequest.count({
          where: {
            status: { in: ['PENDING', 'APPROVED', 'PROCESSING', 'FAILED'] },
          },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      pendingListings,
      openReports,
      lockedUsers,
      activeAnnouncements,
      pendingRefunds,
    };
  }
}
