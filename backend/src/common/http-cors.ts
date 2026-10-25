import type { Request } from 'express';
import type { ConfigService } from '@nestjs/config';

export function httpCors(config: ConfigService) {
  const frontend = config.getOrThrow<string>('FRONTEND_ORIGIN');
  const allowed = [
    frontend,
    ...config
      .get<string>('MCP_ALLOWED_ORIGINS', '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ];
  return (
    req: Request,
    callback: (
      error: Error | null,
      options: {
        origin: string | boolean;
        credentials: boolean;
        exposedHeaders: string[];
      },
    ) => void,
  ) => {
    const oauth =
      req.path.startsWith('/api/v1/mcp/oauth/') ||
      req.path.startsWith('/.well-known/');
    const mcp = req.path === '/api/v1/mcp';
    callback(null, {
      origin: oauth
        ? true
        : mcp
          ? !!req.headers.origin && allowed.includes(req.headers.origin)
          : frontend,
      credentials: !oauth && !mcp,
      exposedHeaders: [
        'X-Request-ID',
        'WWW-Authenticate',
        'MCP-Protocol-Version',
      ],
    });
  };
}
