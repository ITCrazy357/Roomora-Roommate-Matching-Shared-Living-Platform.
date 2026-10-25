import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/request-context.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { LookupChatService } from './lookup-chat.service.js';
import { lookupQuestionSchema } from './lookup.schemas.js';

@Controller('support/chat/listings')
@UseGuards(AuthGuard)
export class LookupController {
  constructor(
    private readonly chat: LookupChatService,
    private readonly rates: RateLimitService,
  ) {}
  @Post()
  @HttpCode(200)
  async answer(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    await this.rates.check(`lookup:user:${req.auth.userId}`, 20, 60_000);
    const parsed = lookupQuestionSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ code: 'LOOKUP_QUESTION_INVALID' });
    return this.chat.answer(req.auth.userId, parsed.data.message);
  }
}
