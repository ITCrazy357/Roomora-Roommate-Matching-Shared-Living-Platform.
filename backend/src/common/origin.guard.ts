import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Only gateway handlers that authenticate signed server notifications use this.
export const SignedPaymentNotification = () =>
  SetMetadata('signedPaymentNotification', true);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (
      this.reflector.get<boolean>(
        'signedPaymentNotification',
        context.getHandler(),
      )
    )
      return true;

    const expectedOrigin = this.config.getOrThrow<string>('FRONTEND_ORIGIN');
    if (request.headers.origin !== expectedOrigin) {
      throw new ForbiddenException({
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'Nguồn yêu cầu không được phép',
      });
    }

    return true;
  }
}
