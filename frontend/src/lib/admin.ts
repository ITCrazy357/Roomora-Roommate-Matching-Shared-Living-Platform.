import { ApiError, apiFetch } from "./api";

export const adminLinks = [
  {
    href: "/admin/tin-dang",
    label: "Tin chờ duyệt",
    hint: "Kiểm tra trước khi công khai",
  },
  {
    href: "/admin/nguoi-dung",
    label: "Người dùng",
    hint: "Tài khoản và vi phạm",
  },
  {
    href: "/admin/bao-cao",
    label: "Báo cáo vi phạm",
    hint: "Tiếp nhận và xử lý",
  },
  {
    href: "/admin/ho-so",
    label: "Tra cứu hồ sơ",
    hint: "Khai báo danh tính và nhật ký truy cập",
  },
  {
    href: "/admin/thong-bao",
    label: "Thông báo hệ thống",
    hint: "Lịch bảo trì và thông báo chung",
  },
  {
    href: "/admin/hoan-tien",
    label: "Hoàn tiền dịch vụ",
    hint: "Duyệt, xác minh và đối soát",
  },
  {
    href: "/admin/ho-tro",
    label: "Yêu cầu hỗ trợ",
    hint: "Trao đổi và giải quyết",
  },
  {
    href: "/admin/giao-dich",
    label: "Tra cứu giao dịch",
    hint: "Đơn dịch vụ và kết quả thanh toán",
  },
  {
    href: "/admin/nhat-ky",
    label: "Nhật ký thao tác",
    hint: "Lịch sử quyết định quản trị",
  },
];
export interface AdminUser {
  id: string;
  role: "USER" | "ADMIN";
  email: string;
  createdAt: string;
  emailVerifiedAt: string | null;
  lockedAt: string | null;
  closedAt: string | null;
  lockReason: string | null;
  moderationVersion: number;
  profile: { displayName: string; avatarUrl: string | null } | null;
}
export interface AdminReport {
  id: string;
  reason: string;
  details: string;
  createdAt: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  version: number;
  handlingNote: string | null;
  handledAt: string | null;
  reporter: AdminUser;
  target: AdminUser;
  listingId: string | null;
  listing: {
    id: string;
    title: string;
    status: string;
    version: number;
    deletedAt: string | null;
  } | null;
  listingSnapshot: {
    title: string;
    description: string;
    type: string;
    rent: number | null;
    version: number;
  } | null;
}
export interface Announcement {
  id: string;
  title: string;
  message: string;
  kind: "GENERAL" | "MAINTENANCE";
  displayFrom: string;
  displayUntil: string;
  maintenanceFrom: string | null;
  maintenanceUntil: string | null;
  version: number;
  published: boolean;
  createdAt: string;
}
export interface AdminAction {
  id: string;
  entityId?: string;
  action: string;
  reason: string | null;
  createdAt: string;
  actor: { id: string; profile: { displayName: string } | null };
}
export interface AdminPage<T> {
  items: T[];
  total: number;
  pages: number;
  page: number;
  limit: number;
}
export const reportReasons: Record<string, string> = {
  SPAM: "Spam",
  HARASSMENT: "Quấy rối",
  SCAM: "Lừa đảo",
  INAPPROPRIATE: "Nội dung không phù hợp",
  OTHER: "Khác",
};
export const reportStatuses = {
  OPEN: "Chờ xử lý",
  RESOLVED: "Đã xử lý",
  DISMISSED: "Không đủ căn cứ",
};
export function adminTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function announcementText(
  item: Pick<
    Announcement,
    "title" | "message" | "maintenanceFrom" | "maintenanceUntil"
  >,
) {
  return `${item.title}: ${item.message}${item.maintenanceFrom && item.maintenanceUntil ? ` · Bảo trì từ ${adminTime(item.maintenanceFrom)} đến ${adminTime(item.maintenanceUntil)} (giờ Việt Nam).` : ""}`;
}
export function adminError(error: unknown): string {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      ADMIN_VERSION_CONFLICT:
        "Dữ liệu đã thay đổi hoặc thông báo đang phát/đã hết hạn. Tải lại trước khi thao tác tiếp.",
      ANNOUNCEMENT_TIME_INVALID:
        "Lịch hiển thị phải có ngày kết thúc sau ngày bắt đầu và bao trùm toàn bộ thời gian bảo trì.",
      ADMIN_LOCK_FORBIDDEN:
        "Không thể khóa tài khoản quản trị hoặc chính mình.",
      ACCOUNT_NOT_CLOSED:
        "Tài khoản không còn ở trạng thái đóng. Tải lại trước khi xử lý tiếp.",
      LISTING_OWNER_LOCKED:
        "Người đăng đang bị khóa. Không thể duyệt công khai tin này.",
      REPORT_EXISTS: "Bạn đã gửi báo cáo cho nội dung này.",
      RATE_LIMITED: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.";
    if (error.status === 403)
      return "Bạn không có quyền sử dụng chức năng quản trị.";
    if (error.status === 400)
      return "Kiểm tra nội dung và thời gian đã nhập. Lý do cần có ít nhất 5 ký tự.";
    if (error.kind === "network" || error.kind === "timeout")
      return error.message;
  }
  return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}
export async function adminMutation<T>(
  path: string,
  method: string,
  data: unknown,
): Promise<T> {
  const result = await apiFetch<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  window.dispatchEvent(new Event("roomora:admin-change"));
  return result;
}
