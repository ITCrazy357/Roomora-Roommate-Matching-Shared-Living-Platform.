import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Delete,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  CreateDebtPaymentDto,
  CreateExpenseDto,
  ExpenseQueryDto,
  UpdateExpenseDto,
  CancelExpenseDto,
  PaymentActionDto,
  UploadReceiptDto,
  GuestParticipantDto,
} from './dto/expenses.dto.js';
import { ExpensesService } from './expenses.service.js';
import { ExpenseParticipantsService } from './expense-participants.service.js';
import { ExpenseBalancesService } from './expense-balances.service.js';
import { ExpensePaymentsService } from './expense-payments.service.js';
import { ExpenseReceiptsService } from './expense-receipts.service.js';

@Controller('expenses')
@UseGuards(AuthGuard)
export class FinanceHistoryController {
  constructor(private readonly participants: ExpenseParticipantsService) {}
  @Get('houses') houses(@Req() request: AuthenticatedRequest) {
    return this.participants.historyHouses(request.auth.userId);
  }
}

@Controller('houses/:houseId/expenses')
@UseGuards(AuthGuard)
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly balancesService: ExpenseBalancesService,
    private readonly participantsService: ExpenseParticipantsService,
    private readonly paymentsService: ExpensePaymentsService,
    private readonly receipts: ExpenseReceiptsService,
  ) {}
  @Get() list(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expenses.list(req.auth.userId, houseId, query);
  }
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expenses.create(req.auth.userId, houseId, dto);
  }
  @Get('balances') balances(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.balancesService.get(req.auth.userId, houseId);
  }
  @Get('settlements') settlements(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.balancesService.settlements(req.auth.userId, houseId);
  }
  @Post('settle') settle(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.balancesService.settle(req.auth.userId, houseId);
  }
  @Get('participants') participants(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.participantsService.list(req.auth.userId, houseId);
  }
  @Post('participants') addGuest(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: GuestParticipantDto,
  ) {
    return this.participantsService.addGuest(
      req.auth.userId,
      houseId,
      dto.displayName,
    );
  }
  @Delete('participants/:participantId') removeGuest(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ) {
    return this.participantsService.removeGuest(
      req.auth.userId,
      houseId,
      participantId,
    );
  }
  @Get('payments') payments(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.paymentsService.list(req.auth.userId, houseId, query);
  }
  @Post('payments') createPayment(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: CreateDebtPaymentDto,
  ) {
    return this.paymentsService.create(req.auth.userId, houseId, dto);
  }
  @Post('payments/:paymentId') changePayment(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: PaymentActionDto,
  ) {
    return this.paymentsService.change(
      req.auth.userId,
      houseId,
      paymentId,
      dto,
    );
  }
  @Patch(':expenseId') update(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(req.auth.userId, houseId, expenseId, dto);
  }
  @Post(':expenseId/cancel') cancel(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: CancelExpenseDto,
  ) {
    return this.expenses.cancel(req.auth.userId, houseId, expenseId, dto);
  }
  @Get(':expenseId/history') history(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
  ) {
    return this.expenses.adjustments(req.auth.userId, houseId, expenseId);
  }
  @Post(':expenseId/receipt')
  @UseInterceptors(
    FileInterceptor('receipt', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  uploadReceipt(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UploadReceiptDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.receipts.upload(req.auth.userId, houseId, expenseId, dto, file);
  }
  @Get(':expenseId/receipt') async receipt(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Res() response: Response,
  ) {
    const receipt = await this.receipts.get(
      req.auth.userId,
      houseId,
      expenseId,
    );
    response.set({
      'Content-Type': receipt.mimeType,
      'Content-Length': String(receipt.data.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(Buffer.from(receipt.data));
  }
}
