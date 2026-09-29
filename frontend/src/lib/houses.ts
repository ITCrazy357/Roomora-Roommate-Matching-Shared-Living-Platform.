import { ApiError } from "./api";

export interface HouseSummary {
  id: string;
  name: string;
  address: string;
  ownerId: string;
  updatedAt: string;
  _count: { members: number };
}

export interface HouseInvite {
  id: string;
  houseId: string;
  expiresAt: string;
  house: { name: string };
}

export interface HouseInviteCandidate {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: "AVAILABLE" | "INVITED" | "MEMBER";
}

export interface House {
  id: string;
  name: string;
  address: string;
  description: string;
  rules: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  members: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    joinedAt: string;
  }[];
  announcements: {
    id: string;
    authorId: string;
    authorName: string;
    text: string;
    pinned: boolean;
    createdAt: string;
  }[];
  events: {
    id: string;
    userId: string;
    actorId: string;
    type: string;
    displayName: string;
    createdAt: string;
  }[];
  invites: { id: string; label: string; expiresAt: string }[];
}

export function houseError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      HOUSE_NOT_FOUND:
        "Nhà chung không tồn tại hoặc bạn không còn quyền truy cập.",
      HOUSE_SELF_INVITE: "Bạn đã là trưởng nhà.",
      HOUSE_ALREADY_MEMBER: "Người này đã ở trong nhà.",
      HOUSE_ALREADY_JOINED:
        "Bạn đang ở trong một nhà chung. Hãy rời nhà đó trước khi tạo hoặc tham gia nhà khác.",
      HOUSE_INVITE_EXISTS: "Lời mời đang chờ phản hồi.",
      HOUSE_NOT_CONNECTED: "Chỉ có thể mời người đã kết nối với bạn.",
      HOUSE_INVITE_LIMIT: "Nhà đang có quá nhiều lời mời chờ phản hồi.",
      HOUSE_INVITE_CHANGED:
        "Lời mời đã thay đổi. Tải lại để xem trạng thái mới.",
      HOUSE_TARGET_NOT_MEMBER:
        "Chỉ có thể chuyển quyền cho thành viên đang ở trong nhà.",
      HOUSE_TRANSFER_FIRST: "Hãy chuyển quyền trưởng nhà trước khi rời nhà.",
      EMAIL_NOT_VERIFIED: "Hãy xác minh email trước khi nhận lời mời.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn.";
    if (error.status === 400)
      return "Thông tin chưa hợp lệ. Kiểm tra lại các ô nhập.";
  }
  return "Không thể hoàn thành yêu cầu. Vui lòng thử lại.";
}

export const houseDate = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
