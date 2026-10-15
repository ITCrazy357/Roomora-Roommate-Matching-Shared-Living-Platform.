import { ApiError } from "./api";
import type { AdminUser } from "./admin";

export const identityStatuses = {
  PENDING: "Đã khai báo (demo)",
  APPROVED: "Hồ sơ đã duyệt (demo)",
  REJECTED: "Cần bổ sung hồ sơ",
} as const;
export type IdentityStatus = keyof typeof identityStatuses;
export interface IdentityFields {
  fullName: string;
  birthDate: string;
  documentNumber: string;
  phone: string;
  contactAddress: string;
}
export interface IdentityRecord {
  userId: string;
  mode: "DEMO";
  status: IdentityStatus;
  version: number;
  documentMasked: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  fields?: IdentityFields;
  user?: AdminUser;
  providerResult: null;
  documentImagesStored: false;
  biometricDataStored: false;
}
export function identityError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "IDENTITY_CHANGED")
      return "Hồ sơ vừa thay đổi. Tải lại và kiểm tra trước khi tiếp tục.";
    if (error.code === "IDENTITY_NOT_CONFIGURED")
      return "Chưa mở được hồ sơ. Vui lòng liên hệ quản trị để kiểm tra cấu hình bảo vệ dữ liệu.";
    if (error.code === "IDENTITY_BIRTH_DATE_INVALID")
      return "Ngày sinh không hợp lệ.";
    if (error.status === 400)
      return "Kiểm tra thông tin, CCCD gồm 12 chữ số và xác nhận chỉ dùng dữ liệu demo.";
    if (error.status === 403)
      return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Người dùng chưa có hồ sơ khai báo.";
  }
  return "Chưa thể xử lý hồ sơ. Vui lòng thử lại.";
}
