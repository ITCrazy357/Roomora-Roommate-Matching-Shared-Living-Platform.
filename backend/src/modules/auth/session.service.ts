import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthContext } from '../../common/request-context.js';
import {
  cookieName,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from './auth.constants.js';
import { hashToken, parseCookie, randomToken } from './token.utils.js';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(
    userId: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    const token = randomToken();
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        userAgent: request.headers['user-agent']?.slice(0, 500),
        ipAddress: (request.ip || request.socket.remoteAddress)?.slice(0, 64),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    this.setCookie(response, token);
  }

  async authenticate(request: Request): Promise<AuthContext | undefined> {
    const token = this.readCookie(request);
    if (!token) return undefined;

    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= now) {
      return undefined;
    }

    if (now.getTime() - session.lastSeenAt.getTime() > 15 * 60 * 1000) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
    }

    return {
      userId: session.userId,
      sessionId: session.id,
      email: session.user.email,
    };
  }

  async require(request: Request): Promise<AuthContext> {
    const auth = await this.authenticate(request);
    if (!auth) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Bạn cần đăng nhập',
      });
    }
    return auth;
  }

  async revokeCurrent(sessionId: string, response: Response): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.clearCookie(response);
  }

  async revokeAll(userId: string, response: Response): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.clearCookie(response);
  }

  async revokeOne(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count === 1;
  }

  async list(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      current: session.id === currentSessionId,
    }));
  }

  clearCookie(response: Response): void {
    response.clearCookie(this.cookieName(), {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: '/',
    });
  }

  private setCookie(response: Response, token: string): void {
    response.cookie(this.cookieName(), token, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
  }

  private readCookie(request: Request): string | undefined {
    return parseCookie(request.headers.cookie, this.cookieName());
  }

  private cookieName(): string {
    return cookieName(SESSION_COOKIE, this.isProduction());
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
