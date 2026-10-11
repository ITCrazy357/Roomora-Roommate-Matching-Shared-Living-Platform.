import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { calculateHouseBalances } from '../expenses/expense-ledger.js';
import { settlementTransfers } from '../expenses/expense-calculations.js';
import { expenseInclude, expenseView } from '../expenses/expense-views.js';
import {
  correctionInclude,
  correctionView,
} from '../expenses/expense-corrections.service.js';
import { dateOnly } from './household-access.service.js';
import type { ReportQueryDto } from './dto/household.dto.js';

export const categoryLabels = {
  RENT: 'Tiền thuê',
  ELECTRICITY: 'Điện',
  WATER: 'Nước',
  INTERNET: 'Internet',
  GROCERIES: 'Thực phẩm',
  HOUSEHOLD: 'Đồ dùng chung',
  OTHER: 'Khác',
};

// Quoted CSV cells still need protection against spreadsheet formulas.
export function csvCell(value: string | number) {
  const text = String(value);
  const safe =
    typeof value === 'string' && /^[\s]*[=+\-@\t\r\n]/.test(text)
      ? `'${text}`
      : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

@Injectable()
export class HouseReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
  ) {}
  async get(userId: string, houseId: string, query: ReportQueryDto) {
    const year = Number(query.month.slice(0, 4));
    if (year < 2000 || year > 2100)
      throw new BadRequestException({ code: 'REPORT_MONTH_INVALID' });
    const from = dateOnly(`${query.month}-01`),
      to = new Date(Date.UTC(year, from.getUTCMonth() + 1, 1));
    return this.prisma.$transaction(
      async (tx) => {
        const house = await this.access.active(tx, userId, houseId);
        const rows = await tx.expense.findMany({
          where: {
            houseId,
            status: { not: 'CANCELLED' },
            spentOn: { gte: from, lt: to },
          },
          include: expenseInclude,
          orderBy: [{ spentOn: 'asc' }, { id: 'asc' }],
        });
        const balances = await calculateHouseBalances(tx, houseId);
        const corrections = await tx.expenseCorrection.findMany({
          where: { houseId, recordedOn: { gte: from, lt: to } },
          include: correctionInclude,
          orderBy: [{ recordedOn: 'asc' }, { id: 'asc' }],
        });
        const categories = Object.entries(categoryLabels).map(
          ([category, label]) => ({ category, label, amount: 0, count: 0 }),
        );
        const members = balances.map((row) => ({
          participantId: row.participantId,
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
          isGuest: row.isGuest,
          leftAt: row.leftAt,
          paid: 0,
          owed: 0,
        }));
        const memberMap = new Map(
          members.map((row) => [row.participantId, row]),
        );
        let total = 0;
        for (const row of rows) {
          total += row.amount;
          const category = categories.find(
            (item) => item.category === row.category,
          )!;
          category.amount += row.amount;
          category.count++;
          memberMap.get(row.payerId)!.paid += row.amount;
          for (const split of row.splits)
            memberMap.get(split.participantId)!.owed += split.amount;
        }
        for (const correction of corrections) {
          total += correction.amountDelta;
          const category = categories.find(
            (item) => item.category === correction.expense.category,
          )!;
          category.amount += correction.amountDelta;
          category.count++;
          for (const share of correction.shares) {
            memberMap.get(share.participantId)!.paid += share.paidDelta;
            memberMap.get(share.participantId)!.owed += share.owedDelta;
          }
        }
        const openExpenses = await tx.expense.count({
          where: { houseId, status: { in: ['ACTIVE', 'ADJUSTMENT_REQUIRED'] } },
        });
        const openCorrections = await tx.expenseCorrection.count({
          where: { houseId, settledAt: null },
        });
        const unsettledCount = openExpenses + openCorrections;
        return {
          houseName: house.name,
          month: query.month,
          generatedAt: new Date(),
          total,
          count: rows.length + corrections.length,
          categories,
          members,
          expenses: rows.map(expenseView),
          corrections: corrections.map(correctionView),
          ledger: {
            balances,
            transfers: settlementTransfers(balances),
            isSettled: unsettledCount === 0,
            pendingCount: await tx.debtPayment.count({
              where: { houseId, status: 'PENDING' },
            }),
          },
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }
  async export(userId: string, houseId: string, query: ReportQueryDto) {
    const report = await this.get(userId, houseId, query);
    const rows: (string | number)[][] = [
      ['BẢNG CHI PHÍ VÀ QUYẾT TOÁN NHÀ CHUNG', report.houseName],
      ['Kỳ chi phí', report.month],
      ['Thời điểm xuất (UTC)', report.generatedAt.toISOString()],
      ['Tổng chi phí trong kỳ (VNĐ)', report.total],
      [
        'Chi phí theo ngày phát sinh; điều chỉnh sau chốt tính chênh lệch tại ngày ghi nhận. Công nợ là toàn bộ sổ tại thời điểm xuất.',
      ],
      [],
      [
        'NGÀY',
        'KHOẢN CHI',
        'DANH MỤC',
        'NGƯỜI ĐÃ TRẢ / NGƯỜI GHI ĐIỀU CHỈNH',
        'SỐ TIỀN (VNĐ)',
        'TRẠNG THÁI',
      ],
      ...report.expenses.map((row) => [
        row.spentOn.toISOString().slice(0, 10),
        row.title,
        categoryLabels[row.category],
        row.payer.displayName,
        row.amount,
        row.status === 'SETTLED' ? 'Đã quyết toán' : 'Chưa quyết toán',
      ]),
      ...report.corrections.map((row) => [
        row.recordedOn.toISOString().slice(0, 10),
        `Điều chỉnh #${row.version}: ${row.expense.title} · ${row.reason}`,
        categoryLabels[row.expense.category],
        `Ghi bởi ${row.createdByName}`,
        row.amountDelta,
        row.settledAt ? 'Đã quyết toán' : 'Chưa quyết toán',
      ]),
      [],
      ['DANH MỤC', 'TỔNG TIỀN (VNĐ)'],
      ...report.categories.map((row) => [row.label, row.amount]),
      [],
      ['THÀNH VIÊN', 'ĐÃ CHI TRONG KỲ (VNĐ)', 'PHẦN CHỊU TRONG KỲ (VNĐ)'],
      ...report.members.map((row) => [row.displayName, row.paid, row.owed]),
      [],
      ['CÔNG NỢ TOÀN BỘ SỔ TẠI THỜI ĐIỂM XUẤT'],
      ['Trạng thái', report.ledger.isSettled ? 'Đã chốt' : 'Chưa chốt'],
      ['Thanh toán chờ xác nhận', report.ledger.pendingCount],
      [
        'THÀNH VIÊN',
        'SỐ DƯ (VNĐ)',
        'ĐÃ TRẢ NỢ (VNĐ)',
        'ĐÃ NHẬN TRẢ (VNĐ)',
        'ĐANG CHỜ TRẢ (VNĐ)',
        'ĐANG CHỜ NHẬN (VNĐ)',
      ],
      ...report.ledger.balances.map((row) => [
        row.displayName,
        row.balance,
        row.sent,
        row.received,
        row.pendingSent,
        row.pendingReceived,
      ]),
      [],
      ['NGƯỜI CẦN TRẢ', 'NGƯỜI CẦN NHẬN', 'GỢI Ý BÙ TRỪ (VNĐ)'],
      ...report.ledger.transfers.map((row) => [
        row.payerName,
        row.recipientName,
        row.amount,
      ]),
      [
        'Gợi ý bù trừ chưa khấu trừ thanh toán chờ xác nhận; kiểm tra sổ trước khi trả tiền.',
      ],
      ['Đây là bảng ghi nhận nội bộ của nhà chung.'],
    ];
    return (
      '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
    );
  }
}
