import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateBucket {
  attempts: number;
  resetAt: number;
}

@Injectable()
export class AuthSupportService {
  constructor(private readonly config: ConfigService) {}

  private readonly logger = new Logger('AuthService');

  private readonly rateBuckets = new Map<string, RateBucket>();

  serializeUser(user: {
    id: string;
    role?: 'USER' | 'ADMIN';
    email: string;
    passwordHash?: string | null;
    emailVerifiedAt: Date | null;
    profile: {
      displayName: string;
      avatarUrl: string | null;
      onboardingCompletedAt: Date | null;
    } | null;
  }) {
    return {
      id: user.id,
      role: user.role ?? 'USER',
      email: user.email,
      hasPassword: Boolean(user.passwordHash),
      emailVerified: Boolean(user.emailVerifiedAt),
      displayName: user.profile?.displayName ?? '',
      avatarUrl: user.profile?.avatarUrl ?? null,
      onboardingCompleted: Boolean(user.profile?.onboardingCompletedAt),
    };
  }

  checkRateLimit(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    // Dọn trước khi thêm key mới; nhánh return bên dưới không được bỏ qua bước này.
    if (this.rateBuckets.size > 10_000) {
      for (const [bucketKey, bucket] of this.rateBuckets) {
        if (bucket.resetAt <= now) this.rateBuckets.delete(bucketKey);
      }
    }
    const existing = this.rateBuckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.rateBuckets.set(key, { attempts: 1, resetAt: now + windowMs });
      return;
    }
    if (existing.attempts >= limit) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    existing.attempts += 1;
  }

  isUniqueConstraint(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  async trySend(send: () => Promise<void>): Promise<boolean> {
    try {
      await send();
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể gửi email';
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.logger.error(message);
      } else {
        this.logger.warn(message);
      }
      return false;
    }
  }
}
