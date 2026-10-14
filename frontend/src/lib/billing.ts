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
  aiPlan: ServicePlan & { credits: number };
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
  listingId: string | null;
  postingRound: number;
  listing: { postingRound: number } | null;
  planCode: string;
  creditAmount: number | null;
  aiPack: {
    credits: number;
    used: number;
    held: boolean;
    revokedAt: string | null;
  } | null;
  listingTitle: string;
  planName: string;
  amount: number;
  status: "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  providerTransId: string | null;
  refundedAt: string | null;
  refundDeadline: string | null;
  refundServerTime: string;
  refundEligible: boolean;
  paymentConfirmationPending?: boolean;
  paymentStatusUnavailable?: boolean;
  boost: { startsAt: string; endsAt: string } | null;
  refund: ServiceRefund | null;
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
  CANCELLED: "Đã hủy thanh toán",
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
  if (order.refundedAt) return "Đã dừng sau khi hoàn tiền";
  if (order.boost && order.listing?.postingRound !== order.postingRound)
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
export function billingPost<T>(path: string, body?: object, timeoutMs = 40000) {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs,
  });
}
export function billingError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      AI_PACK_USED: "Gói AI đã sử dụng nên không thể yêu cầu hoàn toàn bộ gói.",
      AI_UNAVAILABLE:
        "AI chưa khả dụng. Vui lòng thử mua gói khi dịch vụ hoạt động lại.",
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
      ORDER_CANCELLED:
        "Link thanh toán đã hủy. Bạn có thể tạo thanh toán mới cho tin chưa thanh toán.",
      ORDER_ALREADY_PAID:
        "Đơn đã thanh toán. Cập nhật lịch sử để xem quyền lợi; không cần thanh toán lại.",
      PAYMENT_STATUS_UNAVAILABLE:
        "Chưa kiểm tra được trạng thái PayOS. Thử cập nhật lại trước khi thanh toán tiếp.",
      PAYMENT_CONFIRMATION_PENDING:
        "PayOS đang xử lý hoặc đã nhận tiền. Chờ xác nhận và cập nhật lịch sử; chưa tạo thanh toán mới.",
      CHECKOUT_IN_PROGRESS:
        "Đang tạo liên kết thanh toán. Chờ một lát rồi thử lại đơn hiện tại.",
      REFUND_PAYMENT_REQUIRED:
        "Chỉ gửi yêu cầu hoàn tiền cho đơn đã thanh toán.",
      REFUND_WINDOW_EXPIRED:
        "Đã quá 24 giờ kể từ thanh toán thành công; không thể gửi yêu cầu mới.",
      REFUND_CHANGED:
        "Yêu cầu đã thay đổi. Tải lại dữ liệu trước khi thao tác tiếp.",
      REFUND_STATE_INVALID: "Trạng thái hiện tại không cho phép thao tác này.",
      REFUND_ALREADY_COMPLETED:
        "Giao dịch đã được hoàn tiền, không thể hoàn thêm.",
      REFUND_RECIPIENT_REQUIRED:
        "Người dùng cần cung cấp đủ tài khoản nhận tiền sau khi được duyệt.",
      REFUND_RECIPIENT_UNVERIFIED:
        "Cần xác minh tài khoản nhận tiền trước khi thực hiện hoàn.",
      REFUND_DIFFERENT_ACCOUNT_REASON:
        "Tài khoản khác người thanh toán gốc cần lý do ít nhất 10 ký tự.",
      REFUND_DIFFERENT_ACCOUNT_REVIEW:
        "Tài khoản hoặc tên khác giao dịch gốc cần lý do và phê duyệt xác minh bổ sung.",
      REFUND_BANK_INVALID: "Chọn ngân hàng nhận tiền từ danh sách hợp lệ.",
      REFUND_AMOUNT_MISMATCH:
        "Số tiền hoàn phải bằng đúng số tiền đã thanh toán; không hỗ trợ hoàn một phần.",
      REFUND_REFERENCE_REUSED:
        "Mã tham chiếu hoàn tiền đã được dùng cho giao dịch khác.",
      REFUND_TRANSFER_REFERENCE_REQUIRED:
        "Cần mã giao dịch hoàn tiền do ngân hàng cấp; không dùng mã đơn, mã yêu cầu hoặc mã giao dịch thu tiền gốc.",
      REFUND_PROOF_REQUIRED:
        "Cần chứng từ chuyển khoản của lần xử lý hiện tại.",
      REFUND_PROOF_INVALID:
        "Chọn ảnh chứng từ JPG, PNG hoặc WebP hợp lệ, tối đa 5 MB.",
      PAYMENT_PROOF_INVALID:
        "Chọn ảnh chứng từ JPG, PNG hoặc WebP hợp lệ, tối đa 5 MB.",
      REFUND_TRANSFER_TIME_INVALID:
        "Thời điểm chuyển khoản phải thuộc lần xử lý hiện tại và không nằm trong tương lai.",
      REFUND_REQUEST_INELIGIBLE:
        "Yêu cầu cũ được gửi ngoài hạn 24 giờ; không đủ điều kiện duyệt.",
      REFUND_GATEWAY_NOT_CONFIGURED:
        "Chưa cấu hình MoMo sandbox để hoàn tiền về phương thức gốc.",
      REFUND_IN_PROGRESS:
        "Đang gọi cổng thanh toán. Chờ kết quả trước khi đối soát.",
      REFUND_RATE_LIMITED: "Thao tác quá nhanh. Thử lại sau một phút.",
      REFUND_AUDIT_UNAVAILABLE:
        "Chưa ghi được lịch sử an toàn, chưa xác nhận hoàn tiền. Cần đối soát giao dịch hiện tại trước khi thử lại.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 400)
      return "Kiểm tra lại thông tin; lý do hoàn tiền cần từ 10 đến 1.000 ký tự.";
  }
  return "Chưa hoàn thành thao tác. Vui lòng thử lại.";
}

