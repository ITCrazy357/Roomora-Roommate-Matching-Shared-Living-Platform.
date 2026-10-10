import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../communications/notifications.service.js';
import type { HouseInfoDto } from './dto/houses.dto.js';
import { HouseDetailsService } from './house-details.service.js';
import { HouseMembershipAccessService } from './house-membership-access.service.js';

@Injectable()
export class HouseMembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly details: HouseDetailsService,
    private readonly membershipAccess: HouseMembershipAccessService,
  ) {}

  async create(userId: string, input: HouseInfoDto) {
    const house = await this.prisma.$transaction(async (tx) => {
      await this.membershipAccess.requireNoActiveHouse(tx, userId);
      const created = await tx.house.create({
        data: {
          name: input.name,
          address: input.address,
          description: input.description,
          rules: input.rules,
          ownerId: userId,
          members: { create: { userId } },
        },
      });
      await tx.houseEvent.create({
        data: { houseId: created.id, userId, actorId: userId, type: 'CREATED' },
      });
      await this.membershipAccess.saveParticipant(tx, created.id, userId);
      return created;
    });
    return this.details.get(userId, house.id);
  }

  async transfer(userId: string, id: string, targetId: string) {
    if (userId === targetId)
      throw new BadRequestException({ code: 'HOUSE_SAME_OWNER' });
    await this.prisma.$transaction(async (tx) => {
      await this.membershipAccess.lockHouse(tx, id, userId);
      await this.membershipAccess.requireOwner(tx, id, userId);
      const target = await tx.houseMember.findUnique({
        where: { houseId_userId: { houseId: id, userId: targetId } },
      });
      if (!target || target.leftAt)
        throw new BadRequestException({ code: 'HOUSE_TARGET_NOT_MEMBER' });
      await tx.house.update({ where: { id }, data: { ownerId: targetId } });
      await tx.houseEvent.create({
        data: {
          houseId: id,
          userId: targetId,
          actorId: userId,
          type: 'OWNER_TRANSFERRED',
        },
      });
      await this.notifications.create(
        tx,
        targetId,
        'HOUSE',
        'Bạn đã trở thành trưởng nhà',
        `/nha-chung/${id}`,
      );
    });
    return this.details.get(userId, id);
  }

  async leave(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.membershipAccess.lockHouse(tx, id, userId);
      const house = await tx.house.findUniqueOrThrow({
        where: { id },
        select: { ownerId: true },
      });
      if (house.ownerId === userId) {
        const memberCount = await tx.houseMember.count({
          where: { houseId: id, leftAt: null },
        });
        if (memberCount > 1)
          throw new ConflictException({ code: 'HOUSE_TRANSFER_FIRST' });
        await tx.house.update({
          where: { id },
          data: { closedAt: new Date() },
        });
        await tx.houseInvite.updateMany({
          where: { houseId: id, status: 'PENDING' },
          data: { status: 'REVOKED' },
        });
      }
      const result = await tx.houseMember.updateMany({
        where: { houseId: id, userId, leftAt: null },
        data: { leftAt: new Date() },
      });
      if (!result.count) this.membershipAccess.unavailable();
      await tx.houseEvent.create({
        data: { houseId: id, userId, actorId: userId, type: 'LEFT' },
      });
      await tx.houseParticipant.updateMany({
        where: { houseId: id, userId },
        data: { leftAt: new Date() },
      });
      const members = await tx.houseMember.findMany({
        where: { houseId: id, leftAt: null },
        select: { userId: true },
      });
      await this.notifications.signal(tx, [
        userId,
        ...members.map((member) => member.userId),
      ]);
    });
    return { left: true };
  }
}
