import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';

@Injectable()
export class RefundRateGuard implements CanActivate {
  private readonly buckets = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = request.auth.userId;
    const now = Date.now();
    const limit = request.auth.role === 'ADMIN' ? 60 : 20;
    for (const [id, bucket] of this.buckets)
      if (bucket.expiresAt <= now) this.buckets.delete(id);
    const bucket = this.buckets.get(key) ?? {
      count: 0,
      expiresAt: now + 60000,
    };
    if (
      bucket.count >= limit ||
      (!this.buckets.has(key) && this.buckets.size >= 10000)
    )
      throw new HttpException(
        {
          code: 'REFUND_RATE_LIMITED',
          message: 'Thao tác quá nhanh. Thử lại sau một phút.',
        },
        429,
      );
    bucket.count += 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
