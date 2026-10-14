import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisService } from './redis.service.js';

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly redis: RedisService) {}

  async check(
    key: string,
    limit: number,
    windowMs: number,
    error = {
      code: 'RATE_LIMITED',
      message: 'Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.',
    },
  ): Promise<void> {
    let allowed: boolean;
    if (this.redis.enabled) {
      try {
        allowed = await this.redis.consume(key, limit, windowMs);
      } catch {
        // Never silently switch configured deployments to per-instance counters.
        throw new ServiceUnavailableException({
          code: 'RATE_LIMIT_UNAVAILABLE',
          message: 'Tạm thời không thể xử lý. Vui lòng thử lại sau.',
        });
      }
    } else {
      const now = Date.now();
      for (const [id, bucket] of this.buckets)
        if (bucket.resetAt <= now) this.buckets.delete(id);
      const bucket = this.buckets.get(key);
      allowed = bucket ? bucket.count < limit : this.buckets.size < 10000;
      if (allowed) {
        this.buckets.set(key, {
          count: (bucket?.count ?? 0) + 1,
          resetAt: bucket?.resetAt ?? now + windowMs,
        });
      }
    }
    if (!allowed) throw new HttpException(error, 429);
  }
}
