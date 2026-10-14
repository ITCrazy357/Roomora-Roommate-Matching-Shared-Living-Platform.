import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import { PASSWORD_RESET_TOKEN_TTL_MS } from './auth.constants.js';
import type { EmailDto, OtpDto, ResetPasswordDto } from './dto/auth.dto.js';
import { AuthOtpService } from './auth-otp.service.js';
import { PasswordService } from './password.service.js';
import { hashToken, randomToken } from './token.utils.js';
import { AuthSupportService } from './auth-support.service.js';

@Injectable()
export class AuthRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly support: AuthSupportService,
    private readonly otp: AuthOtpService,
  ) {}

  async forgotPassword(dto: EmailDto, request: Request) {
    const { emailSent: _emailSent, ...challenge } = await this.otp.issue(
      dto.email,
      'PASSWORD_RESET',
      request,
    );
    return {
      ...challenge,
      message:
        'Nếu email thuộc tài khoản dùng mật khẩu, mã OTP sẽ được gửi đến email của bạn.',
    };
  }

  verifyPasswordOtp(dto: OtpDto, request: Request) {
    return this.otp.consume(
      dto,
      'PASSWORD_RESET',
      request,
      async (transaction, user) => {
        const token = randomToken();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
        await transaction.authToken.updateMany({
          where: {
            userId: user.id,
            type: 'PASSWORD_RESET_GRANT',
            consumedAt: null,
          },
          data: { consumedAt: now },
        });
        await transaction.authToken.create({
          data: {
            userId: user.id,
            type: 'PASSWORD_RESET_GRANT',
            tokenHash: hashToken(token),
            expiresAt,
          },
        });
        return { token, expiresAt };
      },
    );
  }

  async resetPassword(
    dto: ResetPasswordDto,
    request: Request,
  ): Promise<{ message: string }> {
    await this.support.checkRateLimit(
      `password-reset:${request.ip}`,
      20,
      15 * 60 * 1000,
    );
    const saved = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });
    const invalid = () =>
      new ForbiddenException({
        code: 'TOKEN_INVALID',
        message:
          'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy xác nhận OTP mới.',
      });
    if (
      !saved ||
      saved.type !== 'PASSWORD_RESET_GRANT' ||
      saved.consumedAt ||
      saved.expiresAt <= new Date()
    )
      throw invalid();
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${saved.userId}::uuid FOR UPDATE`;
      const user = await transaction.user.findUnique({
        where: { id: saved.userId },
      });
      const now = new Date();
      if (!user?.passwordHash || user.lockedAt) throw invalid();
      const consumed = await transaction.authToken.updateMany({
        where: {
          id: saved.id,
          type: 'PASSWORD_RESET_GRANT',
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw invalid();
      await transaction.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await transaction.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.authToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      await transaction.authOtp.updateMany({
        where: { userId: user.id, type: 'PASSWORD_RESET', consumedAt: null },
        data: { consumedAt: now },
      });
    });
    return { message: 'Mật khẩu đã được thay đổi. Hãy đăng nhập lại.' };
  }
}
