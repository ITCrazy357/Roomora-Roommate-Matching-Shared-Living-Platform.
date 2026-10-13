import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpException,
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
  private readonly buckets = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  canActivate(context: ExecutionContext) {
    const key = clientIp(context.switchToHttp().getRequest<Request>());
    const now = Date.now();
    for (const [id, bucket] of this.buckets)
      if (bucket.expiresAt <= now) this.buckets.delete(id);
    const bucket = this.buckets.get(key) ?? {
      count: 0,
      expiresAt: now + 60000,
    };
    if (
      bucket.count >= 20 ||
      (!this.buckets.has(key) && this.buckets.size >= 10000)
    ) {
      throw new HttpException(
        {
          code: 'CHAT_RATE_LIMITED',
          message: 'Bạn gửi câu hỏi quá nhanh. Vui lòng thử lại sau một phút.',
        },
        429,
      );
    }
    bucket.count += 1;
    this.buckets.set(key, bucket);
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
