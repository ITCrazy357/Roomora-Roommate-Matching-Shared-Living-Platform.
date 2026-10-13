import { ApiError } from "./api";
export const money = (amount: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
export interface Participant {
  id: string;
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  leftAt: string | null;
  isGuest: boolean;
}
export interface Expense {
  corrections: { version: number; newSnapshot: CorrectionSnapshot }[];
  sharingPeriodId: string | null;
  sharingSnapshot: import("./cost-sharing").SharingSnapshot | null;
  category: import("./household").ExpenseCategory;
  spentOn: string;
  id: string;
  clientId: string;
  createdById: string;
  createdByName: string;
  title: string;
  description: string | null;
  amount: number;
  payerId: string;
  paidAmount: number;
  remainingAmount: number;
  supplierPaymentCount: number;
  payer: Participant;
  splitMode: "EQUAL" | "CUSTOM";
  status: "ACTIVE" | "SETTLED" | "ADJUSTMENT_REQUIRED" | "CANCELLED";
  version: number;
  createdAt: string;
  receiptUrl: string | null;
  hasReceipt: boolean;
  splits: {
    participantId: string;
    userId: string | null;
    displayName: string;
    amount: number;
  }[];
}
export interface CorrectionSnapshot {
  amount: number;
  payerId: string;
  splitMode: "EQUAL" | "CUSTOM";
  splits: { participantId: string; amount: number }[];
}
export interface ExpenseCorrection {
  id: string;
  expenseId: string;
  expense: {
    id: string;
    title: string;
    category: import("./household").ExpenseCategory;
  };
  version: number;
  reason: string;
  amountDelta: number;
  oldSnapshot: CorrectionSnapshot;
  newSnapshot: CorrectionSnapshot;
  recordedOn: string;
  createdAt: string;
  createdByName: string;
  settledAt: string | null;
  shares: {
    participantId: string;
    paidDelta: number;
    owedDelta: number;
    participant: Participant;
  }[];
}
export interface Balance extends Participant {
  current: {
    paid: number;
    owed: number;
    sent: number;
    received: number;
    supplierTotal: number;
    supplierPaid: number;
  };
  details: {
    paid: BalanceExpenseDetail[];
    owed: BalanceExpenseDetail[];
    sent: BalancePaymentDetail[];
    received: BalancePaymentDetail[];
    pendingSent: BalancePaymentDetail[];
    pendingReceived: BalancePaymentDetail[];
  };
  participantId: string;
  paid: number;
  owed: number;
  sent: number;
  received: number;
  pendingSent: number;
  pendingReceived: number;
  balance: number;
  reminderPausedUntil: string | null;
}
export interface BalanceExpenseDetail {
  id: string;
  expenseId: string;
  kind: "EXPENSE" | "CORRECTION";
  title: string;
  amount: number;
  totalAmount: number | null;
  paidAmount: number | null;
  occurredOn: string;
  reason: string | null;
}
export interface BalancePaymentDetail {
  id: string;
  personName: string;
  amount: number;
  method: "CASH" | "BANK_TRANSFER";
  occurredOn: string;
}
export interface RepaymentPromise {
  payerId: string;
  recipientId: string;
  payerUserId: string | null;
  payerName: string;
  recipientName: string;
  amount: number;
  payOn: string;
  version: number;
}
export interface BalancePage {
  balances: Balance[];
  isSettled: boolean;
  unsettledCount: number;
  repaymentPromises: RepaymentPromise[];
}
export interface Transfer {
  payerId: string;
  payerName: string;
  payerUserId: string | null;
  recipientId: string;
  recipientName: string;
  recipientUserId: string | null;
  amount: number;
}
export interface Payment {
  id: string;
  payer: Participant;
  recipient: Participant;
  amount: number;
  method: "CASH" | "BANK_TRANSFER";
  hasProof: boolean;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
  version: number;
  createdById: string;
  note: string | null;
  createdAt: string;
  confirmedAt: string | null;
  confirmationType: "RECEIVER" | "OWNER_RECORDED" | null;
}
export interface ExpensePage {
  items: Expense[];
  total: number;
  page: number;
  pages: number;
  active: boolean;
  ownerId: string;
  houseName: string;
}
export interface ExpenseSnapshot {
  paidAmount?: number;
  title: string;
  amount: number;
  status: Expense["status"];
  payerId: string;
  splits: { participantId: string; amount: number }[];
}
export interface ExpenseChange {
  id: string;
  action: string;
  reason: string;
  version: number;
  oldAmount: number;
  newAmount: number;
  createdAt: string;
  oldSnapshot: ExpenseSnapshot | null;
  newSnapshot: ExpenseSnapshot | null;
  createdBy: { profile: { displayName: string } | null };
}
export const expenseLabels = {
  ACTIVE: "Đang ghi nhận",
  SETTLED: "Đã quyết toán",
  ADJUSTMENT_REQUIRED: "Cần điều chỉnh",
  CANCELLED: "Đã hủy",
};
export const paymentLabels = {
  PENDING: "Chờ người nhận xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Người nhận từ chối",
  CANCELLED: "Đã hủy",
};
export function expenseError(error: unknown) {
  if (error instanceof ApiError) {
    const labels: Record<string, string> = {
      HOUSE_NOT_FOUND: "Bạn không có quyền xem sổ chi phí này.",
      EXPENSE_NOT_FOUND: "Khoản chi không tồn tại hoặc bạn không có quyền xem.",
      EXPENSE_FORBIDDEN:
        "Chỉ người tạo khoản chi hoặc trưởng nhà được thực hiện thao tác này.",
      EXPENSE_PAID_AMOUNT_INVALID:
        "Số đã thanh toán phải từ 0 đến tổng khoản chi.",
      EXPENSE_PAYMENT_EXCEEDS_REMAINING:
        "Số trả thêm vượt số tiền còn phải thanh toán. Hãy tải lại khoản chi.",
      EXPENSE_PAYMENT_HISTORY_LOCKED:
        "Đã có lần trả thêm: giữ nguyên người phụ trách và số đã trả; dùng Ghi trả thêm để cập nhật thanh toán.",
      EXPENSE_SUPPLIER_UNPAID:
        "Còn khoản chưa thanh toán đủ cho chủ phòng/người bán. Ghi trả thêm trước khi chốt.",
      EXPENSE_CHANGED: "Khoản chi đã thay đổi. Tải lại trước khi tiếp tục.",
      EXPENSE_SETTLED:
        "Khoản chi đã chốt, chỉ được xem. Hãy dùng Điều chỉnh sau chốt để ghi chênh lệch riêng.",
      EXPENSE_NOT_SETTLED:
        "Chỉ dùng điều chỉnh sau chốt cho khoản đã quyết toán.",
      CORRECTION_CHANGED:
        "Khoản này có điều chỉnh mới. Đóng form và chọn lại trước khi tiếp tục.",
      CORRECTION_RETRY_CHANGED:
        "Nội dung gửi lại khác điều chỉnh đã lưu. Tải lại để kiểm tra.",
      CORRECTION_NO_CHANGE:
        "Chưa có thay đổi về số tiền, người trả hoặc phần chia.",
      EXPENSE_RETRY_CHANGED:
        "Lần gửi lại có nội dung khác. Hãy tải lại để kiểm tra khoản đã lưu.",
      EXPENSE_SPLIT_AMOUNT_MISMATCH: "Tổng tiền chia phải bằng tổng khoản chi.",
      EXPENSE_SPLIT_INVALID: "Chọn người tham gia và cách chia tiền hợp lệ.",
      EXPENSE_DUPLICATE_SPLIT_USERS:
        "Một người chỉ được xuất hiện một lần trong khoản chi.",
      EXPENSE_MEMBER_NOT_ACTIVE:
        "Người trả hoặc người tham gia không còn ở trong nhà.",
      PAYMENT_PENDING:
        "Có thanh toán chờ xác nhận. Xác nhận, từ chối hoặc hủy trước khi thay đổi khoản chi.",
      PAYMENT_AMOUNT_EXCEEDED:
        "Số tiền vượt công nợ còn lại hoặc đã có thanh toán chờ xác nhận. Hãy tải lại.",
      PAYMENT_CHANGED: "Thanh toán đã thay đổi. Hãy tải lại.",
      PAYMENT_RETRY_CHANGED: "Lần gửi lại không khớp thanh toán đã ghi nhận.",
      PAYMENT_FORBIDDEN:
        "Bạn không có quyền ghi nhận hoặc xác nhận thanh toán này.",
      PAYMENT_INVALID: "Chọn người trả và người nhận có công nợ phù hợp.",
      PAYMENT_PROOF_INVALID:
        "Chọn ảnh minh chứng JPG, PNG hoặc WebP hợp lệ, tối đa 5 MB.",
      PAYMENT_PROOF_METHOD: "Chỉ đính kèm minh chứng khi chọn Chuyển khoản.",
      HOUSE_HAS_DEBT:
        "Chỉ quyết toán khi mọi số dư bằng 0 và không còn thanh toán chờ xác nhận.",
      REPAYMENT_DATE_INVALID: "Chọn ngày hẹn từ hôm nay đến 30 ngày tới.",
      REPAYMENT_DEBT_CHANGED:
        "Đề xuất trả tiền đã thay đổi. Tải lại sổ công nợ rồi chọn lại.",
      REPAYMENT_PROMISE_CHANGED:
        "Ngày hẹn đã thay đổi. Tải lại trước khi sửa hoặc hủy.",
      RECEIPT_INVALID:
        "Chọn ảnh biên nhận JPG, PNG hoặc WebP hợp lệ, tối đa 5 MB.",
      PARTICIPANT_LIMIT: "Sổ chi phí có tối đa 100 người đang tham gia.",
    };
    if (error.code && labels[error.code]) return labels[error.code];
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn.";
    if (error.status === 413) return "Ảnh quá lớn. Chọn ảnh tối đa 5 MB.";
    if (error.status === 400)
      return "Kiểm tra các trường đã nhập. Tiền phải là số nguyên VNĐ.";
  }
  return "Chưa thể hoàn thành. Kiểm tra kết nối và thử lại.";
}
