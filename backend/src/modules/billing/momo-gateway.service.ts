import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import type { ServiceOrder } from '../../generated/prisma/client.js';
import {
  momoSignature,
  notificationFields,
  signatureMatches,
} from './momo-signature.js';

@Injectable()
export class MomoGatewayService {
  constructor(private readonly config: ConfigService) {}

  available() {
    return [
      'MOMO_PARTNER_CODE',
      'MOMO_ACCESS_KEY',
      'MOMO_SECRET_KEY',
      'MOMO_IPN_URL',
    ].every((key) => Boolean(this.config.get<string>(key)));
  }

  private settings() {
    if (!this.available())
      throw new ServiceUnavailableException({
        code: 'PAYMENT_NOT_CONFIGURED',
        message: 'Chưa cấu hình MoMo sandbox',
      });
    return {
      partnerCode: this.config.getOrThrow<string>('MOMO_PARTNER_CODE'),
      accessKey: this.config.getOrThrow<string>('MOMO_ACCESS_KEY'),
      secret: this.config.getOrThrow<string>('MOMO_SECRET_KEY'),
      ipnUrl: this.config.getOrThrow<string>('MOMO_IPN_URL'),
    };
  }

  async create(order: ServiceOrder) {
    const settings = this.settings();
    const fields = {
      amount: order.amount,
      extraData: '',
      ipnUrl: settings.ipnUrl,
      orderId: order.id,
      orderInfo: order.planName,
      partnerCode: settings.partnerCode,
      redirectUrl:
        this.config.getOrThrow<string>('FRONTEND_ORIGIN') + '/dich-vu/ket-qua',
      requestId: order.id,
      requestType: 'captureWallet',
    };
    try {
      const response = await fetch(
        'https://test-payment.momo.vn/v2/gateway/api/create',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...fields,
            autoCapture: true,
            lang: 'vi',
            signature: momoSignature(
              { accessKey: settings.accessKey, ...fields },
              settings.secret,
            ),
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) throw new Error('Gateway unavailable');
      const result = (await response.json()) as Record<string, unknown>;
      const signed: Record<string, string | number> = {
        accessKey: settings.accessKey,
      };
      for (const key of [
        'amount',
        'orderId',
        'partnerCode',
        'payUrl',
        'requestId',
        'responseTime',
        'resultCode',
      ]) {
        const value = result[key];
        if (typeof value !== 'string' && typeof value !== 'number')
          throw new Error('Invalid response');
        signed[key] = value;
      }
      if (
        !signatureMatches(
          momoSignature(signed, settings.secret),
          result.signature,
        ) ||
        result.orderId !== order.id ||
        result.requestId !== order.id ||
        result.partnerCode !== settings.partnerCode ||
        Number(result.amount) !== order.amount ||
        result.resultCode !== 0 ||
        typeof result.payUrl !== 'string'
      )
        throw new Error('Invalid response');
      const url = new URL(result.payUrl);
      if (
        url.origin !== 'https://test-payment.momo.vn' ||
        url.username ||
        url.password ||
        result.payUrl.length > 2000
      )
        throw new Error('Invalid URL');
      return result.payUrl;
    } catch {
      // An uncertain network result must stay pending. Reuse the same requestId.
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
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw invalid();
    const body = input as Record<string, unknown>;
    const fields: Record<string, string | number> = {
      accessKey: settings.accessKey,
    };
    for (const key of notificationFields) {
      const value = body[key];
      if (
        (typeof value !== 'string' && typeof value !== 'number') ||
        String(value).length > 1000
      )
        throw invalid();
      fields[key] = value;
    }
    if (
      !signatureMatches(
        momoSignature(fields, settings.secret),
        body.signature,
      ) ||
      body.partnerCode !== settings.partnerCode ||
      body.extraData !== '' ||
      body.orderType !== 'momo_wallet' ||
      !isUUID(String(body.orderId)) ||
      body.requestId !== body.orderId ||
      !Number.isSafeInteger(body.amount) ||
      Number(body.amount) <= 0 ||
      !Number.isSafeInteger(body.resultCode) ||
      Number(body.resultCode) < 0 ||
      !Number.isSafeInteger(body.responseTime) ||
      Number(body.responseTime) <= 0 ||
      Number(body.responseTime) > Date.now() + 300000 ||
      !Number.isSafeInteger(body.transId) ||
      Number(body.transId) < 0 ||
      (body.resultCode === 0 && Number(body.transId) === 0)
    )
      throw invalid();
    return {
      orderId: String(body.orderId),
      amount: Number(body.amount),
      resultCode: Number(body.resultCode),
      transId: String(body.transId),
      responseTime: Number(body.responseTime),
      orderInfo: String(body.orderInfo),
      signature: String(body.signature).toLowerCase(),
    };
  }
}
