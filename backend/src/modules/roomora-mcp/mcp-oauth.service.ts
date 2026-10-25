import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../common/request-context.js';
import { hashToken, randomToken } from '../auth/token.utils.js';
import { McpClientsService } from './mcp-clients.service.js';
import {
  McpSettingsService,
  LISTINGS_READ_SCOPE,
} from './mcp-settings.service.js';

const sessionSelect = {
  id: true,
  userId: true,
  expiresAt: true,
  revokedAt: true,
  user: {
    select: {
      role: true,
      lockedAt: true,
      closedAt: true,
      emailVerifiedAt: true,
    },
  },
} satisfies Prisma.SessionSelect;
type Session = Prisma.SessionGetPayload<{ select: typeof sessionSelect }>;
const active = (session: Session | null): session is Session =>
  !!session &&
  !session.revokedAt &&
  session.expiresAt > new Date() &&
  session.user.role === 'USER' &&
  !session.user.lockedAt &&
  !session.user.closedAt &&
  !!session.user.emailVerifiedAt;
const ACCESS_MS = 15 * 60_000;

@Injectable()
export class McpOAuthService implements OAuthServerProvider {
  constructor(
    readonly clientsStore: McpClientsService,
    private readonly prisma: PrismaService,
    private readonly settings: McpSettingsService,
  ) {}

