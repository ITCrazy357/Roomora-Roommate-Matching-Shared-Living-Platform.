import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { ReportQueryDto } from '../household/dto/household.dto.js';
import { AiProviderService } from './ai-provider.service.js';
import { AiListingsService } from './ai-listings.service.js';
import { AiReceiptsService } from './ai-receipts.service.js';
import { AiInsightsService } from './ai-insights.service.js';
import {
  AiDescriptionDto,
  AiReceiptDto,
  AiSearchDto,
  AiSummaryDto,
  AiSummaryNotesDto,
} from './dto/ai.dto.js';
import { AiSummariesService } from './ai-summaries.service.js';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(
    private readonly provider: AiProviderService,
    private readonly listings: AiListingsService,
    private readonly receipts: AiReceiptsService,
    private readonly insights: AiInsightsService,
    private readonly summaries: AiSummariesService,
  ) {}
  @Get('usage') usage(@Req() req: AuthenticatedRequest) {
    return this.provider.usage(req.auth.userId);
  }
  @Post('listing-description')
  @HttpCode(200)
  description(@Req() req: AuthenticatedRequest, @Body() dto: AiDescriptionDto) {
    return this.listings.description(req.auth.userId, dto);
  }
  @Post('search-filters')
  @HttpCode(200)
  search(@Req() req: AuthenticatedRequest, @Body() dto: AiSearchDto) {
    return this.listings.search(req.auth.userId, dto);
  }
  @Post('receipt-draft')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('receipt', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  receipt(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AiReceiptDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.receipts.read(req.auth.userId, dto.houseId, file);
  }
  @Post('people/:id/explanation')
  @HttpCode(200)
  matching(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.insights.matching(req.auth.userId, id);
  }
  @Post('houses/:id/summary')
  @HttpCode(200)
  summary(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AiSummaryDto,
  ) {
    return this.summaries.generate(
      req.auth.userId,
      id,
      dto.month,
      dto.regenerate,
    );
  }
  @Get('houses/:id/summary')
  async savedSummary(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: ReportQueryDto,
  ) {
    return {
      summary: await this.summaries.get(req.auth.userId, id, dto.month),
    };
  }
  @Patch('houses/:id/summary/notes')
  summaryNotes(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AiSummaryNotesDto,
  ) {
    return this.summaries.saveNotes(req.auth.userId, id, dto);
  }
}
