import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  clientIp,
  type OptionallyAuthenticatedRequest,
} from './request-context.js';
import { RateLimitService } from '../redis/rate-limit.service.js';

@Injectable()
export class PublicSearchRateGuard implements CanActivate {
  constructor(private readonly rates: RateLimitService) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<OptionallyAuthenticatedRequest>();
    const response = http.getResponse<Response>();
    // Search results can contain viewer-specific saved/connection state.
    // This also prevents a shared proxy from caching a rate-limit response.
    response.setHeader('Cache-Control', 'private, no-store');
    const error = {
      code: 'RATE_LIMITED',
      message: 'Bạn tìm kiếm quá nhanh. Vui lòng chờ một phút rồi thử lại.',
    };
    try {
      // Express applies the configured proxy trust boundary. Never parse raw
      // forwarded headers here. Allow room for NAT and server-rendered requests.
      await this.rates.check(
        `public-search:ip:${clientIp(request)}`,
        600,
        60_000,
        error,
      );
      // OptionalAuthGuard runs first; only a verified session supplies this id.
      if (request.auth)
        await this.rates.check(
          `public-search:user:${request.auth.userId}`,
          60,
          60_000,
          error,
        );
    } catch (failure) {
      if (failure instanceof HttpException && failure.getStatus() === 429)
        response.setHeader('Retry-After', '60');
      throw failure;
    }
    return true;
  }
}
