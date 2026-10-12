import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServiceOrder } from '../../generated/prisma/client.js';
import { MomoGatewayService } from './momo-gateway.service.js';
import { PayosGatewayService } from './payos-gateway.service.js';

@Injectable()
export class PaymentGatewayService {
  constructor(
    private readonly config: ConfigService,
    private readonly momo: MomoGatewayService,
    private readonly payos: PayosGatewayService,
  ) {}

  provider() {
    return (
      this.config.get<string>('BILLING_PAYMENT_PROVIDER') ?? 'MOMO_SANDBOX'
    );
  }

  available(provider = this.provider()) {
    return provider === 'PAYOS'
      ? this.payos.available()
      : provider === 'MOMO_SANDBOX' && this.momo.available();
  }

  async create(order: ServiceOrder) {
    if (order.provider === 'PAYOS') return this.payos.create(order);
    if (order.provider === 'MOMO_SANDBOX')
      return { payUrl: await this.momo.create(order), providerLinkId: null };
    throw new ServiceUnavailableException({
      code: 'PAYMENT_NOT_CONFIGURED',
      message: 'Cổng thanh toán của đơn chưa sẵn sàng',
    });
  }

  async read(order: ServiceOrder) {
    return order.provider === 'PAYOS' ? this.payos.read(order) : null;
  }
}
