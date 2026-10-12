import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminGuard } from '../listings/admin.guard.js';
import { PaymentProofUploadFilter } from '../expenses/payment-proof-upload.filter.js';
import { ServiceRefundsService } from './service-refunds.service.js';
import { AdminRefundsService } from './admin-refunds.service.js';
import { RefundRateGuard } from './refund-rate.guard.js';
import {
  BeginRefundDto,
  CompleteRefundDto,
  FailRefundDto,
  RefundNoteDto,
  RefundQueryDto,
  RefundRecipientDto,
  RefundVersionDto,
  ReviewRefundDto,
  VerifyRefundRecipientDto,
} from './dto/refund.dto.js';

function sendProof(
  res: Response,
  proof: { data: Uint8Array; mimeType: string },
) {
  res.set({
    'Content-Type': proof.mimeType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(Buffer.from(proof.data));
}

@Controller('services/orders/:orderId/refund')
@UseGuards(AuthGuard)
export class RefundsController {
  constructor(
    private readonly refunds: ServiceRefundsService,
    private readonly admin: AdminRefundsService,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.refunds.get(req.auth.userId, orderId);
  }
  @Post('recipient')
  @UseGuards(RefundRateGuard)
  recipient(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: RefundRecipientDto,
  ) {
    return this.refunds.recipient(req.auth.userId, orderId, dto);
  }
  @Get('proofs/:proofId')
  async proof(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('proofId', ParseUUIDPipe) proofId: string,
    @Res() res: Response,
  ) {
    const refund = await this.refunds.get(req.auth.userId, orderId);
    sendProof(res, await this.admin.proof(refund.id, proofId, req.auth.userId));
  }
}

@Controller('admin/refunds')
@UseGuards(AdminGuard)
export class AdminRefundsController {
  constructor(private readonly refunds: AdminRefundsService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Query() query: RefundQueryDto) {
    return this.refunds.list(query);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.refunds.get(id);
  }
  @Post(':id/review')
  @UseGuards(RefundRateGuard)
  review(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewRefundDto,
  ) {
    return this.refunds.review(req.auth.userId, id, dto);
  }
  @Post(':id/verify-recipient')
  @UseGuards(RefundRateGuard)
  verify(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyRefundRecipientDto,
  ) {
    return this.refunds.verifyRecipient(req.auth.userId, id, dto);
  }
  @Post(':id/process')
  @UseGuards(RefundRateGuard)
  process(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BeginRefundDto,
  ) {
    return this.refunds.begin(req.auth.userId, id, dto);
  }
  @Post(':id/reconcile')
  @UseGuards(RefundRateGuard)
  reconcile(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundVersionDto,
  ) {
    return this.refunds.reconcile(req.auth.userId, id, dto.version);
  }
  @Post(':id/retry')
  @UseGuards(RefundRateGuard)
  retry(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundNoteDto,
  ) {
    return this.refunds.retry(req.auth.userId, id, dto);
  }
  @Post(':id/fail')
  @UseGuards(RefundRateGuard)
  fail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FailRefundDto,
  ) {
    return this.refunds.fail(req.auth.userId, id, dto);
  }
  @Post(':id/complete')
  @UseGuards(RefundRateGuard)
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteRefundDto,
  ) {
    return this.refunds.complete(req.auth.userId, id, dto);
  }
  @Post(':id/proofs')
  @UseGuards(RefundRateGuard)
  @UseFilters(PaymentProofUploadFilter)
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  upload(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundVersionDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.refunds.uploadProof(req.auth.userId, id, dto.version, file);
  }
  @Get(':id/proofs/:proofId')
  async proof(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('proofId', ParseUUIDPipe) proofId: string,
    @Res() res: Response,
  ) {
    sendProof(res, await this.refunds.proof(id, proofId));
  }
}
