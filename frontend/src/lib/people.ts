import { ApiError } from "./api";

export interface Connection {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  direction: "sent" | "received";
  version: number;
  message: string;
  createdAt: string;
  updatedAt: string;
}
export interface Match {
  score: number | null;
  assessed: number;
  total: number;
  reasons: {
    key: string;
    label: string;
    weight: number;
    result: "MATCH" | "PARTIAL" | "DIFFERENT" | "UNKNOWN";
    explanation: string;
  }[];
}
export interface Person {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  budgetMin?: number | null;
  budgetMax?: number | null;
  desiredAreas?: string[];
  sleepSchedule?: string | null;
  smokingPreference?: string | null;
  petPreference?: string | null;
  quietLevel?: string | null;
  match: Match | null;
  connection: Connection | null;
  listings?: {
    id: string;
    title: string;
    rent: number | null;
    provinceName: string | null;
    wardName: string | null;
    latitude: number | null;
    longitude: number | null;
  }[];
}
export interface PeoplePage {
  items: Person[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
export type ConnectionTab = "received" | "sent" | "accepted" | "blocked";
export interface BlockedPerson {
  userId: string;
  displayName: string;
  createdAt: string;
}
export interface ConnectionsPage {
  items: (Person | BlockedPerson)[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  counts: Record<ConnectionTab, number>;
}
export const connectionLabels = {
  PENDING: "Chờ phản hồi",
  ACCEPTED: "Đã kết nối",
  DECLINED: "Đã từ chối",
  CANCELLED: "Đã hủy",
};
export const matchLabels = {
  MATCH: "Phù hợp",
  PARTIAL: "Trao đổi thêm",
  DIFFERENT: "Khác biệt",
  UNKNOWN: "Chưa đủ dữ liệu",
};
export const reportReasons = {
  SPAM: "Spam / làm phiền",
  HARASSMENT: "Quấy rối",
  SCAM: "Lừa đảo",
  INAPPROPRIATE: "Nội dung không phù hợp",
  OTHER: "Lý do khác",
};
export function peopleError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      PERSON_UNAVAILABLE:
        "Hồ sơ không tồn tại, đang riêng tư hoặc không thể kết nối.",
      PROFILE_PRIVATE:
        "Hãy chuyển hồ sơ của bạn sang công khai trước khi gửi lời kết nối.",
      SELF_CONNECTION:
        "Bạn không thể gửi yêu cầu, chặn hoặc báo cáo chính mình.",
      CONNECTION_EXISTS:
        "Hai bạn đã có lời mời đang chờ hoặc đã kết nối. Kiểm tra trang Yêu cầu kết nối.",
      CONNECTION_CHANGED:
        "Trạng thái kết nối đã thay đổi. Bấm Làm mới để cập nhật.",
      CONNECTION_COOLDOWN:
        "Vui lòng chờ 24 giờ sau khi hủy, từ chối hoặc ngắt kết nối trước khi gửi lại.",
      REPORT_EXISTS: "Bạn đã gửi báo cáo về người dùng này.",
      BUDGET_RANGE_INVALID: "Ngân sách tối đa cần lớn hơn hoặc bằng tối thiểu.",
      LOCATION_INVALID: "Chọn tỉnh/thành phố và phường/xã hợp lệ.",
      RATE_LIMITED: "Bạn đã thao tác quá nhiều. Vui lòng thử lại sau.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 400)
      return "Kiểm tra thông tin và độ dài nội dung đã nhập.";
    if (error.status === 404) return messages.PERSON_UNAVAILABLE;
  }
  return "Chưa thể hoàn thành yêu cầu. Kiểm tra kết nối và thử lại.";
}
const moneyFormatter = new Intl.NumberFormat("vi-VN");

function money(value: number) {
  return `${moneyFormatter.format(value)} đ`;
}

export function formatBudget(person: {
  budgetMin?: number | null;
  budgetMax?: number | null;
}) {
  if (person.budgetMin == null && person.budgetMax == null)
    return "Ngân sách chưa công khai";
  if (person.budgetMin == null)
    return `Tối đa ${money(person.budgetMax!)}/tháng`;
  if (person.budgetMax == null) return `Từ ${money(person.budgetMin)}/tháng`;
  return `${money(person.budgetMin)} – ${money(person.budgetMax)}/tháng`;
}
