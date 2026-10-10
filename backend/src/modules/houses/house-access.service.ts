import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class HouseAccessService {
  async finance(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
    houseId: string,
  ) {
    const house = await db.house.findFirst({
      where: { id: houseId, members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        ownerId: true,
        closedAt: true,
        members: { where: { userId }, select: { leftAt: true } },
      },
    });
    if (!house) throw new NotFoundException({ code: 'HOUSE_NOT_FOUND' });
    return { ...house, active: !house.closedAt && !house.members[0].leftAt };
  }

  async active(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
    houseId: string,
  ) {
    const house = await this.finance(db, userId, houseId);
    if (!house.active) throw new NotFoundException({ code: 'HOUSE_NOT_FOUND' });
    return house;
  }

  async lock(tx: Prisma.TransactionClient, houseId: string) {
    // The same row serializes leaving, invites and ownership changes.
    await tx.$queryRaw`SELECT id FROM houses WHERE id = ${houseId}::uuid FOR UPDATE`;
  }
}
