import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { EmailDto, OtpDto } from './dto/auth.dto.js';
import { AuthOtpService } from './auth-otp.service.js';
import { SessionService } from './session.service.js';
import { AuthSupportService } from './auth-support.service.js';

@Injectable()
export class AuthVerificationService {
  constructor(
    private readonly sessions: SessionService,
    private readonly support: AuthSupportService,
    private readonly otp: AuthOtpService,
  ) {}

  async confirmEmail(dto: OtpDto, request: Request, response: Response) {
    const user = await this.otp.consume(
      dto,
      'EMAIL_VERIFICATION',
      request,
      (transaction, account) =>
        transaction.user.update({
          where: { id: account.id },
          data: { emailVerifiedAt: new Date() },
          include: { profile: true },
        }),
    );
    await this.sessions.create(user.id, request, response);
    return { user: this.support.serializeUser(user) };
  }

  async resendVerification(dto: EmailDto, request: Request) {
    const { emailSent: _emailSent, ...challenge } = await this.otp.issue(
      dto.email,
      'EMAIL_VERIFICATION',
      request,
    );
    return {
      ...challenge,
      message:
        'Nếu tài khoản tồn tại và chưa xác minh, mã OTP sẽ được gửi đến email của bạn.',
    };
  }
}
