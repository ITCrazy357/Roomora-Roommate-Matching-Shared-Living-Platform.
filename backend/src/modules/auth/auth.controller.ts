import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import {
  EmailDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
} from './dto/auth.dto.js';
import { SessionService } from './session.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.register(dto, request);
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(dto, request, response);
  }

  @Post('email-verification/confirm')
  @HttpCode(200)
  confirmEmail(
    @Body() dto: TokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.confirmEmail(dto.token, request, response);
  }

  @Post('email-verification/resend')
  @HttpCode(200)
  resendVerification(@Body() dto: EmailDto, @Req() request: Request) {
    return this.auth.resendVerification(dto, request);
  }

  @Post('password/forgot')
  @HttpCode(200)
  forgotPassword(@Body() dto: EmailDto, @Req() request: Request) {
    return this.auth.forgotPassword(dto, request);
  }

  @Post('password/reset')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.me(request.auth);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessions.revokeCurrent(request.auth.sessionId, response);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessions.revokeAll(request.auth.userId, response);
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  async sessionsList(@Req() request: AuthenticatedRequest) {
    return {
      sessions: await this.sessions.list(
        request.auth.userId,
        request.auth.sessionId,
      ),
    };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    await this.sessions.revokeOne(request.auth.userId, sessionId);
  }
}
