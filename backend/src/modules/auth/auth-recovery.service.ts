import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import { PASSWORD_RESET_TOKEN_TTL_MS } from './auth.constants.js';
import type { EmailDto, ResetPasswordDto } from './dto/auth.dto.js';
import { MailService } from './mail.service.js';
import { PasswordService } from './password.service.js';
import { hashToken } from './token.utils.js';
import { AuthSupportService } from './auth-support.service.js';

@Injectable()
export class AuthRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly support: AuthSupportService,
  ) {}

  async forgotPassword(dto: EmailDto, request: Request) {
    this.support.checkRateLimit(`forgot:${request.ip}`, 20, 60 * 60 * 1000);
    this.support.checkRateLimit(
      `forgot:${request.ip}:${dto.email}`,
      5,
      60 * 60 * 1000,
    );
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    let developmentActionUrl: string | undefined;

    if (user?.passwordHash) {
      const actionUrl = await this.support.createActionUrl(
        user.id,
        'PASSWORD_RESET',
        '/dat-lai-mat-khau',
        PASSWORD_RESET_TOKEN_TTL_MS,
      );
      await this.support.trySend(() =>
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
}
