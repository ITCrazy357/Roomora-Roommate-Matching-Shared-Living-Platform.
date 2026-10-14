import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/request-context.js';
import type {
  EmailDto,
  OtpDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto.js';
import { SessionService } from './session.service.js';
import { AuthAccountsService } from './auth-accounts.service.js';
import { AuthVerificationService } from './auth-verification.service.js';
import { AuthRecoveryService } from './auth-recovery.service.js';
import { AuthSupportService } from './auth-support.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly accounts: AuthAccountsService,
    private readonly verification: AuthVerificationService,
    private readonly recovery: AuthRecoveryService,
    private readonly support: AuthSupportService,
    private readonly sessions: SessionService,
  ) {}

  register(dto: RegisterDto, request: Request) {
    return this.accounts.register(dto, request);
  }

  login(dto: LoginDto, request: Request, response: Response) {
    return this.accounts.login(dto, request, response);
  }

  confirmEmail(dto: OtpDto, request: Request, response: Response) {
    return this.verification.confirmEmail(dto, request, response);
  }

  resendVerification(dto: EmailDto, request: Request) {
    return this.verification.resendVerification(dto, request);
  }

  forgotPassword(dto: EmailDto, request: Request) {
    return this.recovery.forgotPassword(dto, request);
  }

  verifyPasswordOtp(dto: OtpDto, request: Request) {
    return this.recovery.verifyPasswordOtp(dto, request);
  }

  resetPassword(
    dto: ResetPasswordDto,
    request: Request,
  ): Promise<{ message: string }> {
    return this.recovery.resetPassword(dto, request);
  }

  me(auth: AuthContext) {
    return this.accounts.me(auth);
  }

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
    return this.support.serializeUser(user);
  }

  checkRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
    return this.support.checkRateLimit(key, limit, windowMs);
  }

  revokeCurrent(sessionId: string, response: Response): Promise<void> {
    return this.sessions.revokeCurrent(sessionId, response);
  }

  revokeAll(userId: string, response: Response): Promise<void> {
    return this.sessions.revokeAll(userId, response);
  }

  revokeOne(userId: string, sessionId: string): Promise<boolean> {
    return this.sessions.revokeOne(userId, sessionId);
  }

  listSessions(userId: string, currentSessionId: string) {
    return this.sessions.list(userId, currentSessionId);
  }
}
