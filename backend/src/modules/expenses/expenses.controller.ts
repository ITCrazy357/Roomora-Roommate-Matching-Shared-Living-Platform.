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
  UseFilters,
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
  RepaymentPromiseDto,
  ExpenseVersionDto,
} from './dto/expenses.dto.js';
import { ExpensesService } from './expenses.service.js';
import { PaymentProofUploadFilter } from './payment-proof-upload.filter.js';

@Controller('expenses')
@UseGuards(AuthGuard)
export class FinanceHistoryController {
  constructor(private readonly expenses: ExpensesService) {}
  @Get('houses') houses(@Req() request: AuthenticatedRequest) {
    return this.expenses.historyHouses(request.auth.userId);
  }
}

@Controller('houses/:houseId/expenses')
@UseGuards(AuthGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}
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
    return this.expenses.balances(req.auth.userId, houseId);
  }
  @Get('settlements') settlements(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.expenses.settlements(req.auth.userId, houseId);
  }
  @Post('settle') settle(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.expenses.settle(req.auth.userId, houseId);
  }
  @Post('repayment-promises') promise(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: RepaymentPromiseDto,
  ) {
    return this.expenses.savePromise(req.auth.userId, houseId, dto);
  }
  @Delete('repayment-promises/:recipientId') cancelPromise(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
    @Body() dto: ExpenseVersionDto,
  ) {
    return this.expenses.cancelPromise(
      req.auth.userId,
      houseId,
      recipientId,
      dto,
    );
  }
  @Get('participants') participants(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
  ) {
    return this.expenses.participants(req.auth.userId, houseId);
  }
  @Post('participants') addGuest(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: GuestParticipantDto,
  ) {
    return this.expenses.addGuest(req.auth.userId, houseId, dto.displayName);
  }
  @Delete('participants/:participantId') removeGuest(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ) {
    return this.expenses.removeGuest(req.auth.userId, houseId, participantId);
  }
  @Get('payments') payments(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expenses.payments(req.auth.userId, houseId, query);
  }
  @Post('payments')
  @UseFilters(PaymentProofUploadFilter)
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 6 },
    }),
  )
  createPayment(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Body() dto: CreateDebtPaymentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.expenses.createPayment(req.auth.userId, houseId, dto, file);
  }
  @Get('payments/:paymentId/proof') async paymentProof(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Res() response: Response,
  ) {
    const proof = await this.expenses.paymentProof(
      req.auth.userId,
      houseId,
      paymentId,
    );
    response.set({
      'Content-Type': proof.mimeType,
      'Content-Length': String(proof.data.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(Buffer.from(proof.data));
  }
  @Post('payments/:paymentId') changePayment(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: PaymentActionDto,
  ) {
    return this.expenses.changePayment(
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
    return this.expenses.uploadReceipt(
      req.auth.userId,
      houseId,
      expenseId,
      dto,
      file,
    );
  }
  @Get(':expenseId/receipt') async receipt(
    @Req() req: AuthenticatedRequest,
    @Param('houseId', ParseUUIDPipe) houseId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Res() response: Response,
  ) {
    const receipt = await this.expenses.receipt(
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
