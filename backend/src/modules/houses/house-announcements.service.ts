import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { HouseAnnouncementDto } from './dto/houses.dto.js';
import { HouseDetailsService } from './house-details.service.js';
import { HouseMembershipAccessService } from './house-membership-access.service.js';

@Injectable()
export class HouseAnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly details: HouseDetailsService,
    private readonly membershipAccess: HouseMembershipAccessService,
  ) {}

  async announce(userId: string, id: string, input: HouseAnnouncementDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.membershipAccess.lockHouse(tx, id, userId);
      if (input.pinned)
        await this.membershipAccess.requireOwner(tx, id, userId);
      await tx.houseAnnouncement.create({
        data: {
          houseId: id,
          authorId: userId,
          text: input.text,
          pinned: input.pinned,
        },
      });
    });
    return this.details.get(userId, id);
  }

  async removeAnnouncement(userId: string, id: string, announcementId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.membershipAccess.lockHouse(tx, id, userId);
      const item = await tx.houseAnnouncement.findFirst({
        where: { id: announcementId, houseId: id },
      });
      if (!item) this.membershipAccess.unavailable();
      if (item.authorId !== userId)
        await this.membershipAccess.requireOwner(tx, id, userId);
      await tx.houseAnnouncement.delete({ where: { id: announcementId } });
    });
    return this.details.get(userId, id);
  }
}
