import { ApiError } from "./api";
import { adminError, type AdminUser } from "./admin";
export const supportStatuses = {
  OPEN: "Mới gửi",
  IN_PROGRESS: "Đang xử lý",
  WAITING_USER: "Chờ bạn bổ sung",
  RESOLVED: "Đã giải quyết",
  CLOSED: "Đã đóng",
};
export interface SupportTicket {
  id: string;
  subject: string;
  status: keyof typeof supportStatuses;
  version: number;
  user: AdminUser;
  orderId: string | null;
  updatedAt: string;
  order: {
    id: string;
    status: string;
    amount: number;
    planName: string;
  } | null;
  messages?: {
    id: string;
    fromAdmin: boolean;
    body: string;
    createdAt: string;
  }[];
}
export function supportError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404)
      return "Không tìm thấy yêu cầu hoặc đơn dịch vụ của bạn.";
    if (error.status === 409)
      return "Yêu cầu đã thay đổi hoặc đã đóng. Tải lại trước khi gửi tiếp.";
    if (error.status === 400)
      return "Kiểm tra tiêu đề, nội dung và mã đơn dịch vụ.";
    if (error.status === 403) return "Bạn không có quyền xem yêu cầu này.";
  }
  return adminError(error);
}
