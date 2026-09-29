import { ApiError, apiFetch } from "./api";

export interface PersonSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}
export interface Message {
  id: string;
  senderId: string;
  clientId: string;
  number: number;
  text: string;
  createdAt: string;
  attachments: MessageAttachment[];
}
export interface MessageAttachment {
  id: string;
  kind: "IMAGE" | "AUDIO";
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
  type: "CONNECTION" | "MESSAGE" | "APPOINTMENT" | "HOUSE";
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