export type RefundStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "PROCESSING" | "COMPLETED" | "FAILED";
export const refundLabels: Record<RefundStatus, string> = {
  PENDING: "Chờ kiểm tra",
  APPROVED: "Đã duyệt · Chưa hoàn tiền",
  REJECTED: "Đã từ chối",
  PROCESSING: "Đang xử lý hoàn tiền",
  COMPLETED: "Đã hoàn tiền",
  FAILED: "Xử lý thất bại · Cần kiểm tra lại",
};
export interface ServiceRefund {
  id: string;
  orderId: string;
  reason: string;
  createdAt: string;
  version: number;
  amount: number;
  status: RefundStatus;
  method: "MANUAL_BANK" | "MOMO";
  source: "USER" | "SYSTEM";
  decisionNote: string | null;
  approvedAt: string | null;
  bankId: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  differentAccountReason: string | null;
  verifiedAt: string | null;
  verifiedById: string | null;
  verificationNote: string | null;
  verificationReference: string | null;
  processingAt: string | null;
  completedAt: string | null;
  transferredAt: string | null;
  refundReference: string | null;
  lastError: string | null;
}
export interface RefundDetail extends ServiceRefund {
  gatewayAvailable?: boolean;
  order: ServiceOrder & {
    buyerName: string;
    buyerEmail: string;
    planName: string;
    payerBankId: string | null;
    payerBankName: string | null;
    payerAccount: string | null;
    payerName: string | null;
  };
  proofs: {
    id: string;
    createdAt: string;
    mimeType: string;
    uploadedById: string;
  }[];
  actions: {
    id: string;
    action: string;
    fromStatus: RefundStatus | null;
    toStatus: RefundStatus;
    note: string;
    createdAt: string;
    actor: { id: string; profile: { displayName: string } | null } | null;
  }[];
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
