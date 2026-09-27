import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../../common/request-context.js';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { PeopleService } from './people.service.js';
import {
  ConnectionQuery,
  ConnectionVersionDto,
  PeopleQuery,
  ReportUserDto,
  SendConnectionDto,
} from './people.dto.js';

@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}
  @Get()
  @UseGuards(OptionalAuthGuard)
  search(
    @Req() request: OptionallyAuthenticatedRequest,
    @Query() query: PeopleQuery,
  ) {
    return this.people.search(query, request.auth?.userId);
  }
  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  get(
    @Req() request: OptionallyAuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.people.getPerson(id, request.auth?.userId);
  }
}

@Controller('connections')
@UseGuards(AuthGuard)
export class ConnectionsController {
  constructor(private readonly people: PeopleService) {}
  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ConnectionQuery) {
    return this.people.listConnections(request.auth.userId, query);
  }
  @Post()
  send(@Req() request: AuthenticatedRequest, @Body() dto: SendConnectionDto) {
    return this.people.send(request.auth.userId, dto);
  }
  @Post(':id/accept')
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConnectionVersionDto,
  ) {
    return this.people.respond(request.auth.userId, id, dto.version, 'accept');
  }
  @Post(':id/decline')
  decline(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConnectionVersionDto,
  ) {
    return this.people.respond(request.auth.userId, id, dto.version, 'decline');
  }
  @Post(':id/cancel')
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConnectionVersionDto,
  ) {
    return this.people.respond(request.auth.userId, id, dto.version, 'cancel');
  }
}

@Controller('user-safety')
@UseGuards(AuthGuard)
export class UserSafetyController {
  constructor(private readonly people: PeopleService) {}
  @Post(':id/block')
  block(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.people.block(request.auth.userId, id);
  }
  @Delete(':id/block')
  unblock(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.people.unblock(request.auth.userId, id);
  }
  @Post(':id/report')
  report(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReportUserDto,
  ) {
    return this.people.report(request.auth.userId, id, dto);
  }
}
