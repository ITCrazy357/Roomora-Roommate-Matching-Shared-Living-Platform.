import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CommunicationsModule } from '../communications/communications.module.js';
import {
  BillingController,
  MomoNotificationController,
  PayosNotificationController,
} from './billing.controller.js';
import { MomoGatewayService } from './momo-gateway.service.js';
import { PayosGatewayService } from './payos-gateway.service.js';
import { PaymentGatewayService } from './payment-gateway.service.js';
import { ServiceOrdersService } from './service-orders.service.js';
import { ServicePaymentsService } from './service-payments.service.js';
import { ServiceReceiptsService } from './service-receipts.service.js';
import { BillingSchedulerService } from './billing-scheduler.service.js';
import { ServiceRefundsService } from './service-refunds.service.js';
import { AdminRefundsService } from './admin-refunds.service.js';
import { RefundRulesService } from './refund-rules.service.js';
import { MomoRefundsService } from './momo-refunds.service.js';
import { RefundRateGuard } from './refund-rate.guard.js';
import { AdminGuard } from '../listings/admin.guard.js';
import {
  RefundsController,
  AdminRefundsController,
} from './refunds.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, CommunicationsModule],
  controllers: [
    BillingController,
    MomoNotificationController,
    PayosNotificationController,
    RefundsController,
    AdminRefundsController,
  ],
  providers: [
    MomoGatewayService,
    PayosGatewayService,
    PaymentGatewayService,
    ServiceOrdersService,
    ServicePaymentsService,
    ServiceReceiptsService,
    BillingSchedulerService,
    ServiceRefundsService,
    AdminRefundsService,
    RefundRulesService,
    MomoRefundsService,
    RefundRateGuard,
    AdminGuard,
  ],
})
export class BillingModule {}
