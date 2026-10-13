import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from './auth.guard.js';
import { AccountClosureService } from './account-closure.service.js';
import { SessionService } from './session.service.js';
import { AccountClosureDto } from './dto/account-closure.dto.js';

@Controller('auth/account-closure')
@UseGuards(AuthGuard)
export class AccountClosureController {
  constructor(
    private readonly closure: AccountClosureService,
    private readonly sessions: SessionService,
  ) {}
  @Post('request')
  @HttpCode(200)
  request(@Req() req: AuthenticatedRequest) {
    return this.closure.request(req.auth.userId, req);
  }
  @Post()
  @HttpCode(200)
  async close(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AccountClosureDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.closure.close(req.auth.userId, dto, req);
    this.sessions.clearCookie(response);
    return result;
  }
}