  private resource(resource?: URL) {
    if (resource?.href !== this.settings.resource)
      throw new InvalidRequestError('Invalid resource audience.');
  }
  private scopes(scopes?: string[]) {
    if (scopes?.some((scope) => scope !== LISTINGS_READ_SCOPE))
      throw new InvalidScopeError('Only listings:read is supported.');
  }
  private async requireSession(
    auth: AuthContext,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const session = await tx.session.findUnique({
      where: { id: auth.sessionId },
      select: sessionSelect,
    });
    if (!active(session) || session.userId !== auth.userId)
      throw new ForbiddenException({ code: 'MCP_ACCOUNT_NOT_ALLOWED' });
    return session;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ) {
    this.resource(params.resource);
    this.scopes(params.scopes);
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge) ||
      (params.state?.length ?? 0) > 1024
    )
      throw new InvalidRequestError('Invalid PKCE challenge or state.');
    await this.prisma.mcpAuthorization.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } },
    });
    const authorization = await this.prisma.mcpAuthorization.create({
      data: {
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        state: params.state,
        codeChallenge: params.codeChallenge,
        resource: this.settings.resource,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(
      303,
      `${this.settings.frontend}/mcp/uy-quyen?request=${authorization.id}`,
    );
  }

  async consentDetails(id: string, auth: AuthContext) {
    await this.requireSession(auth);
    const request = await this.prisma.mcpAuthorization.findUnique({
      where: { id },
      include: { client: true },
    });
    if (
      !request ||
      request.expiresAt <= new Date() ||
      request.approvedAt ||
      request.consumedAt
    )
      throw new NotFoundException({ code: 'MCP_AUTHORIZATION_EXPIRED' });
    const client = request.client
      .metadata as unknown as OAuthClientInformationFull;
    return {
      clientName: client.client_name,
      callbackOrigin: new URL(request.redirectUri).origin,
      scope: LISTINGS_READ_SCOPE,
      resource: request.resource,
      expiresAt: request.expiresAt,
    };
  }

  async decide(id: string, auth: AuthContext, allow: boolean) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${auth.userId}::uuid FOR UPDATE`;
      await this.requireSession(auth, tx);
      const request = await tx.mcpAuthorization.findUnique({ where: { id } });
      if (
        !request ||
        request.resource !== this.settings.resource ||
        request.expiresAt <= new Date() ||
        request.approvedAt ||
        request.consumedAt
      )
        throw new BadRequestException({ code: 'MCP_AUTHORIZATION_EXPIRED' });
      const code = randomToken();
      const updated = await tx.mcpAuthorization.updateMany({
        where: {
          id,
          approvedAt: null,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: allow
          ? {
              approvedAt: new Date(),
              userId: auth.userId,
              sessionId: auth.sessionId,
              codeHash: hashToken(code),
              expiresAt: new Date(Date.now() + 60_000),
            }
          : { consumedAt: new Date() },
      });
      if (updated.count !== 1)
        throw new BadRequestException({ code: 'MCP_AUTHORIZATION_EXPIRED' });
      const callback = new URL(request.redirectUri);
      if (request.state !== null)
        callback.searchParams.set('state', request.state);
      callback.searchParams.set(
        allow ? 'code' : 'error',
        allow ? code : 'access_denied',
      );
      return { redirectUrl: callback.href };
    });
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    const request = await this.prisma.mcpAuthorization.findUnique({
      where: { codeHash: hashToken(code) },
    });
    if (
      !request ||
      request.clientId !== client.client_id ||
      !request.approvedAt ||
      request.consumedAt ||
      request.expiresAt <= new Date()
    )
      throw new InvalidGrantError('Invalid authorization code.');
    return request.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.resource(resource);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.mcpAuthorization.findUnique({
        where: { codeHash: hashToken(code) },
      });
      if (
        !request ||
        !request.userId ||
        !request.sessionId ||
        request.clientId !== client.client_id ||
        request.redirectUri !== redirectUri ||
        request.resource !== this.settings.resource ||
        !request.approvedAt ||
        request.consumedAt ||
        request.expiresAt <= new Date()
      )
        throw new InvalidGrantError('Invalid authorization code.');
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${request.userId}::uuid FOR UPDATE`;
      const session = await tx.session.findUnique({
        where: { id: request.sessionId },
        select: sessionSelect,
      });
      if (!active(session) || session.userId !== request.userId)
        throw new InvalidGrantError('Account session is unavailable.');
      const changed = await tx.mcpAuthorization.updateMany({
        where: { id: request.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (changed.count !== 1)
        throw new InvalidGrantError('Authorization code already used.');
      const count = await tx.mcpGrant.count({
        where: {
          userId: request.userId,
          revokedAt: null,
          refreshExpiresAt: { gt: new Date() },
        },
      });
      if (count >= 10)
        throw new InvalidGrantError(
          'Revoke an existing connection before creating another.',
        );
      const access = `mcp_access_${randomToken()}`,
        refresh = `mcp_refresh_${randomToken()}`;
      const grant = await tx.mcpGrant.create({
        data: {
          clientId: client.client_id,
          userId: request.userId,
          sessionId: request.sessionId,
          accessHash: hashToken(access),
          resource: this.settings.resource,
          expiresAt: new Date(
            Math.min(Date.now() + ACCESS_MS, session.expiresAt.getTime()),
          ),
          refreshExpiresAt: new Date(
            Math.min(Date.now() + 14 * 86400_000, session.expiresAt.getTime()),
          ),
        },
      });
      await tx.mcpRefreshToken.create({
        data: { hash: hashToken(refresh), grantId: grant.id },
      });
      return this.tokens(access, refresh, grant.expiresAt);
    });
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    token: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.resource(resource);
    this.scopes(scopes);
    const result = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.mcpRefreshToken.findUnique({
        where: { hash: hashToken(token) },
      });
      if (!stored) throw new InvalidGrantError('Invalid refresh token.');
      await tx.$queryRaw`SELECT id FROM mcp_grants WHERE id = ${stored.grantId}::uuid FOR UPDATE`;
      const fresh = await tx.mcpRefreshToken.findUniqueOrThrow({
        where: { hash: stored.hash },
        include: { grant: { include: { session: { select: sessionSelect } } } },
      });
      const grant = fresh.grant;
      if (
        grant.clientId !== client.client_id ||
        grant.resource !== this.settings.resource ||
        grant.revokedAt ||
        grant.refreshExpiresAt <= new Date() ||
        !active(grant.session) ||
        grant.userId !== grant.session.userId
      )
        throw new InvalidGrantError('Invalid refresh token.');
      if (fresh.consumedAt) {
        // Commit revocation before reporting reuse; throwing inside would roll it back.
        await tx.mcpGrant.update({
          where: { id: grant.id },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      const access = `mcp_access_${randomToken()}`,
        refresh = `mcp_refresh_${randomToken()}`;
      const expiresAt = new Date(
        Math.min(Date.now() + ACCESS_MS, grant.refreshExpiresAt.getTime()),
      );
      await tx.mcpRefreshToken.update({
        where: { hash: stored.hash },
        data: { consumedAt: new Date() },
      });
      await tx.mcpRefreshToken.create({
        data: { hash: hashToken(refresh), grantId: grant.id },
      });
      await tx.mcpGrant.update({
        where: { id: grant.id },
        data: { accessHash: hashToken(access), expiresAt },
      });
      return this.tokens(access, refresh, expiresAt);
    });
    if (!result)
      throw new InvalidGrantError(
        'Refresh token reuse detected; connection revoked.',
      );
    return result;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (!/^mcp_access_[A-Za-z0-9_-]{43}$/.test(token))
      throw new InvalidTokenError('Invalid access token.');
    const grant = await this.prisma.mcpGrant.findUnique({
      where: { accessHash: hashToken(token) },
      include: { session: { select: sessionSelect } },
    });
    if (
      !grant ||
      grant.revokedAt ||
      grant.expiresAt <= new Date() ||
      grant.resource !== this.settings.resource ||
      !active(grant.session) ||
      grant.userId !== grant.session.userId
    )
      throw new InvalidTokenError('Access expired or revoked.');
    return {
      token,
      clientId: grant.clientId,
      scopes: [LISTINGS_READ_SCOPE],
      expiresAt: Math.floor(grant.expiresAt.getTime() / 1000),
      resource: new URL(grant.resource),
      extra: { userId: grant.userId },
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    input: OAuthTokenRevocationRequest,
  ) {
    const refresh = await this.prisma.mcpRefreshToken.findUnique({
      where: { hash: hashToken(input.token) },
    });
    await this.prisma.mcpGrant.updateMany({
      where: {
        clientId: client.client_id,
        OR: [
          { accessHash: hashToken(input.token) },
          ...(refresh ? [{ id: refresh.grantId }] : []),
        ],
      },
      data: { revokedAt: new Date() },
    });
  }

  async connections(auth: AuthContext) {
    await this.requireSession(auth);
    const grants = await this.prisma.mcpGrant.findMany({
      where: {
        userId: auth.userId,
        revokedAt: null,
        refreshExpiresAt: { gt: new Date() },
        session: { revokedAt: null, expiresAt: { gt: new Date() } },
      },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return grants.map((grant) => ({
      id: grant.id,
      clientName: (
        grant.client.metadata as unknown as OAuthClientInformationFull
      ).client_name,
      createdAt: grant.createdAt,
      expiresAt: grant.refreshExpiresAt,
      scope: LISTINGS_READ_SCOPE,
    }));
  }

  async disconnect(auth: AuthContext, id: string) {
    await this.requireSession(auth);
    await this.prisma.mcpGrant.updateMany({
      where: { id, userId: auth.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private tokens(
    access: string,
    refresh: string,
    expiresAt: Date,
  ): OAuthTokens {
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      scope: LISTINGS_READ_SCOPE,
      expires_in: Math.max(
        0,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      ),
    };
  }
}
