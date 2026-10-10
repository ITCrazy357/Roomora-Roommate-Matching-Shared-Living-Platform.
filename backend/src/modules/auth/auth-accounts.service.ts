import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthContext } from '../../common/request-context.js';
import { VERIFICATION_TOKEN_TTL_MS } from './auth.constants.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { MailService } from './mail.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { AuthSupportService } from './auth-support.service.js';

@Injectable()
export class AuthAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly support: AuthSupportService,
  ) {}

  async register(dto: RegisterDto, request: Request) {
    this.support.checkRateLimit(`register:${request.ip}`, 5, 60 * 60 * 1000);
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
      if (this.support.isUniqueConstraint(error)) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_USED',
          message: 'Email đã được sử dụng',
        });
      }
      throw error;
    }

    const actionUrl = await this.support.createActionUrl(
      user.id,
      'EMAIL_VERIFICATION',
      '/xac-minh-email',
      VERIFICATION_TOKEN_TTL_MS,
    );
    const emailSent = await this.support.trySend(() =>
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
    this.support.checkRateLimit(`login:${request.ip}`, 50, 15 * 60 * 1000);
    this.support.checkRateLimit(
      `login:${request.ip}:${dto.email}`,
      10,
      15 * 60 * 1000,
    );
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
    return { user: this.support.serializeUser(user) };
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
    return { user: this.support.serializeUser(user) };
  }
}
