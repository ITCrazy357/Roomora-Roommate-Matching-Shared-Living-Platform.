import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../../common/request-context.js';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { MAX_AVATAR_BYTES } from '../cloudinary/cloudinary.service.js';
import { AdminGuard } from './admin.guard.js';
import {
  ListingInputDto,
  ListingQueryDto,
  ListingVersionDto,
  ReviewListingDto,
  UpdateListingDto,
} from './dto/listing.dto.js';
import { ListingsService } from './listings.service.js';

class PhotoVersionDto extends ListingVersionDto {
  @Type(() => Number)
  declare version: number;
}

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  list(
    @Query() query: ListingQueryDto,
    @Req() request: OptionallyAuthenticatedRequest,
  ) {
    return this.listings.listPublic(query, request.auth?.userId);
  }
  @Get('mine')
  @UseGuards(AuthGuard)
  mine(@Query() query: ListingQueryDto, @Req() request: AuthenticatedRequest) {
    return this.listings.listMine(request.auth.userId, query);
  }
  @Get('saved')
  @UseGuards(AuthGuard)
  saved(@Query() query: ListingQueryDto, @Req() request: AuthenticatedRequest) {
    return this.listings.listSaved(request.auth.userId, query);
  }
  @Get('mine/:id')
  @UseGuards(AuthGuard)
  getMine(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.listings.getMine(request.auth.userId, id);
  }
  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: OptionallyAuthenticatedRequest,
  ) {
    return this.listings.getPublic(id, request.auth?.userId);
  }
  @Post()
  @UseGuards(AuthGuard)
  create(@Body() input: ListingInputDto, @Req() request: AuthenticatedRequest) {
    return this.listings.create(request.auth.userId, input);
  }
  @Put(':id')
  @UseGuards(AuthGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateListingDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.listings.update(request.auth.userId, id, input);
  }
  @Post(':id/submit')
  @UseGuards(AuthGuard)
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ListingVersionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.listings.submit(request.auth.userId, id, input.version);
  }
  @Post(':id/close')
  @UseGuards(AuthGuard)
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ListingVersionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.listings.close(request.auth.userId, id, input.version);
  }
  @Post(':id/photos')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 1 },
    }),
  )
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PhotoVersionDto,
    @UploadedFile(new ParseFilePipe()) file: Express.Multer.File,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.listings.uploadPhoto(
      request.auth.userId,
      id,
      input.version,
      file,
    );
  }
  @Delete(':id/photos/:photoId')
  @UseGuards(AuthGuard)
  removePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Body() input: ListingVersionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.listings.removePhoto(
      request.auth.userId,
      id,
      photoId,
      input.version,
    );
  }
  @Post(':id/save')
  @UseGuards(AuthGuard)
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.listings.save(request.auth.userId, id);
  }
  @Delete(':id/save')
  @UseGuards(AuthGuard)
  unsave(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.listings.unsave(request.auth.userId, id);
  }
}

@Controller('admin/listings')
@UseGuards(AdminGuard)
export class ListingModerationController {
  constructor(private readonly listings: ListingsService) {}
  @Get()
  list(@Query() query: ListingQueryDto) {
    return this.listings.listModeration(query);
  }
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.listings.getModeration(id);
  }
  @Post(':id/review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReviewListingDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.listings.review(request.auth.userId, id, input);
  }
}
