import { ApiError, apiFetch } from "./api";
import type { Presence } from "./presence";

export interface PersonSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  presence?: Presence;
}
export interface Message {
  id: string;
  senderId: string;
  clientId: string;
  number: number;
  text: string;
  version: number;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  attachments: MessageAttachment[];
}
export interface MessageAttachment {
  id: string;
  kind: "IMAGE" | "AUDIO" | "FILE";
  fileName: string | null;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}
export interface Conversation {
  id: string;
  connectionId: string;
  lastNumber: number;
  readNumber: number;
  person: PersonSummary;
  unread?: number;
  lastMessage?: Message | null;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  unread?: number;
}
export interface Room {
  id: string;
  ownerId: string;
  title: string;
  rent: number | null;
  provinceName: string | null;
  wardName: string | null;
  latitude: number | null;
  longitude: number | null;
  photos: { url: string }[];
}
export interface AppointmentChange {
  actorId: string;
  version: number;
  status: Appointment["status"];
  startsAt: string;
  place: string;
  note: string;
  createdAt: string;
}
export interface Appointment {
  id: string;
  conversationId: string;
  listingId: string | null;
  proposerId: string;
  startsAt: string;
  place: string;
  note: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  version: number;
  upcoming: boolean;
  listing: { id: string; title: string; status: string } | null;
  changes: AppointmentChange[];
  person?: PersonSummary;
}
export interface ConversationDetail extends Conversation {
  appointments: Appointment[];
  listings: Room[];
}
export interface Notice {
  id: string;
  type: "CONNECTION" | "MESSAGE" | "APPOINTMENT" | "HOUSE" | "SERVICE";
  title: string;
  href: string;
  readAt: string | null;
  createdAt: string;
}
export const appointmentLabels = {
  PENDING: "Chờ phản hồi",
  CONFIRMED: "Đã xác nhận",
  CANCELLED: "Đã hủy",
};
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});
export function formatTime(value: string) {
  return dateFormatter.format(new Date(value));
}
export function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
}
export function communicationError(error: unknown) {
  if (error instanceof ApiError) {
    const labels: Record<string, string> = {
      CONVERSATION_UNAVAILABLE:
        "Hội thoại không còn khả dụng. Kiểm tra kết nối hoặc danh sách chặn.",
      APPOINTMENT_CHANGED:
        "Lịch hẹn đã thay đổi hoặc bạn không thể xác nhận đề xuất của mình. Hãy làm mới.",
      APPOINTMENT_TIME: "Chọn giờ trong tương lai, tối đa 180 ngày.",
      APPOINTMENT_LISTING:
        "Chọn tin phòng đang công khai của một trong hai người.",
      MESSAGE_CHANGED: "Nội dung gửi lại không khớp tin nhắn trước đó.",
      MESSAGE_FILE_SIZE: "Tệp phải có nội dung và không quá 5 MB.",
      POLL_DUPLICATE_OPTIONS: "Các phương án bình chọn cần khác nhau.",
      POLL_NOT_FOUND: "Bình chọn đã bị xóa hoặc không còn khả dụng.",
      POLL_CLOSED: "Bình chọn đã đóng. Hãy tải lại để xem kết quả.",
      POLL_OPTION_INVALID: "Phương án không thuộc bình chọn này.",
      POLL_CREATOR_ONLY: "Chỉ người tạo được đóng bình chọn.",
      POLL_IMMUTABLE:
        "Câu hỏi và phương án không thể sửa sau khi tạo bình chọn.",
      MESSAGE_UPDATED:
        "Tin nhắn đã thay đổi. Hãy tải lại trước khi sửa hoặc xóa.",
      MESSAGE_EMPTY: "Tin nhắn cần có nội dung, ảnh, ghi âm hoặc tệp.",
      MESSAGE_MEDIA_SIZE: "Tổng ảnh, ghi âm và tệp sau xử lý không quá 5 MB.",
      MESSAGE_MEDIA_LIMIT: "Mỗi tin nhắn tối đa 4 ảnh, 1 ghi âm và 4 tệp.",
      RATE_LIMITED: "Bạn đã thao tác quá nhiều. Vui lòng thử lại sau.",
    };
    if (error.code && labels[error.code]) return labels[error.code];
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 400)
      return "Kiểm tra lại nội dung và thời gian đã nhập.";
  }
  return "Chưa thể hoàn thành. Kiểm tra kết nối và thử lại.";
}
export function post<T>(path: string, body: unknown = {}) {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
