import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { SignedPaymentNotification } from '../../common/origin.guard.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { ServiceOrdersService } from './service-orders.service.js';
import { ServicePaymentsService } from './service-payments.service.js';
import { ServiceReceiptsService } from './service-receipts.service.js';
import { ServiceRefundsService } from './service-refunds.service.js';
import { RefundRateGuard } from './refund-rate.guard.js';
import { refundBanks } from './refund-banks.js';
import {
  CreateServiceOrderDto,
  RefundRequestDto,
  ServiceOrderQueryDto,
} from './dto/billing.dto.js';

@Controller('services')
export class BillingController {
  constructor(
    private readonly orders: ServiceOrdersService,
    private readonly receipts: ServiceReceiptsService,
    private readonly refunds: ServiceRefundsService,
  ) {}
  @Get('catalog') catalog() {
    return this.orders.catalog();
  }
  @Get('refund-banks')
  @UseGuards(AuthGuard)
  banks() {
    return refundBanks;
  }
  @Get('listings')
  @UseGuards(AuthGuard)
  listings(@Req() req: AuthenticatedRequest) {
    return this.orders.eligibleListings(req.auth.userId);
  }
  @Post('orders')
  @UseGuards(AuthGuard)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateServiceOrderDto) {
    return this.orders.create(req.auth.userId, dto);
  }
  @Get('orders')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(AuthGuard)
  list(@Req() req: AuthenticatedRequest, @Query() query: ServiceOrderQueryDto) {
    return this.orders.list(req.auth.userId, query);
  }
  @Get('orders/:id')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(AuthGuard)
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.getAndSync(req.auth.userId, id);
  }
  @Post('orders/:id/checkout')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  checkout(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.checkout(req.auth.userId, id);
  }
  @Post('orders/:id/sync')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  sync(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.sync(req.auth.userId, id);
  }
  @Post('orders/:id/refund-request')
  @UseGuards(AuthGuard, RefundRateGuard)
  refund(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundRequestDto,
  ) {
    return this.refunds.request(req.auth.userId, id, dto.reason);
  }
  @Get('orders/:id/receipt')
  @UseGuards(AuthGuard)
  async receipt(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.receipts.export(req.auth.userId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Roomora-receipt-${id}.pdf"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(pdf);
  }
}

@Controller('services/momo')
export class MomoNotificationController {
  constructor(private readonly payments: ServicePaymentsService) {}
  @Post('ipn')
  @SignedPaymentNotification()
  @HttpCode(204)
  async notify(@Body() body: unknown) {
    await this.payments.notify(body);
  }
}

@Controller('services/payos')
export class PayosNotificationController {
  constructor(private readonly payments: ServicePaymentsService) {}
  @Post('webhook')
  @SignedPaymentNotification()
  @HttpCode(200)
  async notify(@Body() body: unknown) {
    await this.payments.notifyPayos(body);
    return { code: '00', desc: 'success' };
  }
}
