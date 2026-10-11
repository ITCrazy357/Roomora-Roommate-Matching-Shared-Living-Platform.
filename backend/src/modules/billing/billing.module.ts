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

@Module({
  imports: [PrismaModule, AuthModule, CommunicationsModule],
  controllers: [
    BillingController,
    MomoNotificationController,
    PayosNotificationController,
  ],
  providers: [
    MomoGatewayService,
    PayosGatewayService,
    PaymentGatewayService,
    ServiceOrdersService,
    ServicePaymentsService,
    ServiceReceiptsService,
    BillingSchedulerService,
  ],
})
export class BillingModule {}
