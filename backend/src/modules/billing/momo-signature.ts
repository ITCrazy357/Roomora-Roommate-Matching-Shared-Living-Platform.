import { createHmac, timingSafeEqual } from 'node:crypto';

// MoMo signs raw values in its documented field order, without URL encoding.
export function momoSignature(
  fields: Record<string, string | number>,
  secret: string,
) {
  const data = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('&');
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function signatureMatches(expected: string, actual: unknown) {
  return (
    typeof actual === 'string' &&
    /^[a-fA-F0-9]{64}$/.test(actual) &&
    timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'))
  );
}

export const notificationFields = [
  'amount',
  'extraData',
  'message',
  'orderId',
  'orderInfo',
  'orderType',
  'partnerCode',
  'payType',
  'requestId',
  'responseTime',
  'resultCode',
  'transId',
] as const;
