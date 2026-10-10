import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import { VERIFICATION_TOKEN_TTL_MS } from './auth.constants.js';
import type { EmailDto } from './dto/auth.dto.js';
import { MailService } from './mail.service.js';
import { SessionService } from './session.service.js';
import { hashToken } from './token.utils.js';
import { AuthSupportService } from './auth-support.service.js';

@Injectable()
export class AuthVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly support: AuthSupportService,
  ) {}

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
    return { user: this.support.serializeUser(user) };
  }

  async resendVerification(dto: EmailDto, request: Request) {
    this.support.checkRateLimit(`resend:${request.ip}`, 20, 60 * 60 * 1000);
    this.support.checkRateLimit(
      `resend:${request.ip}:${dto.email}`,
      5,
      60 * 60 * 1000,
    );
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    let developmentActionUrl: string | undefined;

    if (user && !user.emailVerifiedAt) {
      const actionUrl = await this.support.createActionUrl(
        user.id,
        'EMAIL_VERIFICATION',
        '/xac-minh-email',
        VERIFICATION_TOKEN_TTL_MS,
      );
      await this.support.trySend(() =>
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
}
