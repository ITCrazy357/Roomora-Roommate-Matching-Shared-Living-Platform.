export const boostPlan = {
  code: 'BOOST_7_DAYS',
  name: 'Đẩy tin 7 ngày',
  amount: 49000,
  durationDays: 7,
  currency: 'VND',
} as const;

export const orderDetails = {
  boost: true,
  refund: true,
  listing: { select: { postingRound: true } },
} as const;

export interface PaymentNotification {
  provider: string;
  orderId?: string;
  providerOrderCode?: string;
  paymentLinkId?: string;
  amount: number;
  resultCode: number;
  transId: string;
  signature: string;
  responseTime?: number;
  orderInfo?: string;
  payer?: {
    bankId: string | null;
    bankName: string | null;
    accountNumber: string | null;
    accountName: string | null;
  };
}
