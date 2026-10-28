import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';

@Injectable()
export class MessageSendRateGuard implements CanActivate {
  constructor(private readonly rates: RateLimitService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth.userId;
    const error = {
      code: 'RATE_LIMITED',
      message: 'Bạn gửi quá nhanh. Vui lòng chờ một phút rồi thử lại.',
    };
    // AuthGuard runs first. Count attempts (including retries and invalid bodies)
    // before FileFieldsInterceptor buffers files or services decode images.
    // Both chat routes share these per-account buckets across destinations.
    await this.rates.check(`chat-send:${userId}`, 60, 60_000, error);
    if (request.is('multipart/form-data'))
      await this.rates.check(`chat-upload:${userId}`, 30, 60_000, error);
    return true;
  }
}
