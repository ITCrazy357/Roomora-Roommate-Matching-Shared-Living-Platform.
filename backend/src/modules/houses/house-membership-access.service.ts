import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { IdentityService } from '../identity/identity.service.js';

@Injectable()
export class HouseMembershipAccessService {
  constructor(private readonly identity: IdentityService) {}

  async saveParticipant(
    tx: Prisma.TransactionClient,
    houseId: string,
    userId: string,
  ) {
    const profile = await tx.profile.findUnique({
      where: { userId },
      select: { displayName: true },
    });
    await tx.houseParticipant.upsert({
      where: { houseId_id: { houseId, id: userId } },
      create: {
        houseId,
        id: userId,
        userId,
        displayName: profile?.displayName ?? 'Thành viên Roomora',
      },
      update: { leftAt: null },
    });
  }

  async lockHouse(tx: Prisma.TransactionClient, id: string, userId: string) {
    const result = await tx.house.updateMany({
      where: {
        id,
        closedAt: null,
        members: { some: { userId, leftAt: null } },
      },
      data: { updatedAt: new Date() },
    });
    if (!result.count) this.unavailable();
  }

  async requireNoActiveHouse(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { lockedAt: true },
    });
    if (user.lockedAt) this.unavailable();
    const membership = await tx.houseMember.findFirst({
      where: { userId, leftAt: null },
      select: { houseId: true },
    });
    if (membership)
      throw new ConflictException({ code: 'HOUSE_ALREADY_JOINED' });
    await this.identity.requireDeclared(tx, userId);
  }

  async requireOwner(
    db: Prisma.TransactionClient | PrismaService,
    id: string,
    userId: string,
  ) {
    const house = await db.house.findFirst({
      where: {
        id,
        closedAt: null,
        ownerId: userId,
        members: { some: { userId, leftAt: null } },
      },
      select: { id: true },
    });
    if (!house) this.unavailable();
  }

  unavailable(): never {
    throw new NotFoundException({ code: 'HOUSE_NOT_FOUND' });
  }
}
