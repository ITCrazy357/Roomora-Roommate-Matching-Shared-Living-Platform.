import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from './auth.guard.js';
import { LinkGoogleDto } from './dto/auth.dto.js';
import { GoogleAuthService } from './google-auth.service.js';
import { GoogleClientService } from './google-client.service.js';

@Controller('auth')
export class GoogleAuthController {
  constructor(
    private readonly googleAuth: GoogleAuthService,
    private readonly googleClient: GoogleClientService,
  ) {}

  @Get('config')
  @Header('Cache-Control', 'no-store')
  config() {
    return { googleEnabled: this.googleClient.enabled };
  }

  @Get('google')
  async start(@Req() request: Request, @Res() response: Response) {
    response.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    try {
      response.redirect(await this.googleAuth.start(request, response));
    } catch (error) {
      response.redirect(this.googleAuth.errorRedirect(error));
    }
  }

  @Get('google/callback')
  async callback(@Req() request: Request, @Res() response: Response) {
    response.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    response.redirect(await this.googleAuth.callback(request, response));
  }

  @Get('google/status')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  status(@Req() request: AuthenticatedRequest) {
    return this.googleAuth.status(request.auth.userId);
  }

  @Post('google/link')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  link(
    @Body() dto: LinkGoogleDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.googleAuth.startLink(request, response, dto.password);
  }
}
