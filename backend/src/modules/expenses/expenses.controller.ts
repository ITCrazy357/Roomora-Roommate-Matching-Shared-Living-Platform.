import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
} from '../expenses/dto/expenses.dto.js';
import { ExpensesService } from '../expenses/expenses.service.js';

@Controller('houses/:houseId/expenses')
@UseGuards(AuthGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() query: ExpenseQueryDto,
  ) {
    return this.expenses.list(request.auth.userId, houseId, query);
  }

  @Get('balances')
  getBalances(
    @Req() request: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.expenses.getBalances(request.auth.userId, houseId);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expenses.create(request.auth.userId, houseId, dto);
  }

  @Get('settlements')
  settlements(
    @Req() request: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.expenses.getSettlements(request.auth.userId, houseId);
  }
}
