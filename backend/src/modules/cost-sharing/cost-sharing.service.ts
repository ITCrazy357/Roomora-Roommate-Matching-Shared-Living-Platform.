import { Injectable } from '@nestjs/common';
import type { ExpenseCategory } from '../../generated/prisma/client.js';
import { CostSharingPeriodsService } from './cost-sharing-periods.service.js';
import { CostSharingBallotsService } from './cost-sharing-ballots.service.js';
import { CostSharingRulesService } from './cost-sharing-rules.service.js';
import type {
  SharingDefaultDto,
  SharingProposalDto,
  SharingReopenDto,
  SharingSettingDto,
  SharingVoteDto,
} from './dto/cost-sharing.dto.js';
import type { ExpenseQueryDto } from '../expenses/dto/expenses.dto.js';
@Injectable()
export class CostSharingService {
  constructor(
    private readonly periods: CostSharingPeriodsService,
    private readonly ballots: CostSharingBallotsService,
    private readonly rules: CostSharingRulesService,
  ) {}
  list(userId: string, houseId: string, month: string) {
    return this.periods.list(userId, houseId, month);
  }
  history(userId: string, houseId: string, id: string, query: ExpenseQueryDto) {
    return this.periods.history(userId, houseId, id, query);
  }
  setting(
    userId: string,
    houseId: string,
    category: ExpenseCategory,
    dto: SharingSettingDto,
  ) {
    return this.periods.setting(userId, houseId, category, dto);
  }
  openDefault(userId: string, houseId: string, dto: SharingDefaultDto) {
    return this.periods.openDefault(userId, houseId, dto);
  }
  reopen(userId: string, houseId: string, id: string, dto: SharingReopenDto) {
    return this.periods.reopen(userId, houseId, id, dto);
  }
  vote(userId: string, houseId: string, id: string, dto: SharingVoteDto) {
    return this.ballots.vote(userId, houseId, id, dto);
  }
  proposal(
    userId: string,
    houseId: string,
    id: string,
    dto: SharingProposalDto,
  ) {
    return this.ballots.proposal(userId, houseId, id, dto);
  }
  rule(
    userId: string,
    houseId: string,
    month: string,
    category: ExpenseCategory,
  ) {
    return this.rules.preview(userId, houseId, month, category);
  }
}
