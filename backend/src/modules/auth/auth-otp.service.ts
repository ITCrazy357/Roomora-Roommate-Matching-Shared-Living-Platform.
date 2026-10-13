import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { Request } from 'express';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuthSupportService } from './auth-support.service.js';
import { MailService } from './mail.service.js';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MS,
  OTP_TTL_MS,
} from './auth.constants.js';
import type { OtpDto } from './dto/auth.dto.js';

type OtpPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'ACCOUNT_CLOSURE';
const SEND_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class AuthOtpService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly support: AuthSupportService,
    private readonly mail: MailService,
  ) {
    // Development without a configured secret invalidates codes on restart.
    this.secret =
      config.get<string>('AUTH_OTP_SECRET') ?? randomBytes(32).toString('hex');
  }

  private digest(type: OtpPurpose, challengeId: string, code: string) {
    return createHmac('sha256', this.secret)
      .update(`${type}:${challengeId}:${code}`)
      .digest('hex');
  }

  private eligible(user: User | null, type: OtpPurpose): user is User {
    return Boolean(
      user &&
      !user.lockedAt &&
      (type === 'EMAIL_VERIFICATION'
        ? !user.emailVerifiedAt
        : type === 'ACCOUNT_CLOSURE'
          ? user.role === 'USER' && Boolean(user.emailVerifiedAt)
          : user.passwordHash),
    );
  }

  private lockEmail(
    transaction: Prisma.TransactionClient,
    email: string,
    type: OtpPurpose,
  ) {
    return transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auth-otp:${type}:${email}`}, 0))`;
  }

  async issue(
    email: string,
    type: OtpPurpose,
    request: Request,
    registration = false,
  ) {
    if (!registration)
      this.support.checkRateLimit(
        `otp-send:${type}:${request.ip}`,
        20,
        SEND_WINDOW_MS,
      );
    const account = await this.prisma.user.findUnique({ where: { email } });
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challengeId = randomUUID();
    const result = await this.prisma.$transaction(async (transaction) => {
      // Always lock the user first, matching session creation and ADMIN locking.
      if (account)
        await transaction.$queryRaw`SELECT id FROM users WHERE id = ${account.id}::uuid FOR UPDATE`;
      await this.lockEmail(transaction, email, type);
      const now = new Date();
      const user = account
        ? await transaction.user.findUnique({ where: { id: account.id } })
        : null;
      const previous = await transaction.authOtp.findUnique({
        where: { email_type: { email, type } },
      });
      const sameWindow =
        previous &&
        now.getTime() - previous.sendWindowAt.getTime() < SEND_WINDOW_MS;
      // Only the successful creation of a new account may replace a dummy challenge.
      const firstRegistration = registration && user && !previous?.userId;
      const reuseWindow = sameWindow && !firstRegistration;
      if (
        previous &&
        !firstRegistration &&
        (now.getTime() - previous.lastSentAt.getTime() < OTP_RESEND_MS ||
          (sameWindow && previous.sendCount >= 5))
      ) {
        const retryAt =
          sameWindow && previous.sendCount >= 5
            ? new Date(previous.sendWindowAt.getTime() + SEND_WINDOW_MS)
            : new Date(previous.lastSentAt.getTime() + OTP_RESEND_MS);
        throw new HttpException(
          {
            code: 'OTP_SEND_LIMITED',
            message: 'Vui lòng chờ trước khi gửi lại mã.',
            retryAt,
          },
          429,
        );
      }
      const data = {
        challengeId,
        email,
        type,
        userId: this.eligible(user, type) ? user.id : null,
        codeHash: this.digest(type, challengeId, code),
        attempts: 0,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        consumedAt: null,
        lastSentAt: now,
        sendWindowAt: reuseWindow ? previous.sendWindowAt : now,
        sendCount: reuseWindow ? previous.sendCount + 1 : 1,
      };
      const challenge = await transaction.authOtp.upsert({
        where: { email_type: { email, type } },
        create: data,
        update: data,
      });
      return { challenge };
    });
    let emailSent = false;
    if (result.challenge.userId) {
      emailSent = await this.support.trySend(() =>
        type === 'EMAIL_VERIFICATION'
          ? this.mail.sendVerification(email, code)
          : type === 'ACCOUNT_CLOSURE'
            ? this.mail.sendAccountClosure(email, code)
            : this.mail.sendPasswordReset(email, code),
      );
    }
    return {
      challengeId,
      expiresAt: result.challenge.expiresAt,
      resendAt: new Date(
        result.challenge.sendCount >= 5
          ? result.challenge.sendWindowAt.getTime() + SEND_WINDOW_MS
          : result.challenge.lastSentAt.getTime() + OTP_RESEND_MS,
      ),
      serverTime: new Date(),
      developmentOtp: result.challenge.userId
        ? this.mail.exposeDevelopmentOtp(code, request.ip)
        : undefined,
      emailSent,
    };
  }

  async consume<T>(
    dto: OtpDto,
    type: OtpPurpose,
    request: Request,
    action: (transaction: Prisma.TransactionClient, user: User) => Promise<T>,
  ): Promise<T> {
    this.support.checkRateLimit(
      `otp-confirm:${request.ip}`,
      60,
      15 * 60 * 1000,
    );
    const saved = await this.prisma.authOtp.findUnique({
      where: { challengeId: dto.challengeId },
    });
    const result =
      saved &&
      (await this.prisma.$transaction(async (transaction) => {
        if (saved.userId)
          await transaction.$queryRaw`SELECT id FROM users WHERE id = ${saved.userId}::uuid FOR UPDATE`;
        await this.lockEmail(transaction, saved.email, type);
        const challenge = await transaction.authOtp.findUnique({
          where: { challengeId: dto.challengeId },
        });
        const now = new Date();
        if (
          !challenge ||
          challenge.type !== type ||
          challenge.consumedAt ||
          challenge.expiresAt <= now ||
          challenge.attempts >= OTP_MAX_ATTEMPTS
        )
          return null;
        const matches = timingSafeEqual(
          Buffer.from(challenge.codeHash, 'hex'),
          Buffer.from(this.digest(type, dto.challengeId, dto.code), 'hex'),
        );
        if (!matches) {
          const attempts = challenge.attempts + 1;
          await transaction.authOtp.update({
            where: { id: challenge.id },
            data: {
              attempts,
              consumedAt: attempts >= OTP_MAX_ATTEMPTS ? now : null,
            },
          });
          // Return instead of throwing so failed attempts survive transaction commit.
          return null;
        }
        const user = challenge.userId
          ? await transaction.user.findUnique({
              where: { id: challenge.userId },
            })
          : null;
        if (!this.eligible(user, type)) return null;
        await transaction.authOtp.update({
          where: { id: challenge.id },
          data: { consumedAt: now },
        });
        return { value: await action(transaction, user) };
      }));
    if (!result)
      throw new ForbiddenException({
        code: 'OTP_INVALID',
        message:
          'Mã không đúng, đã dùng, hết hạn hoặc đã vượt giới hạn nhập sai. Hãy yêu cầu mã mới.',
      });
    return result.value;
  }
}
