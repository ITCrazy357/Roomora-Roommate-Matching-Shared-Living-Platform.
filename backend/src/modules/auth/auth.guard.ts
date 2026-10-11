import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../../common/request-context.js';
import { SessionService } from './session.service.js';

// Only account security and the session update stream are shared with admins.
export const AdminAccountAccess = () => SetMetadata('adminAccountAccess', true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.auth = await this.sessions.require(request);
    if (
      request.auth.role === 'ADMIN' &&
      !this.reflector.getAllAndOverride<boolean>('adminAccountAccess', [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw new ForbiddenException({
        code: 'ADMIN_WORKSPACE_ONLY',
        message:
          'Tài khoản quản trị chỉ sử dụng khu vực quản trị và bảo mật tài khoản',
      });
    }
    return true;
  }
}

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<OptionallyAuthenticatedRequest>();
    request.auth = await this.sessions.authenticate(request);
    return true;
  }
}
