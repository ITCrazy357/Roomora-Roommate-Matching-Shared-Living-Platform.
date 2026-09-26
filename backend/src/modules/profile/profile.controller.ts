import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_AVATAR_BYTES } from '../cloudinary/cloudinary.service.js';
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

  @Post('me/avatar')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0 },
    }),
  )
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_AVATAR_BYTES + 1 }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.profiles.uploadAvatar(request.auth.userId, file);
  }

  @Delete('me/avatar')
  @UseGuards(AuthGuard)
  removeAvatar(@Req() request: AuthenticatedRequest) {
    return this.profiles.removeAvatar(request.auth.userId);
  }
}
