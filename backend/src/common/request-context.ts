import type { Request } from 'express';

export interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

export interface OptionallyAuthenticatedRequest extends Request {
  auth?: AuthContext;
}

export function clientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}
