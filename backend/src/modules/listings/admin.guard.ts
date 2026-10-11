import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { SessionService } from '../auth/session.service.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.auth = await this.sessions.require(request);
    if (request.auth.role !== 'ADMIN')
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Chỉ quản trị viên được truy cập khu vực này',
      });
    return true;
  }
}
