import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { CostSharingPeriodsService } from './cost-sharing-periods.service.js';
import {
  sharingMembers,
  validateSharingShares,
  type SharingShare,
} from './cost-sharing-types.js';
import type {
  SharingVoteDto,
  SharingProposalDto,
} from './dto/cost-sharing.dto.js';

@Injectable()
export class CostSharingBallotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly periods: CostSharingPeriodsService,
  ) {}
  async vote(userId: string, houseId: string, id: string, dto: SharingVoteDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      await this.access.active(tx, userId, houseId);
      const row = await this.periods.get(tx, houseId, id),
        round = row.rounds[0],
        members = await sharingMembers(tx, houseId);
      // Successful duplicate requests are harmless, including after the last vote closed the round.
      const previous = await tx.costSharingVote.findUnique({
        where: { roundId_userId: { roundId: dto.roundId, userId } },
      });
      if (round.id === dto.roundId && previous?.choice === dto.choice)
        return row;
      this.periods.assertOpen(row, dto.roundId, members);
      if (round.status === 'REJECTED')
        throw new ConflictException({ code: 'SHARING_PROPOSAL_REJECTED' });
      const valid =
        round.phase === 'PREFERENCE'
          ? ['EQUAL', 'WEIGHTED']
          : ['AGREE', 'REJECT'];
      if (!valid.includes(dto.choice))
        throw new BadRequestException({ code: 'SHARING_VOTE_INVALID' });
      if ((previous?.version ?? 0) !== dto.version)
        throw new ConflictException({ code: 'SHARING_VOTE_CHANGED' });
      const version = dto.version + 1;
      await tx.costSharingVote.upsert({
        where: { roundId_userId: { roundId: round.id, userId } },
        create: { roundId: round.id, userId, choice: dto.choice, version },
        update: { choice: dto.choice, version },
      });
      await tx.costSharingVoteEvent.create({
        data: { roundId: round.id, userId, choice: dto.choice, version },
      });
      const votes = await tx.costSharingVote.findMany({
        where: { roundId: round.id },
      });
      if (dto.choice === 'REJECT')
        await tx.costSharingRound.update({
          where: { id: round.id },
          data: { status: 'REJECTED', resolvedAt: new Date() },
        });
      else if (
        votes.length === members.length &&
        votes.every(
          (vote) =>
            vote.choice === (round.phase === 'PREFERENCE' ? 'EQUAL' : 'AGREE'),
        )
      ) {
        const mode = round.phase === 'PREFERENCE' ? 'EQUAL' : round.mode!;
        const shares =
          round.phase === 'PREFERENCE'
            ? members.map((member) => ({
                participantId: member.participantId,
                basisPoints: 0,
              }))
            : (round.shares as unknown as SharingShare[]);
        await this.periods.agree(tx, row, mode, shares);
      }
      await this.periods.signal(tx, houseId);
      return this.periods.get(tx, houseId, id);
    });
  }
  async proposal(
    userId: string,
    houseId: string,
    id: string,
    dto: SharingProposalDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      await this.access.active(tx, userId, houseId);
      const row = await this.periods.get(tx, houseId, id),
        round = row.rounds[0],
        members = await sharingMembers(tx, houseId);
      this.periods.assertOpen(row, dto.roundId, members);
      if (
        round.phase === 'PREFERENCE'
          ? !round.votes.some((vote) => vote.choice === 'WEIGHTED')
          : round.status !== 'REJECTED'
      )
        throw new ConflictException({ code: 'SHARING_PROPOSAL_NOT_READY' });
      const shares = validateSharingShares(dto.mode, dto.shares, members);
      if (row.currentRound >= 100)
        throw new ConflictException({ code: 'SHARING_ROUND_LIMIT' });
      if (round.status === 'OPEN')
        await tx.costSharingRound.update({
          where: { id: round.id },
          data: { status: 'SUPERSEDED', resolvedAt: new Date() },
        });
      await tx.costSharingRound.create({
        data: {
          periodId: id,
          number: row.currentRound + 1,
          phase: 'PROPOSAL',
          members: round.members as Prisma.InputJsonValue,
          memberHash: round.memberHash,
          mode: dto.mode,
          shares: shares as unknown as Prisma.InputJsonValue,
          reason: dto.reason,
          createdById: userId,
        },
      });
      await tx.costSharingPeriod.update({
        where: { id },
        data: { currentRound: { increment: 1 } },
      });
      await this.periods.signal(
        tx,
        houseId,
        'Có đề xuất chia chi phí mới; hãy xem tỷ lệ và bình chọn.',
      );
      return this.periods.get(tx, houseId, id);
    });
  }
}
