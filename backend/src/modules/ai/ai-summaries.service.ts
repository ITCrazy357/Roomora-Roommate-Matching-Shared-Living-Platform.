import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import type { AiHouseSummary } from '../../generated/prisma/client.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { AiInsightsService } from './ai-insights.service.js';
import { aiUnavailable } from './ai-provider.service.js';
import type { AiSummaryNotesDto } from './dto/ai.dto.js';

@Injectable()
export class AiSummariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly insights: AiInsightsService,
  ) {}

  private key(userId: string, houseId: string, month: string) {
    if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month))
      throw new BadRequestException({ code: 'REPORT_MONTH_INVALID' });
    return { userId, houseId, month };
  }

  private view(row: AiHouseSummary | null) {
    if (!row?.generatedAt) return null;
    return {
      month: row.month,
      total: row.total === null ? null : Number(row.total),
      highlights: row.highlights,
      generatedAt: row.generatedAt,
      notes: row.notes,
      version: row.version,
      notice: 'Tóm tắt để đối chiếu. AI không sửa sổ hoặc xác nhận thanh toán.',
    };
  }

  async get(userId: string, houseId: string, month: string) {
    const key = this.key(userId, houseId, month);
    await this.access.active(this.prisma, userId, houseId);
    return this.view(
      await this.prisma.aiHouseSummary.findUnique({
        where: { userId_houseId_month: key },
      }),
    );
  }

  async generate(
    userId: string,
    houseId: string,
    month: string,
    regenerate = false,
  ) {
    const key = this.key(userId, houseId, month),
      generationId = randomUUID();
    const cached = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      await this.access.lock(tx, houseId);
      await this.access.active(tx, userId, houseId);
      const row = await tx.aiHouseSummary.upsert({
        where: { userId_houseId_month: key },
        create: key,
        update: {},
      });
      // Xem lại không gọi provider và không giữ lượt, kể cả khi đã hết lượt AI.
      if (row.generatedAt && !regenerate) return this.view(row);
      if (row.generatingUntil && row.generatingUntil > new Date())
        throw new HttpException({ code: 'AI_BUSY' }, 429);
      await tx.aiHouseSummary.update({
        where: { userId_houseId_month: key },
        data: { generationId, generatingUntil: new Date(Date.now() + 120000) },
      });
      return null;
    });
    if (cached) return cached;
    try {
      await this.insights.summary(userId, houseId, month, async (tx, draft) => {
        await this.access.lock(tx, houseId);
        await this.access.active(tx, userId, houseId);
        const current = await tx.aiHouseSummary.findUniqueOrThrow({
          where: { userId_houseId_month: key },
        });
        // Lưu bản tóm tắt và hoàn tất trừ lượt trong cùng transaction.
        const saved = await tx.aiHouseSummary.updateMany({
          where: { ...key, generationId },
          data: {
            total: BigInt(draft.total),
            highlights: draft.highlights,
            notes: current.generatedAt
              ? undefined
              : draft.highlights.join('\n'),
            generatedAt: draft.generatedAt,
            version: { increment: 1 },
            generationId: null,
            generatingUntil: null,
          },
        });
        if (!saved.count) aiUnavailable();
      });
      return await this.get(userId, houseId, month);
    } finally {
      await this.prisma.aiHouseSummary.updateMany({
        where: { ...key, generationId },
        data: { generationId: null, generatingUntil: null },
      });
    }
  }

  async saveNotes(userId: string, houseId: string, dto: AiSummaryNotesDto) {
    const key = this.key(userId, houseId, dto.month);
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      await this.access.active(tx, userId, houseId);
      const row = await tx.aiHouseSummary.findUnique({
        where: { userId_houseId_month: key },
      });
      if (!row?.generatedAt)
        throw new NotFoundException({ code: 'AI_SUMMARY_NOT_FOUND' });
      const saved = await tx.aiHouseSummary.updateMany({
        where: { ...key, version: dto.version },
        data: { notes: dto.notes, version: { increment: 1 } },
      });
      if (!saved.count)
        throw new ConflictException({ code: 'AI_SUMMARY_CHANGED' });
      return this.view(
        await tx.aiHouseSummary.findUnique({
          where: { userId_houseId_month: key },
        }),
      );
    });
  }
}
