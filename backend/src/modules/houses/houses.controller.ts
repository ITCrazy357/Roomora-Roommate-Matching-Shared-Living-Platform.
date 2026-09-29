import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  HouseAnnouncementDto,
  HouseInfoDto,
  InviteHouseDto,
  TransferHouseDto,
} from './houses.dto.js';
import { HousesService } from './houses.service.js';

@Controller('houses')
@UseGuards(AuthGuard)
export class HousesController {
  constructor(private readonly houses: HousesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.houses.list(request.auth.userId);
  }

  @Get('invites')
  invites(@Req() request: AuthenticatedRequest) {
    return this.houses.myInvites(request.auth.userId);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() input: HouseInfoDto) {
    return this.houses.create(request.auth.userId, input);
  }

  @Post('invites/:inviteId/accept')
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.houses.accept(request.auth.userId, inviteId);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.houses.get(request.auth.userId, id);
  }

  @Get(':id/invite-candidates')
  inviteCandidates(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.houses.inviteCandidates(request.auth.userId, id);
  }

  @Put(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: HouseInfoDto,
  ) {
    return this.houses.update(request.auth.userId, id, input);
  }

  @Post(':id/invites')
  invite(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: InviteHouseDto,
  ) {
    return this.houses.invite(request.auth.userId, id, input.userId);
  }

  @Delete(':id/invites/:inviteId')
  revoke(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.houses.revoke(request.auth.userId, id, inviteId);
  }

  @Post(':id/transfer')
  transfer(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TransferHouseDto,
  ) {
    return this.houses.transfer(request.auth.userId, id, input.userId);
  }

  @Post(':id/leave')
  leave(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.houses.leave(request.auth.userId, id);
  }

  @Post(':id/announcements')
  announce(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: HouseAnnouncementDto,
  ) {
    return this.houses.announce(request.auth.userId, id, input);
  }

  @Delete(':id/announcements/:announcementId')
  removeAnnouncement(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
  ) {
    return this.houses.removeAnnouncement(
      request.auth.userId,
      id,
      announcementId,
    );
  }
}
