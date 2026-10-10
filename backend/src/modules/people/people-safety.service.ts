import { ConflictException, Injectable } from '@nestjs/common';
import { NotificationsService } from '../communications/notifications.service.js';
import type { ReportUserDto } from '../people/dto/people.dto.js';
import { PeopleAccessService } from './people-access.service.js';

@Injectable()
export class PeopleSafetyService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly access: PeopleAccessService,
  ) {}

  async block(userId: string, targetId: string) {
    this.access.assertDifferentUsers(userId, targetId);
    return this.access.withUserLocks(userId, targetId, async (tx) => {
      await tx.userBlock.createMany({
        data: [{ blockerId: userId, targetId }],
        skipDuplicates: true,
      });
      await tx.connection.updateMany({
        where: {
          pairKey: this.access.getPairKey(userId, targetId),
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
      await this.access.cancelAppointments(
        tx,
        userId,
        this.access.getPairKey(userId, targetId),
      );
      await this.notifications.signal(tx, [userId, targetId]);
      return { blocked: true };
    });
  }

  async unblock(userId: string, targetId: string) {
    return this.access.withUserLocks(userId, targetId, async (tx) => {
      await tx.userBlock.deleteMany({ where: { blockerId: userId, targetId } });
      return { blocked: false };
    });
  }

  async report(userId: string, targetId: string, dto: ReportUserDto) {
    this.access.assertDifferentUsers(userId, targetId);
    return this.access.withUserLocks(userId, targetId, async (tx) => {
      const existing = await tx.userReport.findUnique({
        where: { reporterId_targetId: { reporterId: userId, targetId } },
      });
      if (existing)
        throw new ConflictException({
          code: 'REPORT_EXISTS',
          message: 'Bạn đã báo cáo người dùng này',
        });
      const count = await tx.userReport.count({
        where: {
          reporterId: userId,
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) },
        },
      });
      if (count >= 5) this.access.rateLimit();
      const report = await tx.userReport.create({
        data: {
          reporterId: userId,
          targetId,
          reason: dto.reason,
          details: dto.details,
        },
      });
      return { id: report.id, status: report.status };
    });
  }
}
