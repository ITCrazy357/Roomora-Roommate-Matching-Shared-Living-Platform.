import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const LISTINGS_READ_SCOPE = 'listings:read';

@Injectable()
export class McpSettingsService {
  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return this.config.get<boolean>('MCP_ENABLED', false);
  }
  get origin() {
    return this.config.getOrThrow<string>('MCP_PUBLIC_ORIGIN');
  }
  get resource() {
    return `${this.origin}/api/v1/mcp`;
  }
  get frontend() {
    return this.config.getOrThrow<string>('FRONTEND_ORIGIN');
  }
  get allowedOrigins() {
    return [
      this.frontend,
      ...this.config
        .get<string>('MCP_ALLOWED_ORIGINS', '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ];
  }
  requireEnabled() {
    if (!this.enabled)
      throw new ServiceUnavailableException({ code: 'MCP_DISABLED' });
  }
}
