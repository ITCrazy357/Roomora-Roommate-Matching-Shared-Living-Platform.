import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { ServiceOrdersService } from './service-orders.service.js';

@Injectable()
export class BillingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(BillingSchedulerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly orders: ServiceOrdersService,
  ) {}
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    void this.expire();
    this.timer = setInterval(() => {
      void this.expire();
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  async expire() {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.serviceOrder.updateMany({
        where: { status: 'PENDING', expiresAt: { lte: new Date() } },
        data: { status: 'EXPIRED' },
      });
      if (this.config.get('BILLING_RECONCILE_ENABLED') === 'true')
        await this.orders.reconcilePayos();
      // Visibility checks boostUntil at read time, so an unavailable worker cannot prolong a boost.
    } catch {
      this.logger.error('Không cập nhật được đơn dịch vụ hết hạn');
    } finally {
      this.running = false;
    }
  }
}
