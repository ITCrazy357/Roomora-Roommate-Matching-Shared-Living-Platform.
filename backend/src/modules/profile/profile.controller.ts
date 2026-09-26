import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../../common/request-context.js';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfileService } from './profile.service.js';

@Controller('profiles')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  getMine(@Req() request: AuthenticatedRequest) {
    return this.profiles.getMine(request.auth.userId);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  updateMine(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profiles.updateMine(request.auth.userId, dto);
  }

  @Get(':userId')
  @UseGuards(OptionalAuthGuard)
  getPublic(
    @Req() request: OptionallyAuthenticatedRequest,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.profiles.getPublic(userId, request.auth?.userId);
  }
}
