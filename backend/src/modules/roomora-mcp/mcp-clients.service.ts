import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  InvalidClientMetadataError,
  InvalidClientError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { LISTINGS_READ_SCOPE } from './mcp-settings.service.js';

@Injectable()
export class McpClientsService implements OAuthRegisteredClientsStore {
  constructor(private readonly prisma: PrismaService) {}

  async getClient(
    clientId: string,
  ): Promise<OAuthClientInformationFull | undefined> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        clientId,
      )
    )
      return undefined;
    const client = await this.prisma.mcpClient.findUnique({
      where: { id: clientId },
    });
    return client
      ? (client.metadata as unknown as OAuthClientInformationFull)
      : undefined;
  }

  async registerClient(
    input: Omit<
      OAuthClientInformationFull,
      'client_id' | 'client_id_issued_at'
    >,
  ) {
    if (
      input.token_endpoint_auth_method !== 'none' ||
      input.redirect_uris.length < 1 ||
      input.redirect_uris.length > 5 ||
      (input.client_name?.length ?? 0) > 100 ||
      (input.scope && input.scope !== LISTINGS_READ_SCOPE) ||
      input.grant_types?.some(
        (type) => !['authorization_code', 'refresh_token'].includes(type),
      ) ||
      input.response_types?.some((type) => type !== 'code')
    )
      throw new InvalidClientMetadataError(
        'Use a public PKCE client with listings:read only.',
      );
    for (const value of input.redirect_uris) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new InvalidClientMetadataError('Invalid callback URL.');
      }
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
        url.hostname,
      );
      if (
        value.length > 2048 ||
        url.username ||
        url.password ||
        url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
      )
        throw new InvalidClientMetadataError(
          'Callbacks require HTTPS or HTTP loopback.',
        );
    }
    if ((await this.prisma.mcpClient.count()) >= 2000)
      throw new InvalidClientError('Client registration capacity reached.');
    const id = randomUUID();
    const client: OAuthClientInformationFull = {
      client_id: id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: input.client_name || 'Ứng dụng MCP',
      redirect_uris: input.redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: LISTINGS_READ_SCOPE,
    };
    await this.prisma.mcpClient.create({
      data: { id, metadata: client as unknown as Prisma.InputJsonValue },
    });
    return client;
  }
}
