import { ApiError } from "./api";
import {
  expenseError,
  type Participant,
  type Balance,
  type Expense,
  type Transfer,
} from "./expenses";

export const categories = {
  RENT: "Tiền thuê",
  ELECTRICITY: "Điện",
  WATER: "Nước",
  INTERNET: "Internet",
  GROCERIES: "Thực phẩm",
  HOUSEHOLD: "Đồ dùng chung",
  OTHER: "Khác",
};
export type ExpenseCategory = keyof typeof categories;
export interface Activity {
  id: string;
  title: string;
  note: string;
  quantity: string;
  dueOn: string | null;
  assigneeId: string | null;
  assignee: Participant | null;
  createdById: string;
  clientId: string;
  status: "OPEN" | "DONE" | "CANCELLED";
  version: number;
  completedAt: string | null;
  completedByName: string | null;
}
export interface RecurringRule {
  id: string;
  clientId: string;
  createdById: string;
  title: string;
  description: string;
  category: ExpenseCategory;
  amount: number | null;
  payerId: string;
  payer: Participant;
  participantIds: string[];
  dayOfMonth: number;
  nextOn: string;
  enabled: boolean;
  version: number;
}
export interface RecurringDraft {
  id: string;
  ruleId: string;
  rule: { createdById: string };
  dueOn: string;
  title: string;
  description: string;
  category: ExpenseCategory;
  amount: number | null;
  payerId: string;
  participantIds: string[];
  version: number;
}
export interface HouseReport {
  houseName: string;
  month: string;
  generatedAt: string;
  total: number;
  count: number;
  categories: {
    category: ExpenseCategory;
    label: string;
    amount: number;
    count: number;
  }[];
  members: {
    participantId: string;
    displayName: string;
    paid: number;
    avatarUrl: string | null;
    owed: number;
    isGuest: boolean;
  }[];
  expenses: Expense[];
  ledger: {
    balances: Balance[];
    transfers: Transfer[];
    isSettled: boolean;
    pendingCount: number;
  };
}
export function householdError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      HOUSEHOLD_FORBIDDEN: "Bạn không có quyền thay đổi mục này.",
      HOUSEHOLD_CHANGED: "Mục này đã thay đổi. Tải lại trước khi tiếp tục.",
      HOUSEHOLD_RETRY_CHANGED:
        "Nội dung gửi lại khác lần đã lưu. Hãy tải lại để kiểm tra.",
      HOUSEHOLD_NOT_FOUND: "Mục này không tồn tại trong nhà của bạn.",
      HOUSEHOLD_CLOSED: "Mục này đã đóng. Hãy tải lại để xem trạng thái mới.",
      CHORE_ASSIGNMENT_REQUIRED: "Việc nhà cần người phụ trách và ngày hạn.",
      RECURRING_DATE_INVALID:
        "Ngày đầu phải từ hôm nay, trong một năm tới, đúng ngày trong tháng đã chọn (hoặc ngày cuối tháng ngắn).",
      RECURRING_LIMIT: "Mỗi nhà có tối đa 100 quy tắc định kỳ.",
      REPORT_MONTH_INVALID: "Chọn tháng từ năm 2000 đến 2100.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
  }
  return expenseError(error);
}
