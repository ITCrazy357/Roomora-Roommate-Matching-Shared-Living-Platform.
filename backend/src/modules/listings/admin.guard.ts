import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { SessionService } from '../auth/session.service.js';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.auth = await this.sessions.require(request);
    const user = await this.prisma.user.findUnique({
      where: { id: request.auth.userId },
      select: { role: true },
    });
    if (user?.role !== 'ADMIN')
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Chỉ quản trị viên được kiểm duyệt tin',
      });
    return true;
  }
}
