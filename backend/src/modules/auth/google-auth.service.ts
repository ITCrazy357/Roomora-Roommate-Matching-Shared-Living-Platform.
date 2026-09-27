import {
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { cookieName } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthError } from './google-auth.error.js';
import {
  GoogleClientService,
  type GoogleIdentity,
} from './google-client.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { hashToken, parseCookie, randomToken } from './token.utils.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_COOKIE = 'roomora_google';
const SETTINGS_PATH = '/tai-khoan/cai-dat';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly google: GoogleClientService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
  ) {}

  async status(userId: string) {
    const account = await this.prisma.googleAccount.findUnique({
      where: { userId },
    });
    return { enabled: this.google.enabled, linked: Boolean(account) };
  }

  async start(request: Request, response: Response, linkSessionId?: string) {
    this.auth.checkRateLimit(`google:${request.ip}`, 30, STATE_TTL_MS);
    const state = randomToken();
    const browserToken = randomToken();
    const nonce = randomToken();
    const authorization = await this.google.createAuthorization(state, nonce);
    const previousCookie = parseCookie(
      request.headers.cookie,
      this.cookieName(),
    );

    // Remove expired attempts and any previous attempt from this browser.
    await this.prisma.googleLoginState.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: new Date() } },
          ...(previousCookie
            ? [{ browserTokenHash: hashToken(previousCookie) }]
            : []),
        ],
      },
    });
    await this.prisma.googleLoginState.create({
      data: {
        stateHash: hashToken(state),
        browserTokenHash: hashToken(browserToken),
        nonce,
        codeVerifier: authorization.codeVerifier,
        linkSessionId,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    response.cookie(this.cookieName(), browserToken, {
      ...this.cookieOptions(),
      maxAge: STATE_TTL_MS,
    });
    return authorization.url;
  }

  async startLink(
    request: AuthenticatedRequest,
    response: Response,
    password: string,
  ) {
    this.auth.checkRateLimit(
      `google-link:${request.auth.userId}`,
      5,
      STATE_TTL_MS,
    );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: request.auth.userId },
      include: { googleAccount: true },
    });
    if (user.googleAccount) throw new GoogleAuthError('GOOGLE_LINK_CONFLICT');
    if (
      !user.passwordHash ||
      !(await this.passwords.verify(password, user.passwordHash))
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Mật khẩu không đúng',
      });
    }
    return { url: await this.start(request, response, request.auth.sessionId) };
  }

  async callback(request: Request, response: Response): Promise<string> {
    let errorPath = '/dang-nhap';
    try {
      const savedState = await this.consumeState(request);
      response.clearCookie(this.cookieName(), this.cookieOptions());
      if (savedState.linkSessionId) errorPath = SETTINGS_PATH;

      if (request.query.error !== undefined) {
        throw new GoogleAuthError(
          request.query.error === 'access_denied'
            ? 'GOOGLE_CANCELLED'
            : 'GOOGLE_UNAVAILABLE',
        );
      }
      const code = request.query.code;
      if (typeof code !== 'string' || !code || code.length > 4096) {
        throw new GoogleAuthError('GOOGLE_TOKEN_INVALID');
      }
      const identity = await this.google.verifyCode(
        code,
        savedState.codeVerifier,
        savedState.nonce,
      );

      if (savedState.linkSessionId) {
        await this.linkAccount(identity, savedState.linkSessionId, request);
        return this.frontendUrl(SETTINGS_PATH, 'linked');
      }

      const user = await this.findOrCreateUser(identity);
      await this.sessions.create(user.id, request, response);
      return this.frontendUrl(
        user.profile?.onboardingCompletedAt
          ? '/tai-khoan/ho-so'
          : '/onboarding',
      );
    } catch (error) {
      return this.errorRedirect(error, errorPath);
    }
  }

  errorRedirect(error: unknown, path = '/dang-nhap'): string {
    if (error instanceof HttpException && error.getStatus() === 429) {
      return this.frontendUrl(path, 'RATE_LIMITED');
    }
    if (!(error instanceof GoogleAuthError)) {
      // Do not log raw provider/HTTP errors: they can include secrets.
      this.logger.warn('Google sign-in could not be completed');
    }
    return this.frontendUrl(
      path,
      error instanceof GoogleAuthError ? error.code : 'GOOGLE_UNAVAILABLE',
    );
  }

  private async consumeState(request: Request) {
    const state = request.query.state;
    const browserToken = parseCookie(request.headers.cookie, this.cookieName());
    if (
      typeof state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !browserToken
    ) {
      throw new GoogleAuthError('GOOGLE_STATE_INVALID');
    }
    const stateHash = hashToken(state);
    const browserTokenHash = hashToken(browserToken);
    const saved = await this.prisma.googleLoginState.findUnique({
      where: { stateHash },
    });
    if (
      !saved ||
      saved.browserTokenHash !== browserTokenHash ||
      saved.expiresAt <= new Date()
    ) {
      throw new GoogleAuthError('GOOGLE_STATE_INVALID');
    }

    // Atomic delete prevents two concurrent callbacks from using the same state.
    const consumed = await this.prisma.googleLoginState.deleteMany({
      where: { stateHash, browserTokenHash, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) throw new GoogleAuthError('GOOGLE_STATE_INVALID');
    return saved;
  }

  private async findOrCreateUser(identity: GoogleIdentity) {
    const account = await this.prisma.googleAccount.findUnique({
      where: { googleId: identity.googleId },
      include: { user: { include: { profile: true } } },
    });
    if (account) return account.user;

    const existing = await this.prisma.user.findUnique({
      where: { email: identity.email },
    });
    if (existing) throw new GoogleAuthError('GOOGLE_ACCOUNT_EXISTS');

    try {
      return await this.prisma.user.create({
        data: {
          email: identity.email,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: identity.displayName } },
          googleAccount: { create: { googleId: identity.googleId } },
        },
        include: { profile: true },
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      // Another callback may have created this Google account in the meantime.
      const created = await this.prisma.googleAccount.findUnique({
        where: { googleId: identity.googleId },
        include: { user: { include: { profile: true } } },
      });
      if (created) return created.user;
      throw new GoogleAuthError('GOOGLE_ACCOUNT_EXISTS');
    }
  }

  private async linkAccount(
    identity: GoogleIdentity,
    sessionId: string,
    request: Request,
  ) {
    const auth = await this.sessions.authenticate(request);
    if (!auth || auth.sessionId !== sessionId) {
      throw new GoogleAuthError('GOOGLE_LINK_SESSION_EXPIRED');
    }
    if (auth.email !== identity.email)
      throw new GoogleAuthError('GOOGLE_EMAIL_MISMATCH');
    try {
      await this.prisma.googleAccount.create({
        data: { userId: auth.userId, googleId: identity.googleId },
      });
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new GoogleAuthError('GOOGLE_LINK_CONFLICT');
      throw error;
    }
  }

  private frontendUrl(path: string, result?: string) {
    const url = new URL(
      path,
      this.config.getOrThrow<string>('FRONTEND_ORIGIN'),
    );
    if (result) url.searchParams.set('google', result);
    return url.toString();
  }

  private cookieName() {
    return cookieName(
      STATE_COOKIE,
      this.config.get<string>('NODE_ENV') === 'production',
    );
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  private isUniqueConstraint(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
