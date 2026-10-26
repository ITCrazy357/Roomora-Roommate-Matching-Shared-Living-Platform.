import { Body, Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import {
  IsIn,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { RateLimitService } from '../../redis/rate-limit.service.js';

class WebVitalDto {
  @IsIn(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']) name!: string;
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(300000)
  value!: number;
  @IsString() @MaxLength(80) @Matches(/^[a-zA-Z0-9._-]+$/) id!: string;
  @IsIn(['home', 'listings', 'listing', 'people']) route!: string;
  @IsIn(['mobile', 'desktop']) device!: string;
}

@Controller('telemetry/web-vitals')
export class WebVitalsController {
  private readonly logger = new Logger('WebVitals');
  constructor(private readonly limits: RateLimitService) {}

  @Post()
  @HttpCode(204)
  async record(@Body() dto: WebVitalDto, @Req() request: Request) {
    const bucket = createHash('sha256')
      .update(request.ip || request.socket.remoteAddress || 'unknown')
      .digest('hex');
    await this.limits.check(`web-vitals:${bucket}`, 120, 60000);
    // Only allowlisted coarse route/device labels and an ephemeral metric id.
    // Never record URLs, search text, user ids, cookies, IPs or performance entries.
    this.logger.log({
      event: 'web_vital',
      name: dto.name,
      value: dto.value,
      id: dto.id,
      route: dto.route,
      device: dto.device,
    });
  }
}
