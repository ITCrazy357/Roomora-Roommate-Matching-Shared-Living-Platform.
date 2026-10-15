import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminGuard } from '../listings/admin.guard.js';
import {
  DeclareIdentityDto,
  IdentityAccessDto,
  IdentityQuery,
  ReviewIdentityDto,
} from './dto/identity.dto.js';
import { IdentityService } from './identity.service.js';

@Controller('identity')
@UseGuards(AuthGuard)
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}
  @Get('me') @Header('Cache-Control', 'no-store') async mine(
    @Req() req: AuthenticatedRequest,
  ) {
    return { declaration: await this.identity.mine(req.auth.userId) };
  }
  @Get('status') @Header('Cache-Control', 'no-store') async status(
    @Req() req: AuthenticatedRequest,
  ) {
    return { declaration: await this.identity.status(req.auth.userId) };
  }
  @Put('me') @Header('Cache-Control', 'no-store') declare(
    @Req() req: AuthenticatedRequest,
    @Body() dto: DeclareIdentityDto,
  ) {
    return this.identity.declare(req.auth.userId, dto);
  }
}

@Controller('admin/identities')
@UseGuards(AdminGuard)
export class AdminIdentityController {
  constructor(private readonly identity: IdentityService) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @Query() query: IdentityQuery,
  ) {
    return this.identity.list(query);
  }
  @Get(':userId') @Header('Cache-Control', 'no-store') detail(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.identity.detail(req.auth.userId, userId);
  }
  @Post(':userId/reveal') @Header('Cache-Control', 'no-store') reveal(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: IdentityAccessDto,
  ) {
    return this.identity.reveal(req.auth.userId, userId, dto);
  }
  @Patch(':userId') @Header('Cache-Control', 'no-store') review(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ReviewIdentityDto,
  ) {
    return this.identity.review(req.auth.userId, userId, dto);
  }
}
