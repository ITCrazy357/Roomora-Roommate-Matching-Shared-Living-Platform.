import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { ExpenseEventsService } from './expense-events.service.js';
import { personSelect, participantView } from './expense-views.js';

@Injectable()
export class ExpenseParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly events: ExpenseEventsService,
  ) {}

  async list(userId: string, houseId: string) {
    const house = await this.access.active(this.prisma, userId, houseId);
    const items = await this.prisma.houseParticipant.findMany({
      where: { houseId },
      select: personSelect,
      orderBy: { createdAt: 'asc' },
    });
    return {
      items: items.map((row) => participantView(row)),
      ownerId: house.ownerId,
    };
  }

  async addGuest(userId: string, houseId: string, displayName: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      if (house.ownerId !== userId)
        throw new ForbiddenException({ code: 'EXPENSE_FORBIDDEN' });
      if (
        (await tx.houseParticipant.count({
          where: { houseId, leftAt: null },
        })) >= 100
      )
        throw new BadRequestException({ code: 'PARTICIPANT_LIMIT' });
      const person = await tx.houseParticipant.create({
        data: { houseId, displayName },
        select: personSelect,
      });
      await this.events.signal(tx, houseId);
      return participantView(person);
    });
  }

  async removeGuest(userId: string, houseId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      if (house.ownerId !== userId)
        throw new ForbiddenException({ code: 'EXPENSE_FORBIDDEN' });
      const result = await tx.houseParticipant.updateMany({
        where: { houseId, id, userId: null, leftAt: null },
        data: { leftAt: new Date() },
      });
      if (!result.count)
        throw new NotFoundException({ code: 'PARTICIPANT_NOT_FOUND' });
      await this.events.signal(tx, houseId);
      return { removed: true };
    });
  }

  async historyHouses(userId: string) {
    return this.prisma.house.findMany({
      where: { members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        closedAt: true,
        members: { where: { userId }, select: { leftAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
