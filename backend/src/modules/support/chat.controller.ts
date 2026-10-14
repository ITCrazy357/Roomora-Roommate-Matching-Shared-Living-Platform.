import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpCode,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { clientIp } from '../../common/request-context.js';
import { ChatService } from './chat.service.js';
import { RateLimitService } from '../../redis/rate-limit.service.js';

export class ChatQuestionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(1600)
  message!: string;
}

@Injectable()
export class ChatRateGuard implements CanActivate {
  constructor(private readonly rates: RateLimitService) {}

  async canActivate(context: ExecutionContext) {
    const key = clientIp(context.switchToHttp().getRequest<Request>());
    await this.rates.check(`chat:${key}`, 20, 60000, {
      code: 'CHAT_RATE_LIMITED',
      message: 'Bạn gửi câu hỏi quá nhanh. Vui lòng thử lại sau một phút.',
    });
    return true;
  }
}

@Controller('support/chat')
@UseGuards(ChatRateGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @HttpCode(200)
  answer(@Body() dto: ChatQuestionDto) {
    return this.chat.answer(dto.message);
  }
}
