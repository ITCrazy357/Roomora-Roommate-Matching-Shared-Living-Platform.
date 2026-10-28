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
  HOT_WATER: "Nước nóng",
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
export const listingTypes = {
  ROOMMATE: "Tìm người ở ghép",
  ROOM_WANTED: "Tìm phòng",
  ROOM_RENTAL: "Cho thuê phòng",
} as const;
export type ListingType = keyof typeof listingTypes;

export function listingHasRoom(listing: Pick<Listing, "type" | "hasRoom">) {
  return (
    listing.type === "ROOM_RENTAL" ||
    (listing.type === "ROOMMATE" && listing.hasRoom)
  );
}

export function listingLabel(listing: Pick<Listing, "type" | "hasRoom">) {
  if (listing.type !== "ROOMMATE") return listingTypes[listing.type];
  return listing.hasRoom
    ? "Đã có phòng · Tìm người ở ghép"
    : "Chưa có phòng · Muốn xin ở ghép";
}

export function listingCostUnit(type: ListingType) {
  return type === "ROOM_RENTAL" ? "phòng" : "người";
}

export function listingAvailability(listing: Listing) {
  if (listing.status !== "PUBLISHED") return listingStatuses[listing.status];
  if (listing.type === "ROOM_WANTED") return "Đang tìm phòng";
  if (listing.type === "ROOMMATE" && !listing.hasRoom)
    return listing.isFull ? "Đã tìm được chỗ ở" : "Đang tìm chỗ ở ghép";
  if (listing.isFull) return "Đã đủ";
  const unit = listing.type === "ROOM_RENTAL" ? "phòng" : "chỗ";
  return `Còn ${listing.availableSlots} ${unit}`;
}

export interface Listing {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  status: ListingStatus;
  type: ListingType;
  hasRoom: boolean;
  isFull: boolean;
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
  desiredResidents: number | null;
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
  owner: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    profilePublic: boolean;
    identityStatus?: import("./identity").IdentityStatus | null;
  };
  saved?: boolean;
  sponsored?: boolean;
  paymentCompleted?: boolean;
  postingRound?: number;
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

export interface ListingQuota {
  used: number;
  limit: number;
  remaining: number;
  startsAt: string;
  resetsAt: string;
  bonusUntil: string | null;
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
        "Chưa thể gửi duyệt. Cần tiêu đề, mô tả, ngân sách và khu vực. Tin cho thuê cần thêm diện tích, ngày dọn vào, địa chỉ riêng, ghim khu vực và ảnh.",
      LISTING_NOT_FOUND:
        "Tin không còn hiển thị hoặc bạn không có quyền truy cập.",
      LISTING_NOT_DRAFT:
        "Chỉ được xóa tin ở trạng thái bản nháp. Tải lại để xem trạng thái hiện tại.",
      LISTING_WEEKLY_LIMIT:
        "Bạn đã hết lượt đăng tin tìm phòng/ở ghép tuần này. Hạn mức 3 tin/tuần, tăng thành 8 khi có gói đẩy tin còn hạn và không cộng dồn. Bạn có thể gửi duyệt lại tin cũ hoặc chờ tuần mới.",
      IDENTITY_DECLARATION_REQUIRED:
        "Hãy nộp đủ hồ sơ demo tại Khai báo danh tính trước khi gửi tin cho thuê.",
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
      RATE_LIMITED: "Bạn đã thao tác quá nhiều. Vui lòng chờ rồi thử lại.",
      RATE_LIMIT_UNAVAILABLE:
        "Tạm thời chưa thể xử lý yêu cầu. Vui lòng thử lại sau.",
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
