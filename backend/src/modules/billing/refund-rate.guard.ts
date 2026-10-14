import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';

@Injectable()
export class RefundRateGuard implements CanActivate {
  constructor(private readonly rates: RateLimitService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = request.auth.userId;
    const limit = request.auth.role === 'ADMIN' ? 60 : 20;
    await this.rates.check(`refund:${key}`, limit, 60000, {
      code: 'REFUND_RATE_LIMITED',
      message: 'Thao tác quá nhanh. Thử lại sau một phút.',
    });
    return true;
  }
}
