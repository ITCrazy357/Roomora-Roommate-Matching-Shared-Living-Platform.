import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServiceOrder } from '../../generated/prisma/client.js';
import { signatureMatches } from './momo-signature.js';
import { payosSignature } from './payos-signature.js';

@Injectable()
export class PayosGatewayService {
  constructor(private readonly config: ConfigService) {}

  available() {
    return ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY'].every(
      (key) => Boolean(this.config.get<string>(key)),
    );
  }

  private settings() {
    if (!this.available())
      throw new ServiceUnavailableException({
        code: 'PAYMENT_NOT_CONFIGURED',
        message: 'Chưa cấu hình PayOS',
      });
    return {
      clientId: this.config.getOrThrow<string>('PAYOS_CLIENT_ID'),
      apiKey: this.config.getOrThrow<string>('PAYOS_API_KEY'),
      secret: this.config.getOrThrow<string>('PAYOS_CHECKSUM_KEY'),
    };
  }

  private verifyData(input: unknown, secret: string) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Invalid response');
    const body = input as Record<string, unknown>;
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data))
      throw new Error('Invalid data');
    const data = body.data as Record<string, unknown>;
    if (!signatureMatches(payosSignature(data, secret), body.signature))
      throw new Error('Invalid signature');
    return { body, data };
  }

  async create(order: ServiceOrder) {
    const settings = this.settings();
    const orderCode = Number(order.providerOrderCode);
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0)
      throw new ServiceUnavailableException('Đơn chưa có mã thanh toán PayOS');
    const returnUrl = new URL(
      '/dich-vu/ket-qua',
      this.config.getOrThrow<string>('FRONTEND_ORIGIN'),
    );
    returnUrl.searchParams.set('orderId', order.id);
    const fields = {
      amount: order.amount,
      cancelUrl: returnUrl.href,
      description: 'ROOMORA',
      orderCode,
      returnUrl: returnUrl.href,
    };
    const headers = {
      'Content-Type': 'application/json',
      'x-client-id': settings.clientId,
      'x-api-key': settings.apiKey,
    };
    const endpoint = 'https://api-merchant.payos.vn/v2/payment-requests';
    const check = (input: unknown, existing: boolean) => {
      const { body, data } = this.verifyData(input, settings.secret);
      const linkId = existing ? data.id : data.paymentLinkId;
      if (
        body.code !== '00' ||
        data.orderCode !== orderCode ||
        data.amount !== order.amount ||
        data.status !== 'PENDING' ||
        typeof linkId !== 'string' ||
        !/^[a-f0-9]{32}$/i.test(linkId)
      )
        throw new Error('Payment does not match order');
      const payUrl = existing
        ? `https://pay.payos.vn/web/${linkId}`
        : data.checkoutUrl;
      if (typeof payUrl !== 'string' || payUrl.length > 2000)
        throw new Error('Invalid URL');
      const url = new URL(payUrl);
      if (
        url.origin !== 'https://pay.payos.vn' ||
        url.username ||
        url.password ||
        url.pathname !== `/web/${linkId}`
      )
        throw new Error('Invalid URL');
      return { payUrl, providerLinkId: linkId };
    };
    try {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...fields,
            expiredAt: Math.floor(order.expiresAt.getTime() / 1000),
            signature: payosSignature(fields, settings.secret),
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('Gateway unavailable');
        return check(await response.json(), false);
      } catch {
        // A timeout or duplicate orderCode may mean the link already exists.
        // Read the same code rather than create a new order/payment request.
        const response = await fetch(`${endpoint}/${orderCode}`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('Gateway unavailable');
        return check(await response.json(), true);
      }
    } catch {
      throw new ServiceUnavailableException({
        code: 'PAYMENT_GATEWAY_UNAVAILABLE',
        message: 'Chưa nhận được liên kết thanh toán. Thử lại đơn hiện tại.',
      });
    }
  }

  verifyNotification(input: unknown) {
    const settings = this.settings();
    const invalid = () =>
      new BadRequestException({
        code: 'PAYMENT_NOTIFICATION_INVALID',
        message: 'Thông báo thanh toán không hợp lệ',
      });
    try {
      const { body, data } = this.verifyData(input, settings.secret);
      if (
        typeof body.code !== 'string' ||
        (body.success !== undefined && typeof body.success !== 'boolean') ||
        typeof data.code !== 'string' ||
        !/^\d{2}$/.test(data.code) ||
        !Number.isSafeInteger(data.orderCode) ||
        Number(data.orderCode) <= 0 ||
        !Number.isSafeInteger(data.amount) ||
        Number(data.amount) <= 0 ||
        data.currency !== 'VND' ||
        typeof data.reference !== 'string' ||
        !data.reference.trim() ||
        data.reference.length > 128 ||
        typeof data.paymentLinkId !== 'string' ||
        !/^[a-f0-9]{32}$/i.test(data.paymentLinkId)
      )
        throw invalid();
      // Only signed data.code is authoritative; outer success/code are not signed.
      return {
        provider: 'PAYOS',
        providerOrderCode: String(data.orderCode),
        paymentLinkId: data.paymentLinkId,
        amount: Number(data.amount),
        resultCode: Number(data.code),
        transId: data.reference,
        signature: String(body.signature).toLowerCase(),
      };
    } catch {
      throw invalid();
    }
  }
}
