import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import {
  HouseReportsService,
  categoryLabels,
} from './house-reports.service.js';
import type { ReportQueryDto } from './dto/household.dto.js';

type Report = Awaited<ReturnType<HouseReportsService['get']>>;
const money = (value: number) =>
  new Intl.NumberFormat('vi-VN').format(value) + ' đ';
const date = (value: Date) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC' }).format(value);
const colors = {
  coral: '#D3432B',
  ink: '#211F1D',
  muted: '#625750',
  cream: '#FAF8F5',
  peach: '#FBE9E2',
  border: '#E2D8D0',
};

// Fonts live beside this service in src and are copied beside it in dist.
const regular = fileURLToPath(
  new URL('./fonts/BeVietnamPro-Regular.ttf', import.meta.url),
);
const semibold = fileURLToPath(
  new URL('./fonts/BeVietnamPro-SemiBold.ttf', import.meta.url),
);

@Injectable()
export class HouseReportPdfService {
  constructor(private readonly reports: HouseReportsService) {}

  async export(userId: string, houseId: string, query: ReportQueryDto) {
    const report = await this.reports.get(userId, houseId, query);
    return renderReportPdf(report);
  }
}

export function renderReportPdf(report: Report): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    bufferPages: true,
    info: {
      Title: `Roomora · Bảng quyết toán ${report.month}`,
      Author: 'Roomora',
      CreationDate: report.generatedAt,
    },
  });
  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  try {
    doc.registerFont('regular', regular).registerFont('semibold', semibold);
    const width = doc.page.width - 84;
    const bottom = doc.page.height - 80;
    let y = 42;
    function ensure(height: number) {
      if (y + height > bottom) {
        doc.addPage();
        y = 42;
      }
    }
    function text(value: string, size = 9, bold = false, color = colors.ink) {
      doc.font(bold ? 'semibold' : 'regular').fontSize(size);
      const height = doc.heightOfString(value, { width, lineGap: 3 });
      ensure(height);
      doc.fillColor(color).text(value, 42, y, { width, lineGap: 3 });
      y += height + 8;
    }
    function section(title: string, note?: string) {
      ensure(90);
      y += 14;
      text(title, 13, true, colors.coral);
      if (note) text(note, 8, false, colors.muted);
    }
    function table(headers: string[], fractions: number[], rows: string[][]) {
      const widths = fractions.map((fraction) => fraction * width);
      function row(cells: string[], heading: boolean, index = 0) {
        doc.font(heading ? 'semibold' : 'regular').fontSize(8);
        const height = Math.max(
          28,
          ...cells.map(
            (cell, i) =>
              doc.heightOfString(cell, { width: widths[i] - 14, lineGap: 2 }) +
              16,
          ),
        );
        if (y + height > bottom) {
          doc.addPage();
          y = 42;
          if (!heading) row(headers, true);
        }
        const top = y;
        if (heading || index % 2 === 0)
          doc
            .rect(42, top, width, height)
            .fill(heading ? colors.peach : colors.cream);
        let x = 42;
        cells.forEach((cell, i) => {
          doc
            .font(heading ? 'semibold' : 'regular')
            .fontSize(8)
            .fillColor(colors.ink)
            .text(cell, x + 7, top + 8, { width: widths[i] - 14, lineGap: 2 });
          x += widths[i];
        });
        y = top + height;
        doc
          .moveTo(42, y)
          .lineTo(42 + width, y)
          .lineWidth(0.4)
          .strokeColor(colors.border)
          .stroke();
      }
      row(headers, true);
      rows.forEach((cells, i) => row(cells, false, i));
      if (!rows.length) {
        y += 8;
        text('Không có dữ liệu trong mục này.', 8, false, colors.muted);
      }
      y += 8;
    }
    text('ROOMORA / NHÀ CHUNG', 10, true, colors.coral);
    text('Bảng chi phí & quyết toán', 23, true);
    text(report.houseName, 15, true);
    const [year, month] = report.month.split('-');
    text(`Kỳ chi phí: tháng ${month}/${year}`, 10);
    text(
      `Xuất lúc: ${new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(report.generatedAt)} (UTC+7)`,
      8,
      false,
      colors.muted,
    );
    y += 6;
    ensure(68);
    doc.roundedRect(42, y, width, 62, 8).fill(colors.peach);
    doc
      .font('regular')
      .fontSize(9)
      .fillColor(colors.muted)
      .text('TỔNG CHI PHÍ TRONG KỲ', 58, y + 10, { width: width - 32 });
    doc
      .font('semibold')
      .fontSize(21)
      .fillColor(colors.coral)
      .text(money(report.total), 58, y + 28, { width: width - 150 });
    doc
      .fontSize(10)
      .fillColor(colors.ink)
      .text(`${report.count} khoản chi`, 42 + width - 120, y + 32, {
        width: 102,
        align: 'right',
      });
    y += 78;
    text(
      'Theo ngày phát sinh; gồm khoản đang ghi nhận và đã quyết toán, loại khoản đã hủy. Nháp định kỳ và thanh toán trả nợ không tính vào tổng chi phí.',
      8,
      false,
      colors.muted,
    );

    section('01 / Chi phí theo danh mục');
    table(
      ['Danh mục', 'Số khoản', 'Tổng chi phí'],
      [0.5, 0.15, 0.35],
      report.categories
        .filter((row) => row.count > 0)
        .map((row) => [row.label, String(row.count), money(row.amount)]),
    );
    section(
      '02 / Phân bổ trong tháng',
      'Đã chi là tiền mỗi người trả trước. Phần chịu là chi phí được chia cho người đó trong kỳ.',
    );
    const person = (row: {
      displayName: string;
      isGuest: boolean;
      leftAt: Date | null;
    }) =>
      `${row.displayName}${row.isGuest ? ' · Ngoài app' : ''}${row.leftAt ? ' · Đã rời nhà' : ''}`;
    table(
      ['Thành viên', 'Đã chi', 'Phần chịu'],
      [0.42, 0.29, 0.29],
      report.members.map((row) => [
        person(row),
        money(row.paid),
        money(row.owed),
      ]),
    );
    section('03 / Các khoản chi trong kỳ');
    const statuses = {
      ACTIVE: 'Đang ghi nhận',
      SETTLED: 'Đã quyết toán',
      ADJUSTMENT_REQUIRED: 'Cần điều chỉnh',
      CANCELLED: 'Đã hủy',
    };
    table(
      ['Ngày', 'Khoản chi / Danh mục', 'Người trả', 'Số tiền', 'Trạng thái'],
      [0.13, 0.29, 0.22, 0.19, 0.17],
      report.expenses.map((row) => [
        date(row.spentOn),
        `${row.title}\n${categoryLabels[row.category]}`,
        person(row.payer),
        money(row.amount),
        statuses[row.status],
      ]),
    );

    section(
      '04 / Công nợ toàn bộ sổ tại thời điểm xuất',
      'Công nợ gồm cả kỳ trước và thanh toán đã xác nhận. Đây không phải số dư riêng của tháng báo cáo. Số dư dương: cần nhận; số dư âm: cần trả.',
    );
    text(
      `Trạng thái sổ: ${report.ledger.isSettled ? 'Đã chốt' : 'Chưa chốt'} · ${report.ledger.pendingCount} thanh toán chờ xác nhận`,
      9,
      true,
    );
    table(
      ['Thành viên', 'Số dư', 'Đã trả nợ / Đã nhận', 'Chờ trả / Chờ nhận'],
      [0.33, 0.22, 0.23, 0.22],
      report.ledger.balances.map((row) => [
        person(row),
        `${row.balance > 0 ? '+' : ''}${money(row.balance)}`,
        `${money(row.sent)}\n${money(row.received)}`,
        `${money(row.pendingSent)}\n${money(row.pendingReceived)}`,
      ]),
    );
    section(
      '05 / Gợi ý bù trừ',
      'Chưa khấu trừ thanh toán đang chờ xác nhận. Kiểm tra tab Công nợ trước khi chuyển tiền để tránh trả trùng.',
    );
    table(
      ['Người cần trả', 'Người cần nhận', 'Số tiền gợi ý'],
      [0.35, 0.35, 0.3],
      report.ledger.transfers.map((row) => [
        row.payerName,
        row.recipientName,
        money(row.amount),
      ]),
    );
    text(
      'Bảng ghi nhận nội bộ của nhà chung. Xuất báo cáo không chốt sổ hoặc xác nhận thanh toán.',
      8,
      false,
      colors.muted,
    );

    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 62;
      doc
        .moveTo(42, footerY - 9)
        .lineTo(42 + width, footerY - 9)
        .strokeColor(colors.border)
        .stroke();
      doc
        .font('regular')
        .fontSize(8)
        .fillColor(colors.muted)
        .text(
          `Roomora · ${report.month} · Bảng quyết toán nhà chung`,
          42,
          footerY,
          { width: width - 85, lineBreak: false },
        );
      doc.text(`Trang ${i + 1}/${pages.count}`, 42 + width - 80, footerY, {
        width: 80,
        align: 'right',
        lineBreak: false,
      });
    }
    doc.end();
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error(String(error)));
  }
  return output;
}
