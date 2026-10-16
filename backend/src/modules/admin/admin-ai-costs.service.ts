import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { AdminSummaryQuery } from './dto/admin.dto.js';

const features: Record<string, string> = {
  listing_description: 'Viết mô tả tin',
  listing_filters: 'Tìm kiếm bằng AI',
  expense_receipt: 'Đọc biên nhận',
  profile_explanation: 'Giải thích độ phù hợp',
  house_expense_summary: 'Tóm tắt nhà chung',
  support_faq: 'Chatbot hỗ trợ',
};
type Totals = {
  requests: number;
  measuredRequests: number;
  pricedRequests: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  cost: Prisma.Decimal;
};
const empty = (): Totals => ({
  requests: 0,
  measuredRequests: 0,
  pricedRequests: 0,
  inputTokens: 0,
  cachedTokens: 0,
  outputTokens: 0,
  cost: new Prisma.Decimal(0),
});
const serialize = ({ cost, ...row }: Totals) => ({
  ...row,
  estimatedCostUsd: row.pricedRequests ? cost.toFixed(12) : null,
  unpricedRequests: row.requests - row.pricedRequests,
});

@Injectable()
export class AdminAiCostsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(query: AdminSummaryQuery) {
    const month =
      query.month ??
      new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
    const [year, number] = month.split('-').map(Number);
    const from = new Date(Date.UTC(year, number - 1, 1) - 7 * 3600000);
    const to = new Date(Date.UTC(year, number, 1) - 7 * 3600000);
    const [groups, daily] = await this.prisma.$transaction(
      [
        this.prisma.aiRequest.groupBy({
          by: ['feature', 'model', 'status'],
          where: { createdAt: { gte: from, lt: to } },
          _count: { _all: true, inputTokens: true, costUsd: true },
          _sum: {
            inputTokens: true,
            cachedTokens: true,
            outputTokens: true,
            costUsd: true,
          },
        }),
        this.prisma.$queryRaw<
          { day: string; cost: Prisma.Decimal | null; requests: number }[]
        >`
        SELECT to_char(created_at + interval '7 hours', 'YYYY-MM-DD') AS day,
          SUM(cost_usd) AS cost, COUNT(*)::integer AS requests
        FROM ai_requests WHERE created_at >= ${from} AND created_at < ${to}
        GROUP BY 1 ORDER BY 1
      `,
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const total = empty();
    const byFeature = new Map<string, Totals>();
    const byModel = new Map<string, Totals>();
    const statuses = { completed: 0, failed: 0, pending: 0 };
    for (const row of groups) {
      const feature = byFeature.get(row.feature) ?? empty();
      const model = byModel.get(row.model) ?? empty();
      for (const target of [total, feature, model]) {
        target.requests += row._count._all;
        target.measuredRequests += row._count.inputTokens;
        target.pricedRequests += row._count.costUsd;
        target.inputTokens += row._sum.inputTokens ?? 0;
        target.cachedTokens += row._sum.cachedTokens ?? 0;
        target.outputTokens += row._sum.outputTokens ?? 0;
        target.cost = target.cost.add(row._sum.costUsd ?? 0);
      }
      byFeature.set(row.feature, feature);
      byModel.set(row.model, model);
      if (row.status === 'COMPLETED') statuses.completed += row._count._all;
      else if (row.status === 'FAILED') statuses.failed += row._count._all;
      else statuses.pending += row._count._all;
    }
    return {
      month,
      currency: 'USD',
      timeZone: 'Asia/Ho_Chi_Minh',
      ...serialize(total),
      ...statuses,
      features: [...byFeature]
        .map(([feature, row]) => ({
          feature,
          label: features[feature] ?? feature,
          ...serialize(row),
        }))
        .sort((a, b) => a.feature.localeCompare(b.feature)),
      models: [...byModel]
        .map(([model, row]) => ({ model, ...serialize(row) }))
        .sort((a, b) => a.model.localeCompare(b.model)),
      daily: daily.map((row) => ({
        day: row.day,
        requests: row.requests,
        estimatedCostUsd: row.cost?.toFixed(12) ?? null,
      })),
    };
  }
}
