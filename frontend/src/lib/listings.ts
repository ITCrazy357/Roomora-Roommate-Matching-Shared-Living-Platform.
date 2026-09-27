import { ApiError } from "./api";

export const amenities = {
  FURNISHED: "Có nội thất",
  AIR_CONDITIONER: "Điều hòa",
  WASHING_MACHINE: "Máy giặt",
  PARKING: "Chỗ để xe",
  WIFI: "Wi-Fi",
  KITCHEN: "Bếp",
  BALCONY: "Ban công",
  PRIVATE_BATHROOM: "Phòng tắm riêng",
} as const;
export type Amenity = keyof typeof amenities;
export const listingStatuses = {
  DRAFT: "Bản nháp",
  PENDING: "Chờ duyệt",
  PUBLISHED: "Đang hiển thị",
  REJECTED: "Cần chỉnh sửa",
  CLOSED: "Đã đóng",
} as const;
export type ListingStatus = keyof typeof listingStatuses;

export interface Listing {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  status: ListingStatus;
  rent: number | null;
  deposit: number;
  electricityCost: number;
  waterCost: number;
  internetCost: number;
  otherCost: number;
  costNote: string;
  area: number | null;
  availableSlots: number;
  currentResidents: number;
  availableFrom: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  wardCode: string | null;
  wardName: string | null;
  latitude: number | null;
  longitude: number | null;
  amenities: Amenity[];
  roommateNote: string;
  smokingPreference: string | null;
  petPreference: string | null;
  quietLevel: string | null;
  privateAddress?: string;
  rejectionReason?: string | null;
  version?: number;
  submittedAt?: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  photos: { id: string; url: string; position: number }[];
  owner: { id: string; displayName: string; avatarUrl: string | null };
  saved?: boolean;
  reviews?: {
    id: string;
    decision: ListingStatus;
    reason: string | null;
    version: number;
    createdAt: string;
  }[];
}
export interface ListingPage {
  items: Listing[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const money = (value: number | null) =>
  value === null
    ? "Chưa nhập giá"
    : `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
export const listingLocation = (listing: Listing) =>
  [listing.wardName, listing.provinceName].filter(Boolean).join(", ") ||
  "Chưa chọn khu vực";
export const listingDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC" }).format(
        new Date(value),
      )
    : "Chưa chọn ngày";

export function listingError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      LISTING_CHANGED:
        "Tin vừa thay đổi ở nơi khác. Tải lại trang để tiếp tục.",
      LISTING_INCOMPLETE:
        "Chưa thể gửi duyệt. Cần tiêu đề (ít nhất 10 ký tự), mô tả (ít nhất 30 ký tự), giá thuê, diện tích, ngày dọn vào, tỉnh/thành phố và phường/xã, địa chỉ cụ thể, vị trí bản đồ và ít nhất một ảnh.",
      LISTING_NOT_FOUND:
        "Tin không còn hiển thị hoặc bạn không có quyền truy cập.",
      PHOTO_LIMIT_REACHED: "Mỗi tin có tối đa 8 ảnh.",
      PHOTO_FORMAT_INVALID: "Chọn ảnh JPG, PNG hoặc WebP hợp lệ.",
      PHOTO_SIZE_INVALID: "Mỗi ảnh cần nhỏ hơn hoặc bằng 5 MB.",
      PHOTO_UPLOAD_UNAVAILABLE: "Chưa tải được ảnh. Vui lòng thử lại sau.",
      PHOTO_CONFIGURATION_INVALID: "Dịch vụ ảnh chưa được cấu hình đúng.",
      REJECTION_REASON_REQUIRED: "Nhập lý do trước khi từ chối tin.",
      SELF_REVIEW_NOT_ALLOWED: "Bạn không được tự duyệt tin của mình.",
      RENT_RANGE_INVALID: "Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.",
      LOCATION_INVALID:
        "Kiểm tra lại tỉnh/thành phố, phường/xã và vị trí ghim trên bản đồ.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403)
      return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 413) return "Ảnh vượt quá giới hạn 5 MB.";
    if (error.status === 400)
      return "Thông tin chưa hợp lệ. Kiểm tra độ dài nội dung, ngày và các khoản tiền.";
  }
  return "Không thể hoàn thành yêu cầu. Vui lòng thử lại.";
}
