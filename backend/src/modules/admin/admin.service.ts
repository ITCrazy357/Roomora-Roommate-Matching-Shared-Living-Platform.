import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  async summary() {
    const now = new Date();
    const [
      pendingListings,
      lockedUsers,
      activeAnnouncements,
      approvedListings,
      rejectedListings,
      reports,
      refunds,
      payments,
    ] = await this.prisma.$transaction(
      [
        this.prisma.listing.count({ where: { status: 'PENDING' } }),
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
        // Count each listing once per outcome, even after multiple reviews.
        this.prisma.listing.count({
          where: { reviews: { some: { decision: 'PUBLISHED' } } },
        }),
        this.prisma.listing.count({
          where: { reviews: { some: { decision: 'REJECTED' } } },
        }),
        this.prisma.userReport.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.serviceRefundRequest.groupBy({
          by: ['status'],
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.serviceOrder.groupBy({
          by: ['status'],
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const reportCount = (status: string) =>
      reports.find((row) => row.status === status)?._count._all ?? 0;
    const refundCount = (status: string) =>
      refunds.find((row) => row.status === status)?._count._all ?? 0;
    const paid = payments.find((row) => row.status === 'PAID');
    const completed = refunds.find((row) => row.status === 'COMPLETED');
    return {
      generatedAt: now.toISOString(),
      pendingListings,
      openReports: reportCount('OPEN'),
      lockedUsers,
      activeAnnouncements,
      pendingRefunds:
        refundCount('PENDING') +
        refundCount('APPROVED') +
        refundCount('PROCESSING') +
        refundCount('FAILED'),
      listings: { approved: approvedListings, rejected: rejectedListings },
      reports: {
        resolved: reportCount('RESOLVED'),
        dismissed: reportCount('DISMISSED'),
      },
      refunds: {
        pending: refundCount('PENDING'),
        approved: refundCount('APPROVED'),
        processing: refundCount('PROCESSING'),
        completed: refundCount('COMPLETED'),
        rejected: refundCount('REJECTED'),
        failed: refundCount('FAILED'),
        completedAmount: completed?._sum.amount ?? 0,
      },
      payments: {
        paid: paid?._count._all ?? 0,
        paidAmount: paid?._sum.amount ?? 0,
        pending:
          payments.find((row) => row.status === 'PENDING')?._count._all ?? 0,
        failed:
          payments.find((row) => row.status === 'FAILED')?._count._all ?? 0,
        cancelled:
          payments.find((row) => row.status === 'CANCELLED')?._count._all ?? 0,
        expired:
          payments.find((row) => row.status === 'EXPIRED')?._count._all ?? 0,
      },
    };
  }
}
