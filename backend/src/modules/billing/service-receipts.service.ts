import { ConflictException, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { ServiceOrdersService } from './service-orders.service.js';

@Injectable()
export class ServiceReceiptsService {
  constructor(private readonly orders: ServiceOrdersService) {}
  async export(userId: string, id: string) {
    const order = await this.orders.get(userId, id);
    if (order.status !== 'PAID' || !order.paidAt)
      throw new ConflictException({
        code: 'RECEIPT_PAYMENT_REQUIRED',
        message: 'Chưa có thanh toán thành công',
      });
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: 'Biên nhận dịch vụ Roomora',
        Author: 'Roomora',
        CreationDate: order.paidAt,
      },
    });
    const output = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    doc.font(
      fileURLToPath(
        new URL('../household/fonts/BeVietnamPro-Regular.ttf', import.meta.url),
      ),
    );
    doc.fontSize(22).text('Roomora · Biên nhận dịch vụ').moveDown();
    doc.fontSize(11);
    const date = (value: Date) =>
      new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(value);
    const rows = [
      order.provider === 'PAYOS'
        ? 'PAYOS · Thanh toán bằng tiền thật'
        : 'MÔI TRƯỜNG THỬ NGHIỆM · Không thu tiền thật',
      `Số biên nhận: RR-${order.id}`,
      `Ngày ghi nhận: ${date(order.paidAt)} (UTC+7)`,
      `Khách hàng: ${order.buyerName}`,
      `Email: ${order.buyerEmail}`,
      `Dịch vụ: ${order.planName}`,
      ...(order.listingId
        ? [`Tin đăng: ${order.listingTitle}`, `Mã tin: ${order.listingId}`]
        : [
            `Số lượt AI: ${order.creditAmount}`,
            'Lượt AI không hết hạn; không tự gia hạn.',
          ]),
      `Số tiền: ${new Intl.NumberFormat('vi-VN').format(order.amount)} đ`,
      `Cổng thanh toán: ${order.provider === 'PAYOS' ? 'PayOS' : 'MoMo sandbox'}`,
      `Mã giao dịch: ${order.providerTransId}`,
      ...(order.boost
        ? [
            `Thời hạn: ${date(order.boost.startsAt)} → ${date(order.boost.endsAt)} (UTC+7)`,
          ]
        : order.aiPack
          ? [
              `Đã cấp ${order.aiPack.credits} lượt AI; đã dùng ${order.aiPack.used} lượt.`,
            ]
          : ['Chưa cấp quyền lợi; yêu cầu hoàn tiền đang chờ kiểm tra.']),
      ...(order.refund
        ? order.refundedAt && order.refund.status === 'COMPLETED'
          ? [
              `Đã hoàn đủ ${new Intl.NumberFormat('vi-VN').format(order.refund.amount)} đ ngày ${date(order.refundedAt)} (UTC+7). Mã hoàn: ${order.refund.refundReference}.`,
              'Quyền lợi của đơn đã dừng sau khi hoàn tiền.',
            ]
          : [
              'Đã tiếp nhận yêu cầu hoàn tiền. Biên nhận này không xác nhận đã hoàn tiền.',
            ]
        : []),
      'Đây là biên nhận thanh toán dịch vụ, không phải hóa đơn điện tử.',
      'Biên nhận này độc lập với bảng quyết toán nhà chung và công nợ giữa các thành viên.',
    ];
    for (const row of rows) doc.text(row, { lineGap: 4 }).moveDown(0.7);
    doc.end();
    return output;
  }
}
