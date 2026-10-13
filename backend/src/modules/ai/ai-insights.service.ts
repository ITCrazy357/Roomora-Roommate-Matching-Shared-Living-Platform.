import { BadRequestException, Injectable } from '@nestjs/common';
import { PeopleDiscoveryService } from '../people/people-discovery.service.js';
import { HouseReportsService } from '../household/house-reports.service.js';
import { AiProviderService, aiUnavailable } from './ai-provider.service.js';
import { objectSchema, outputList, outputObject } from './ai-output.js';

@Injectable()
export class AiInsightsService {
  constructor(
    private readonly people: PeopleDiscoveryService,
    private readonly reports: HouseReportsService,
    private readonly provider: AiProviderService,
  ) {}

  private async select(
    userId: string,
    task: string,
    facts: { id: string; text: string }[],
  ) {
    const raw = await this.provider.generate(
      userId,
      task,
      'Choose the most useful supplied facts to review, ordered by importance, including uncertainties and differences. Return IDs only, never generate facts or change numbers. Select between 1 and 6 unique IDs.',
      facts,
      objectSchema({
        ids: {
          type: 'array',
          items: { type: 'string', enum: facts.map((f) => f.id) },
        },
      }),
    );
    const ids = outputList(outputObject(raw).ids, 6);
    if (
      !ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !facts.some((f) => f.id === id))
    )
      aiUnavailable();
    return ids.map((id) => facts.find((f) => f.id === id)!.text);
  }

  async matching(userId: string, targetId: string) {
    if (userId === targetId)
      throw new BadRequestException({ code: 'AI_SELF_MATCH' });
    const person = await this.people.getPerson(targetId, userId);
    const match = person.match!;
    const facts = match.reasons.map((reason) => ({
      id: reason.key,
      text: `${reason.label}: ${reason.explanation}`,
    }));
    return {
      score: match.score,
      assessed: match.assessed,
      total: match.total,
      highlights: await this.select(userId, 'profile_explanation', facts),
      notice:
        'Điểm do quy tắc Roomora tính từ thông tin tự khai. Không bảo đảm an toàn hoặc kết quả ở chung.',
      reasons: match.reasons,
    };
  }

  async summary(userId: string, houseId: string, month: string) {
    const report = await this.reports.get(userId, houseId, { month });
    const format = (n: number) =>
      `${new Intl.NumberFormat('vi-VN').format(n)} đ`;
    // Không gửi tên thành viên, nội dung biên nhận hay dữ liệu công nợ cá nhân.
    const facts = [
      {
        id: 'total',
        text: `Tháng ${month}: tổng chi phí ${format(report.total)}, gồm ${report.count} khoản chi và điều chỉnh.`,
      },
      ...report.categories
        .filter((c) => c.count > 0)
        .map((c) => ({
          id: c.category,
          text: `${c.label}: ${format(c.amount)}, ${c.count} khoản chi hoặc điều chỉnh.`,
        })),
      {
        id: 'scope',
        text: 'Chi phí theo ngày phát sinh; chênh lệch điều chỉnh sau chốt tính vào ngày ghi nhận. Báo cáo tháng không phải số dư công nợ.',
      },
    ];
    return {
      month,
      generatedAt: report.generatedAt,
      total: report.total,
      highlights: await this.select(userId, 'house_expense_summary', facts),
      notice: 'Tóm tắt để đối chiếu. AI không sửa sổ hoặc xác nhận thanh toán.',
    };
  }
}
