import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { AdminSummaryQuery } from './dto/admin.dto.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  async summary(query: AdminSummaryQuery = {}) {
    const now = new Date();
    // Calendar months in Vietnam, with an inclusive start and exclusive end.
    const offset = 7 * 3600000;
    const month =
      query.month ?? new Date(now.getTime() + offset).toISOString().slice(0, 7);
    const [year, number] = month.split('-').map(Number);
    const from = new Date(Date.UTC(year, number - 1, 1) - offset);
    const to = new Date(Date.UTC(year, number, 1) - offset);
    const period = { gte: from, lt: to };
    const [
      pendingListings,
      lockedUsers,
      activeAnnouncements,
      approvedListings,
      rejectedListings,
      reports,
      refunds,
      payments,
      currentPendingListings,
      currentOpenReports,
      currentPendingRefunds,
      processedListings,
      registeredUsers,
      totalUsers,
      createdListings,
      connections,
      openSupport,
    ] = await this.prisma.$transaction(
      [
        this.prisma.listing.count({
          where: { status: 'PENDING', submittedAt: period },
        }),
        this.prisma.adminAction.findMany({
          where: { action: 'USER_LOCKED', createdAt: period },
          select: { entityId: true },
          distinct: ['entityId'],
        }),
        this.prisma.systemAnnouncement.count({
          where: {
            published: true,
            displayFrom: { lt: to },
            displayUntil: { gt: from },
          },
        }),
        // Count each listing once per outcome, even after multiple reviews.
        this.prisma.listing.count({
          where: {
            reviews: { some: { decision: 'PUBLISHED', createdAt: period } },
          },
        }),
        this.prisma.listing.count({
          where: {
            reviews: { some: { decision: 'REJECTED', createdAt: period } },
          },
        }),
        this.prisma.userReport.groupBy({
          by: ['status'],
          where: {
            OR: [
              { status: 'OPEN', createdAt: period },
              { status: { in: ['RESOLVED', 'DISMISSED'] }, handledAt: period },
            ],
          },
          _count: { _all: true },
        }),
        this.prisma.serviceRefundRequest.groupBy({
          by: ['status'],
          where: {
            OR: [
              { status: 'COMPLETED', completedAt: period },
              {
                status: 'REJECTED',
                actions: { some: { toStatus: 'REJECTED', createdAt: period } },
              },
              {
                status: { in: ['PENDING', 'APPROVED', 'PROCESSING', 'FAILED'] },
                createdAt: period,
              },
            ],
          },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.serviceOrder.groupBy({
          by: ['status'],
          where: {
            OR: [
              { status: 'PAID', paidAt: period },
              { status: { not: 'PAID' }, createdAt: period },
            ],
          },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        // Operational pages retain the complete current queue across months.
        this.prisma.listing.count({ where: { status: 'PENDING' } }),
        this.prisma.userReport.count({ where: { status: 'OPEN' } }),
        this.prisma.serviceRefundRequest.count({
          where: {
            status: { in: ['PENDING', 'APPROVED', 'PROCESSING', 'FAILED'] },
          },
        }),
        // A listing reviewed several times still represents one processed item.
        this.prisma.listing.count({
          where: {
            reviews: {
              some: {
                decision: { in: ['PUBLISHED', 'REJECTED'] },
                createdAt: period,
              },
            },
          },
        }),
        this.prisma.user.count({ where: { role: 'USER', createdAt: period } }),
        this.prisma.user.count({
          where: { role: 'USER', createdAt: { lt: to } },
        }),
        this.prisma.listing.count({
          where: { createdAt: period, deletedAt: null },
        }),
        // Current outcomes of pairs created in this month, not acceptance events.
        this.prisma.connection.groupBy({
          by: ['status'],
          where: { createdAt: period },
          _count: { _all: true },
        }),
        this.prisma.supportTicket.count({
          where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] } },
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
    const processedReports = reportCount('RESOLVED') + reportCount('DISMISSED');
    const processedRefunds = refundCount('COMPLETED') + refundCount('REJECTED');
    return {
      generatedAt: now.toISOString(),
      period: {
        month,
        timeZone: 'Asia/Ho_Chi_Minh',
        from: from.toISOString(),
        to: to.toISOString(),
      },
      currentQueues: {
        pendingListings: currentPendingListings,
        openReports: currentOpenReports,
        pendingRefunds: currentPendingRefunds,
        openSupport,
      },
      users: { registered: registeredUsers, total: totalUsers },
      activity: {
        createdListings,
        connections: connections.reduce((sum, row) => sum + row._count._all, 0),
        acceptedConnections:
          connections.find((row) => row.status === 'ACCEPTED')?._count._all ??
          0,
      },
      revenue: {
        receivedAmount: paid?._sum.amount ?? 0,
        refundAmount: -(completed?._sum.amount ?? 0),
        netAmount: (paid?._sum.amount ?? 0) - (completed?._sum.amount ?? 0),
      },
      processed: {
        listings: processedListings,
        reports: processedReports,
        refunds: processedRefunds,
        total: processedListings + processedReports + processedRefunds,
      },
      pendingListings,
      openReports: reportCount('OPEN'),
      lockedUsers: lockedUsers.length,
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
