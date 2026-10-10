import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../communications/notifications.service.js';

export function contentHash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
export function dateOnly(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

@Injectable()
export class HouseholdAccessService {
  constructor(private readonly notifications: NotificationsService) {}

  editable(userId: string, ownerId: string, createdById: string) {
    if (userId !== ownerId && userId !== createdById)
      throw new ForbiddenException({ code: 'HOUSEHOLD_FORBIDDEN' });
  }
  version(actual: number, requested: number) {
    if (actual !== requested)
      throw new ConflictException({ code: 'HOUSEHOLD_CHANGED' });
  }
  async people(tx: Prisma.TransactionClient, houseId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const people = await tx.houseParticipant.findMany({
      where: { houseId, id: { in: unique }, leftAt: null },
      select: { id: true, userId: true },
    });
    if (people.length !== unique.length)
      throw new BadRequestException({ code: 'EXPENSE_MEMBER_NOT_ACTIVE' });
    return people;
  }
  async signal(tx: Prisma.TransactionClient, houseId: string) {
    const members = await tx.houseMember.findMany({
      where: { houseId, leftAt: null },
      select: { userId: true },
    });
    await this.notifications.signal(
      tx,
      members.map((member) => member.userId),
    );
  }
  async notify(
    tx: Prisma.TransactionClient,
    userId: string,
    title: string,
    houseId: string,
  ) {
    await this.notifications.create(
      tx,
      userId,
      'HOUSE',
      title,
      `/nha-chung/${houseId}/sinh-hoat`,
    );
  }
}
