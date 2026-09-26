import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../../common/request-context.js';
import { SessionService } from './session.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.auth = await this.sessions.require(request);
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
