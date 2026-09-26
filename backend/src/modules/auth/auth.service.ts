import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthContext } from '../../common/request-context.js';
import {
  PASSWORD_RESET_TOKEN_TTL_MS,
  VERIFICATION_TOKEN_TTL_MS,
} from './auth.constants.js';
import type {
  EmailDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto.js';
import { MailService } from './mail.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { hashToken, randomToken } from './token.utils.js';

interface RateBucket {
  attempts: number;
  resetAt: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly rateBuckets = new Map<string, RateBucket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, request: Request) {
    this.checkRateLimit(`register:${request.ip}`, 5, 60 * 60 * 1000);
    const passwordHash = await this.passwords.hash(dto.password);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          profile: { create: { displayName: dto.displayName } },
        },
        include: { profile: true },
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_USED',
          message: 'Email đã được sử dụng',
        });
      }
      throw error;
    }

    const actionUrl = await this.createActionUrl(
      user.id,
      'EMAIL_VERIFICATION',
      '/xac-minh-email',
      VERIFICATION_TOKEN_TTL_MS,
    );
    const emailSent = await this.trySend(() =>
      this.mail.sendVerification(user.email, actionUrl),
    );

    return {
      message: 'Tài khoản đã được tạo. Hãy xác minh email để đăng nhập.',
      emailSent,
      developmentActionUrl: this.mail.exposeDevelopmentUrl(
        actionUrl,
        request.ip,
      ),
    };
  }

  async login(dto: LoginDto, request: Request, response: Response) {
    this.checkRateLimit(`login:${request.ip}`, 50, 15 * 60 * 1000);
    this.checkRateLimit(`login:${request.ip}:${dto.email}`, 10, 15 * 60 * 1000);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { profile: true },
    });

    const passwordMatches = user?.passwordHash
      ? await this.passwords.verify(dto.password, user.passwordHash)
      : await this.passwords.verifyAgainstDummy(dto.password);
    if (!user?.passwordHash || !passwordMatches) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không đúng',
      });
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email chưa được xác minh',
      });
    }

    await this.sessions.create(user.id, request, response);
    return { user: this.serializeUser(user) };
  }

  async confirmEmail(token: string, request: Request, response: Response) {
    const now = new Date();
    const savedToken = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { profile: true } } },
    });

    if (
      !savedToken ||
      savedToken.type !== 'EMAIL_VERIFICATION' ||
      savedToken.consumedAt ||
      savedToken.expiresAt <= now
    ) {
      throw new ForbiddenException({
        code: 'TOKEN_INVALID',
        message: 'Liên kết xác minh không hợp lệ hoặc đã hết hạn',
      });
    }

    const user = await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.authToken.updateMany({
        where: {
          id: savedToken.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new ForbiddenException({
          code: 'TOKEN_INVALID',
          message: 'Liên kết xác minh đã được sử dụng',
        });
      }
      return transaction.user.update({
        where: { id: savedToken.userId },
        data: { emailVerifiedAt: savedToken.user.emailVerifiedAt ?? now },
        include: { profile: true },
      });
    });

    await this.sessions.create(user.id, request, response);
    return { user: this.serializeUser(user) };
  }

  async resendVerification(dto: EmailDto, request: Request) {
    this.checkRateLimit(`resend:${request.ip}`, 20, 60 * 60 * 1000);
    this.checkRateLimit(`resend:${request.ip}:${dto.email}`, 5, 60 * 60 * 1000);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    let developmentActionUrl: string | undefined;

    if (user && !user.emailVerifiedAt) {
      const actionUrl = await this.createActionUrl(
        user.id,
        'EMAIL_VERIFICATION',
        '/xac-minh-email',
        VERIFICATION_TOKEN_TTL_MS,
      );
      await this.trySend(() =>
        this.mail.sendVerification(user.email, actionUrl),
      );
      developmentActionUrl = this.mail.exposeDevelopmentUrl(
        actionUrl,
        request.ip,
      );
    }

    return {
      message:
        'Nếu tài khoản tồn tại và chưa xác minh, Roomora đã gửi một liên kết mới.',
      developmentActionUrl,
    };
  }

  async forgotPassword(dto: EmailDto, request: Request) {
    this.checkRateLimit(`forgot:${request.ip}`, 20, 60 * 60 * 1000);
    this.checkRateLimit(`forgot:${request.ip}:${dto.email}`, 5, 60 * 60 * 1000);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    let developmentActionUrl: string | undefined;

    if (user?.passwordHash) {
      const actionUrl = await this.createActionUrl(
        user.id,
        'PASSWORD_RESET',
        '/dat-lai-mat-khau',
        PASSWORD_RESET_TOKEN_TTL_MS,
      );
      await this.trySend(() =>
        this.mail.sendPasswordReset(user.email, actionUrl),
      );
      developmentActionUrl = this.mail.exposeDevelopmentUrl(
        actionUrl,
        request.ip,
      );
    }

    return {
      message:
        'Nếu email thuộc một tài khoản dùng mật khẩu, Roomora đã gửi hướng dẫn đặt lại.',
      developmentActionUrl,
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const now = new Date();
    const savedToken = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });
    if (
      !savedToken ||
      savedToken.type !== 'PASSWORD_RESET' ||
      savedToken.consumedAt ||
      savedToken.expiresAt <= now
    ) {
      throw new ForbiddenException({
        code: 'TOKEN_INVALID',
        message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      });
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.authToken.updateMany({
        where: {
          id: savedToken.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new ForbiddenException({
          code: 'TOKEN_INVALID',
          message: 'Liên kết đặt lại mật khẩu đã được sử dụng',
        });
      }
      await transaction.user.update({
        where: { id: savedToken.userId },
        data: { passwordHash },
      });
      await transaction.session.updateMany({
        where: { userId: savedToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.authToken.updateMany({
        where: {
          userId: savedToken.userId,
          type: 'PASSWORD_RESET',
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
    });

    return { message: 'Mật khẩu đã được thay đổi. Hãy đăng nhập lại.' };
  }

  async me(auth: AuthContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: auth.userId },
      include: { profile: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy tài khoản',
      });
    }
    return { user: this.serializeUser(user) };
  }

  serializeUser(user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    profile: {
      displayName: string;
      avatarUrl: string | null;
      onboardingCompletedAt: Date | null;
    } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      displayName: user.profile?.displayName ?? '',
      avatarUrl: user.profile?.avatarUrl ?? null,
      onboardingCompleted: Boolean(user.profile?.onboardingCompletedAt),
    };
  }

  private async createActionUrl(
    userId: string,
    type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
    path: string,
    ttlMs: number,
  ): Promise<string> {
    const rawToken = randomToken();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId, type, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          type,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      }),
    ]);

    const url = new URL(
      path,
      this.config.getOrThrow<string>('FRONTEND_ORIGIN'),
    );
    url.searchParams.set('token', rawToken);
    return url.toString();
  }

  private checkRateLimit(key: string, limit: number, windowMs: number): void {
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

  private isUniqueConstraint(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private async trySend(send: () => Promise<void>): Promise<boolean> {
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
