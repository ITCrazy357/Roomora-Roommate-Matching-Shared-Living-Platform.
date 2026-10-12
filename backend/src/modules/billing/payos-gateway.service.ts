import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServiceOrder } from '../../generated/prisma/client.js';
import { signatureMatches } from './momo-signature.js';
import { payosSignature } from './payos-signature.js';
import type { PaymentNotification } from './billing-types.js';

export class PayosLinkClosedException extends ConflictException {
  constructor(readonly orderStatus: 'CANCELLED' | 'EXPIRED') {
    super({
      code:
        orderStatus === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_NOT_PENDING',
    });
  }
}

const endpoint = 'https://api-merchant.payos.vn/v2/payment-requests';

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

  private checkLink(order: ServiceOrder, input: unknown, existing: boolean) {
    const { body, data } = this.verifyData(input, this.settings().secret);
    const linkId = existing ? data.id : data.paymentLinkId;
    const amountPaid = existing ? data.amountPaid : 0;
    if (
      body.code !== '00' ||
      data.orderCode !== Number(order.providerOrderCode) ||
      data.amount !== order.amount ||
      typeof data.status !== 'string' ||
      !['PENDING', 'PAID', 'PROCESSING', 'CANCELLED', 'EXPIRED'].includes(
        data.status,
      ) ||
      typeof amountPaid !== 'number' ||
      !Number.isSafeInteger(amountPaid) ||
      amountPaid < 0 ||
      typeof linkId !== 'string' ||
      !/^[a-f0-9]{32}$/i.test(linkId) ||
      (order.providerLinkId && order.providerLinkId !== linkId)
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
    let payment: PaymentNotification | undefined;
    if (
      existing &&
      data.status === 'PAID' &&
      amountPaid === order.amount &&
      data.amountRemaining === 0
    ) {
      const rows = data.transactions;
      const transaction =
        Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (
        transaction &&
        typeof transaction === 'object' &&
        transaction.amount === order.amount &&
        typeof transaction.reference === 'string' &&
        transaction.reference.trim() &&
        transaction.reference.length <= 128
      ) {
        payment = {
          provider: 'PAYOS',
          providerOrderCode: String(data.orderCode),
          paymentLinkId: linkId,
          amount: order.amount,
          resultCode: 0,
          transId: transaction.reference,
          signature: String(body.signature).toLowerCase(),
          payer: this.payer(transaction),
        };
      }
    }
    return {
      status: data.status,
      amountPaid,
      payUrl,
      providerLinkId: linkId,
      payment,
    };
  }

  private payer(data: Record<string, unknown>) {
    const text = (value: unknown, max: number) =>
      typeof value === 'string' && value.trim().length <= max
        ? value.trim() || null
        : null;
    return {
      bankId: text(data.counterAccountBankId, 50),
      bankName: text(data.counterAccountBankName, 100),
      accountNumber: text(data.counterAccountNumber, 50),
      accountName: text(data.counterAccountName, 100),
    };
  }

  async read(order: ServiceOrder) {
    const settings = this.settings();
    try {
      const response = await fetch(`${endpoint}/${order.providerOrderCode}`, {
        headers: {
          'x-client-id': settings.clientId,
          'x-api-key': settings.apiKey,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Gateway unavailable');
      return this.checkLink(order, await response.json(), true);
    } catch {
      throw new ServiceUnavailableException({
        code: 'PAYMENT_STATUS_UNAVAILABLE',
        message:
          'Chưa kiểm tra được trạng thái PayOS. Thử lại trước khi tạo thanh toán mới.',
      });
    }
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
    const check = (input: unknown, existing: boolean) => {
      const link = this.checkLink(order, input, existing);
      if (
        link.amountPaid > 0 ||
        link.status === 'PAID' ||
        link.status === 'PROCESSING'
      )
        throw new ConflictException({ code: 'PAYMENT_CONFIRMATION_PENDING' });
      if (link.status === 'CANCELLED' || link.status === 'EXPIRED')
        throw new PayosLinkClosedException(link.status);
      return { payUrl: link.payUrl, providerLinkId: link.providerLinkId };
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
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        // A timeout or duplicate orderCode may mean the link already exists.
        // Read the same code rather than create a new order/payment request.
        const response = await fetch(`${endpoint}/${orderCode}`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('Gateway unavailable');
        return check(await response.json(), true);
      }
    } catch (error) {
      if (error instanceof ConflictException) throw error;
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
        payer: this.payer(data),
      };
    } catch {
      throw invalid();
    }
  }
}
