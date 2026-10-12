import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ServiceOrder,
  ServiceRefundRequest,
} from '../../generated/prisma/client.js';
import { momoSignature } from './momo-signature.js';

export interface GatewayRefundResult {
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  reference?: string;
  message: string;
}
const pendingCodes = new Set([1000, 7000, 7002, 9000]);

@Injectable()
export class MomoRefundsService {
  constructor(private readonly config: ConfigService) {}
  available() {
    return ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY'].every(
      (key) => Boolean(this.config.get<string>(key)),
    );
  }

  private settings() {
    if (!this.available())
      throw new ServiceUnavailableException({
        code: 'REFUND_GATEWAY_NOT_CONFIGURED',
      });
    return {
      partner: this.config.getOrThrow<string>('MOMO_PARTNER_CODE'),
      access: this.config.getOrThrow<string>('MOMO_ACCESS_KEY'),
      secret: this.config.getOrThrow<string>('MOMO_SECRET_KEY'),
    };
  }

  private async call(path: string, fields: Record<string, string | number>) {
    const settings = this.settings();
    const signature = momoSignature(
      { accessKey: settings.access, ...fields },
      settings.secret,
    );
    const response = await fetch(
      'https://test-payment.momo.vn/v2/gateway/api/' + path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, signature, lang: 'vi' }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw new Error('Refund provider unavailable');
    const body = (await response.json()) as Record<string, unknown>;
    // These endpoints document authenticated HTTPS responses, not an IPN signature.
    if (
      body.partnerCode !== settings.partner ||
      body.orderId !== fields.orderId ||
      body.requestId !== fields.requestId ||
      !Number.isInteger(body.resultCode)
    )
      throw new Error('Refund response mismatch');
    return body;
  }

  private completedTransactions(
    input: unknown,
    amount: number,
  ): GatewayRefundResult | null {
    if (!Array.isArray(input)) return null;
    const successful = input.filter(
      (item: Record<string, unknown>) => item.resultCode === 0,
    );
    if (!successful.length) return null;
    if (
      successful.some(
        (item: Record<string, unknown>) =>
          !Number.isSafeInteger(item.amount) ||
          Number(item.amount) <= 0 ||
          !Number.isSafeInteger(item.transId) ||
          Number(item.transId) <= 0,
      )
    )
      throw new Error('Refund transactions invalid');
    const total = successful.reduce(
      (sum: number, item: Record<string, unknown>) => sum + Number(item.amount),
      0,
    );
    if (total !== amount)
      return {
        status: 'PROCESSING',
        message:
          'Giao dịch gốc có hoàn tiền một phần hoặc số tiền không khớp; cần đối soát, không gửi thêm lệnh hoàn.',
      };
    const reference = successful
      .map((item: Record<string, unknown>) => String(item.transId))
      .join(':');
    if (reference.length > 128) throw new Error('Refund reference invalid');
    return {
      status: 'COMPLETED',
      reference,
      message: 'MoMo xác nhận đã hoàn đủ số tiền giao dịch gốc.',
    };
  }

  async create(
    order: ServiceOrder,
    refund: ServiceRefundRequest,
  ): Promise<GatewayRefundResult> {
    try {
      const settings = this.settings();
      // Check the original payment first, including refunds performed outside Roomora.
      const original = await this.call('query', {
        partnerCode: settings.partner,
        orderId: order.id,
        requestId: refund.id + '-o',
      });
      if (
        original.resultCode !== 0 ||
        Number(original.amount) !== order.amount ||
        String(original.transId) !== order.providerTransId
      )
        throw new Error('Original payment mismatch');
      const existing = this.completedTransactions(
        original.refundTrans,
        order.amount,
      );
      if (existing) return existing;
      const result = await this.call('refund', {
        partnerCode: settings.partner,
        orderId: refund.id,
        requestId: refund.id,
        amount: refund.amount,
        transId: Number(order.providerTransId),
        description: 'Roomora refund ' + refund.id,
      });
      if (Number(result.amount) !== refund.amount)
        throw new Error('Refund amount mismatch');
      if (result.resultCode === 0) {
        if (
          !Number.isSafeInteger(result.transId) ||
          Number(result.transId) <= 0
        )
          throw new Error('Refund reference missing');
        return {
          status: 'COMPLETED',
          reference: String(result.transId),
          message: 'MoMo xác nhận hoàn tiền thành công.',
        };
      }
      return {
        status: pendingCodes.has(Number(result.resultCode))
          ? 'PROCESSING'
          : 'FAILED',
        message: 'Kết quả MoMo: ' + String(result.resultCode),
      };
    } catch {
      // Timeout can mean money moved. Keep PROCESSING; query before any retry.
      return {
        status: 'PROCESSING',
        message:
          'Chưa xác định được kết quả từ MoMo. Đối soát mã hoàn hiện tại; không tạo giao dịch mới.',
      };
    }
  }

  async query(
    order: ServiceOrder,
    refund: ServiceRefundRequest,
  ): Promise<GatewayRefundResult> {
    try {
      const settings = this.settings();
      const result = await this.call('refund/query', {
        partnerCode: settings.partner,
        orderId: refund.id,
        requestId: refund.id + '-q',
      });
      if (result.resultCode !== 0 || !Array.isArray(result.refundTrans))
        throw new Error('Refund not confirmed');
      const matching = result.refundTrans.filter(
        (item: Record<string, unknown>) => item.orderId === refund.id,
      );
      const completed = this.completedTransactions(matching, order.amount);
      if (completed) return completed;
      const failed = matching.find(
        (item: Record<string, unknown>) =>
          Number.isInteger(item.resultCode) &&
          !pendingCodes.has(Number(item.resultCode)) &&
          item.resultCode !== 0,
      );
      return {
        status: failed ? 'FAILED' : 'PROCESSING',
        message: failed
          ? 'MoMo xác nhận hoàn tiền thất bại: ' + String(failed.resultCode)
          : 'MoMo chưa xác nhận hoàn tiền thành công.',
      };
    } catch {
      return {
        status: 'PROCESSING',
        message:
          'Chưa đối soát được kết quả MoMo; giữ nguyên mã hoàn để kiểm tra lại.',
      };
    }
  }
}
