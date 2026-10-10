import { ApiError } from "./api";
import { expenseError } from "./expenses";
import type { ExpenseCategory } from "./household";
export type SharingMode = "EQUAL" | "WEIGHTED";
export type SharingChoice = SharingMode | "AGREE" | "REJECT";
export interface SharingMember {
  userId: string;
  participantId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
}
export interface SharingShare {
  participantId: string;
  basisPoints: number;
}
export interface SharingVote {
  userId: string;
  choice: SharingChoice;
  version: number;
  updatedAt: string;
}
export interface SharingRound {
  id: string;
  number: number;
  phase: "PREFERENCE" | "PROPOSAL";
  status: string;
  members: SharingMember[];
  mode: SharingMode | null;
  shares: SharingShare[] | null;
  reason: string;
  createdById: string | null;
  createdAt: string;
  votes: SharingVote[];
  events?: {
    id: string;
    userId: string;
    choice: SharingChoice;
    version: number;
    createdAt: string;
  }[];
}
export interface SharingPeriod {
  id: string;
  category: ExpenseCategory;
  month: string;
  kind: "MONTHLY" | "DEFAULT";
  status: string;
  deadlineAt: string;
  currentRound: number;
  resultMode: SharingMode | null;
  resultShares: SharingShare[] | null;
  membershipChanged: boolean;
  rounds: SharingRound[];
  fallbackSnapshot: { periodId: string; mode: SharingMode } | null;
}
export interface SharingPage {
  settings: {
    category: ExpenseCategory;
    enabled: boolean;
    deadlineDay: number;
  }[];
  periods: SharingPeriod[];
  members: SharingMember[];
}
export interface SharingRule {
  status: string;
  periodId: string | null;
  mode?: SharingMode;
  shares?: SharingShare[];
  source?: string;
}
export interface SharingSnapshot {
  periodId: string;
  roundId: string;
  month: string;
  category: ExpenseCategory;
  mode: SharingMode;
  shares: SharingShare[];
  source: "AGREED" | "FALLBACK";
}
export const sharingChoiceLabels: Record<SharingChoice, string> = {
  EQUAL: "Chia đều",
  WEIGHTED: "Theo tỷ lệ",
  AGREE: "Đồng ý",
  REJECT: "Từ chối",
};
export const sharingStatusLabels: Record<string, string> = {
  OPEN: "Đang bình chọn",
  AGREED: "Đã thống nhất",
  FALLBACK: "Dùng phương án dự phòng",
  UNRESOLVED: "Chưa thống nhất",
  NEEDS_REVIEW: "Thành viên đã thay đổi",
};
export function sharingAmounts(
  amount: number,
  mode: SharingMode,
  shares: SharingShare[],
) {
  const ordered = [...shares].sort((a, b) =>
      a.participantId.localeCompare(b.participantId),
    ),
    denominator = mode === "EQUAL" ? ordered.length : 10000;
  const rows = ordered.map((row) => {
    const product = amount * (mode === "EQUAL" ? 1 : row.basisPoints);
    return {
      participantId: row.participantId,
      amount: Math.floor(product / denominator),
      remainder: product % denominator,
    };
  });
  const extra = amount - rows.reduce((sum, row) => sum + row.amount, 0),
    ranked = [...rows].sort(
      (a, b) =>
        b.remainder - a.remainder ||
        a.participantId.localeCompare(b.participantId),
    );
  for (let i = 0; i < extra; i++) ranked[i].amount++;
  return rows.map(({ participantId, amount: value }) => ({
    participantId,
    amount: value,
  }));
}
export function sharingError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      SHARING_NOT_FOUND: "Không tìm thấy kỳ chia chi phí trong nhà.",
      SHARING_OWNER_REQUIRED: "Chỉ trưởng nhà được quản lý kỳ bình chọn.",
      SHARING_ROUND_CLOSED:
        "Vòng đã đóng, hết hạn hoặc thay đổi. Tải lại để xem vòng hiện tại.",
      SHARING_MEMBERS_CHANGED:
        "Thành viên đã thay đổi. Cần mở vòng mới để cả nhà thống nhất lại.",
      SHARING_RATIOS_INVALID:
        "Tỷ lệ phải đủ các thành viên, không trùng, không âm và tổng đúng 100%.",
      SHARING_NOT_AGREED:
        "Kỳ này chưa thống nhất cách chia. Hãy hoàn tất bình chọn trước khi ghi khoản chi.",
      SHARING_VOTE_CHANGED:
        "Phiếu của bạn đã thay đổi. Tải lại trước khi bình chọn.",
      SHARING_VOTE_INVALID: "Lựa chọn không hợp lệ cho vòng này.",
      SHARING_PROPOSAL_REJECTED:
        "Đề xuất đã bị từ chối. Cần tạo đề xuất mới để bình chọn lại.",
      SHARING_PROPOSAL_NOT_READY:
        "Cần có người chọn theo tỷ lệ hoặc từ chối đề xuất hiện tại trước khi tạo đề xuất mới.",
      SHARING_DEADLINE_INVALID:
        "Hạn phải ở tương lai, trong 31 ngày tới; kỳ tháng cần hạn trong đúng tháng đó.",
      SHARING_ROUND_LIMIT: "Kỳ này đã đạt giới hạn 100 vòng.",
      SHARING_DEFAULT_ALREADY_OPEN:
        "Đã có vòng thống nhất dự phòng đang mở cho danh mục này. Hãy hoàn tất vòng đó trước.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
  }
  return expenseError(error);
}
