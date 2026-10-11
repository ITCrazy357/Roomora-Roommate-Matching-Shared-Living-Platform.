import { ApiError, apiFetch, apiUrl } from "./api";

export interface ServicePlan {
  code: string;
  name: string;
  amount: number;
  durationDays: number;
  currency: string;
}
export interface ServiceCatalog {
  plan: ServicePlan;
  provider: PaymentProvider;
  sandbox: boolean;
  paymentAvailable: boolean;
  providers: Record<PaymentProvider, boolean>;
}
export interface BoostListing {
  id: string;
  title: string;
  type: string;
  boostUntil: string | null;
  paymentCompleted: boolean;
  postingRound: number;
}
export interface ServiceOrder {
  id: string;
  provider: PaymentProvider;
  listingId: string;
  postingRound: number;
  listing: { postingRound: number };
  listingTitle: string;
  planName: string;
  amount: number;
  status: "PENDING" | "PAID" | "FAILED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  providerTransId: string | null;
  boost: { startsAt: string; endsAt: string } | null;
  refund: { id: string; reason: string; createdAt: string } | null;
}
export interface ServiceOrderPage {
  items: ServiceOrder[];
  total: number;
  page: number;
  pages: number;
}
export const orderLabels = {
  PENDING: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  FAILED: "Thanh toán thất bại",
  EXPIRED: "Hết thời gian thanh toán",
};
export type PaymentProvider = "MOMO_SANDBOX" | "PAYOS";
export const paymentLabels: Record<PaymentProvider, string> = {
  MOMO_SANDBOX: "MoMo sandbox",
  PAYOS: "PayOS",
};
export const serviceDate = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
export function boostLabel(order: ServiceOrder) {
  if (order.boost && order.listing.postingRound !== order.postingRound)
    return "Đợt đăng đã kết thúc";
  if (!order.boost)
    return order.status === "PAID"
      ? "Chưa cấp quyền lợi"
      : orderLabels[order.status];
  const now = Date.now();
  if (new Date(order.boost.endsAt).getTime() <= now) return "Đã hết hạn";
  return new Date(order.boost.startsAt).getTime() > now
    ? "Đã xếp lịch"
    : "Trong thời hạn";
}
export function billingPost<T>(path: string, body?: object) {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: 40000,
  });
}
export function billingError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      PAYMENT_NOT_CONFIGURED:
        "Thanh toán thử nghiệm chưa sẵn sàng. Bạn vẫn có thể xem dịch vụ và lịch sử.",
      PAYMENT_GATEWAY_UNAVAILABLE:
        "Chưa lấy được liên kết thanh toán. Hãy thử lại đơn hiện tại trong lịch sử thanh toán.",
      LISTING_NOT_BOOSTABLE:
        "Chọn tin của bạn đang công khai và còn nhận người.",
      LISTING_ALREADY_PAID:
        "Tin đã thanh toán trong đợt đăng này. Xem trạng thái trong lịch sử thanh toán.",
      ORDER_NOT_PENDING:
        "Đơn đã đổi trạng thái hoặc hết hạn. Tải lại để xem kết quả.",
      CHECKOUT_IN_PROGRESS:
        "Đang tạo liên kết thanh toán. Chờ một lát rồi thử lại đơn hiện tại.",
      REFUND_PAYMENT_REQUIRED:
        "Chỉ gửi yêu cầu hoàn tiền cho đơn đã thanh toán.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 400)
      return "Kiểm tra lại thông tin; lý do hoàn tiền cần từ 10 đến 1.000 ký tự.";
  }
  return "Chưa hoàn thành thao tác. Vui lòng thử lại.";
}
export async function downloadReceipt(id: string) {
  const response = await fetch(apiUrl(`/services/orders/${id}/receipt`), {
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new ApiError("Receipt failed", "http", response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `Roomora-receipt-${id}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
