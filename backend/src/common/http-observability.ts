import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const logger = new Logger('HTTP');

// URLs, bodies, cookies and query strings can contain secrets; log route templates only.
export function observeHttp(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();
  const started = performance.now();
  response.setHeader('X-Request-ID', requestId);
  let recorded = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    const route: unknown = request.route?.path;
    const durationMs = Math.round(performance.now() - started);
    const contentType = response.getHeader('Content-Type');
    const streaming =
      typeof contentType === 'string' &&
      contentType.startsWith('text/event-stream');
    if (request.path.startsWith('/api/v1/health') && response.statusCode < 400)
      return;
    const entry = {
      event: 'http_request',
      requestId,
      method: request.method,
      route: typeof route === 'string' ? route : 'unmatched',
      status: response.statusCode,
      durationMs,
      aborted: !response.writableFinished,
      streaming,
    };
    if (
      entry.status >= 500 ||
      (!streaming && (entry.aborted || durationMs >= 1000))
    )
      logger.warn(entry);
    else if (process.env.NODE_ENV === 'production') logger.log(entry);
  };
  response.once('finish', record);
  response.once('close', record);
  next();
}
