import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { aiResponseUsage } from './ai-pricing.js';

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);
  constructor(private readonly prisma: PrismaService) {}

  async request(feature: string, model: string, options: RequestInit) {
    // Persist before sending: a crash/timeout leaves a visible, unmeasured call.
    const log = await this.prisma.aiRequest.create({
      data: { feature, model },
    });
    try {
      const response = await fetch(
        'https://api.openai.com/v1/responses',
        options,
      );
      const body: unknown = await response.json();
      await this.finish(log.id, body, response.ok);
      return { ok: response.ok, body };
    } catch (error) {
      await this.finish(log.id, null, false);
      throw error;
    }
  }

  private async finish(id: string, body: unknown, ok: boolean) {
    const usage = aiResponseUsage(body);
    try {
      await this.prisma.aiRequest.update({
        where: { id },
        data: {
          status: ok && usage.completed ? 'COMPLETED' : 'FAILED',
          model: usage.model,
          responseId: usage.responseId,
          serviceTier: usage.serviceTier,
          ...usage.tokens,
          ...usage.cost,
          finishedAt: new Date(),
        },
      });
    } catch {
      // Do not log prompts, images, provider bodies, credentials or personal data.
      this.logger.error(
        'Không lưu được số liệu AI; lượt gọi vẫn được đánh dấu chưa đủ dữ liệu.',
      );
    }
  }
}
