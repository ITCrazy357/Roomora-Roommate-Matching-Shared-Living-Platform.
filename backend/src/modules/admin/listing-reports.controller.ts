import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { ReportUserDto } from '../people/dto/people.dto.js';
import { ListingReportsService } from './listing-reports.service.js';

@Controller('listings/:id/reports')
@UseGuards(AuthGuard)
export class ListingReportsController {
  constructor(private readonly reports: ListingReportsService) {}
  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportUserDto,
  ) {
    return this.reports.create(req.auth.userId, id, dto);
  }
}
