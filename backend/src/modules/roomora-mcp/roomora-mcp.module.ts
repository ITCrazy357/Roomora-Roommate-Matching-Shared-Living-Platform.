import { HttpException, Module, type NestModule } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Router } from 'express';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { clientIp } from '../../common/request-context.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ListingLookupModule } from '../listing-lookup/listing-lookup.module.js';
import { McpClientsService } from './mcp-clients.service.js';
import { McpGuard, McpHttpController } from './mcp-http.controller.js';
import { McpOAuthService } from './mcp-oauth.service.js';
import {
  LISTINGS_READ_SCOPE,
  McpSettingsService,
} from './mcp-settings.service.js';

@Module({
  imports: [PrismaModule, AuthModule, ListingLookupModule],
  controllers: [McpHttpController],
  providers: [McpClientsService, McpOAuthService, McpSettingsService, McpGuard],
})
export class RoomoraMcpModule implements NestModule {
  constructor(
    private readonly oauth: McpOAuthService,
    private readonly settings: McpSettingsService,
    private readonly rates: RateLimitService,
    private readonly adapter: HttpAdapterHost,
  ) {}
  configure() {
    if (!this.settings.enabled) return;
    const base = `${this.settings.resource}/oauth`;
    const router = Router();
    router.use(
      mcpAuthMetadataRouter({
        oauthMetadata: {
          issuer: this.settings.origin,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`,
          revocation_endpoint: `${base}/revoke`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
          scopes_supported: [LISTINGS_READ_SCOPE],
        },
        resourceServerUrl: new URL(this.settings.resource),
        scopesSupported: [LISTINGS_READ_SCOPE],
        resourceName: 'Roomora public listings',
      }),
    );
    router.use('/api/v1/mcp/oauth', async (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const registration = req.path === '/register';
        await this.rates.check(
          `mcp:oauth:${registration ? 'register' : 'request'}:${clientIp(req)}`,
          registration ? 10 : 60,
          registration ? 3600_000 : 60_000,
        );
        next();
      } catch (error) {
        res
          .status(error instanceof HttpException ? error.getStatus() : 503)
          .json({ error: 'temporarily_unavailable' });
      }
    });
    router.use(
      '/api/v1/mcp/oauth/authorize',
      authorizationHandler({ provider: this.oauth, rateLimit: false }),
    );
    router.use(
      '/api/v1/mcp/oauth/token',
      tokenHandler({ provider: this.oauth, rateLimit: false }),
    );
    router.use(
      '/api/v1/mcp/oauth/register',
      clientRegistrationHandler({
        clientsStore: this.oauth.clientsStore,
        rateLimit: false,
      }),
    );
    router.use(
      '/api/v1/mcp/oauth/revoke',
      revocationHandler({ provider: this.oauth, rateLimit: false }),
    );
    // Discovery must be at the origin root, outside Nest's /api/v1 prefix.
    this.adapter.httpAdapter.use(router);
  }
}
