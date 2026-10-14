import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from '../../redis/rate-limit.service.js';

@Injectable()
export class AuthSupportService {
  constructor(
    private readonly config: ConfigService,
    private readonly rates: RateLimitService,
  ) {}

  private readonly logger = new Logger('AuthService');

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

  checkRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
    return this.rates.check(`auth:${key}`, limit, windowMs);
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
