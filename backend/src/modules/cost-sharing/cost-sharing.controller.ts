import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ExpenseCategory } from '../../generated/prisma/enums.js';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { ExpenseQueryDto } from '../expenses/dto/expenses.dto.js';
import { CostSharingService } from './cost-sharing.service.js';
import {
  SharingDefaultDto,
  SharingProposalDto,
  SharingQueryDto,
  SharingReopenDto,
  SharingRuleQueryDto,
  SharingSettingDto,
  SharingVoteDto,
} from './dto/cost-sharing.dto.js';

@Controller('houses/:houseId/cost-sharing')
@UseGuards(AuthGuard)
export class CostSharingController {
  constructor(private readonly sharing: CostSharingService) {}
  @Get() list(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: SharingQueryDto,
  ) {
    return this.sharing.list(req.auth.userId, houseId, query.month);
  }
  @Get('rule') rule(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: SharingRuleQueryDto,
  ) {
    return this.sharing.rule(
      req.auth.userId,
      houseId,
      query.month,
      query.category,
    );
  }
  @Get('periods/:id') history(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.sharing.history(req.auth.userId, houseId, id, query);
  }
  @Put('settings/:category') setting(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('category', new ParseEnumPipe(ExpenseCategory))
    category: ExpenseCategory,
    @Body() dto: SharingSettingDto,
  ) {
    return this.sharing.setting(req.auth.userId, houseId, category, dto);
  }
  @Post('defaults') openDefault(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: SharingDefaultDto,
  ) {
    return this.sharing.openDefault(req.auth.userId, houseId, dto);
  }
  @Post('periods/:id/reopen') reopen(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SharingReopenDto,
  ) {
    return this.sharing.reopen(req.auth.userId, houseId, id, dto);
  }
  @Post('periods/:id/votes') vote(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SharingVoteDto,
  ) {
    return this.sharing.vote(req.auth.userId, houseId, id, dto);
  }
  @Post('periods/:id/proposals') proposal(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SharingProposalDto,
  ) {
    return this.sharing.proposal(req.auth.userId, houseId, id, dto);
  }
}
