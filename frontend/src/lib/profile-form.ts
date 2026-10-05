import type { MyProfile } from "./profile";

export const profileSteps = [
  {
    label: "Bản thân",
    icon: "person" as const,
    title: "Chào bạn. Kể một chút về mình nhé.",
    description:
      "Một bức ảnh, vài dòng giới thiệu. Bắt đầu từ những điều thật nhất về bạn.",
  },
  {
    label: "Chỗ ở",
    icon: "home" as const,
    title: "Nơi nào khiến bạn muốn trở về?",
    description:
      "Chọn khoảng chi tiêu thoải mái và những khu vực bạn muốn tìm một nơi ở mới.",
  },
  {
    label: "Nếp sống",
    icon: "sun" as const,
    title: "Cùng nhà, hợp cả nhịp sống.",
    description:
      "Không cần giống nhau mọi thứ. Biết trước những thói quen sẽ giúp việc ở chung dễ dàng hơn.",
  },
];
export const budgets = [
  { label: "Dưới 2 triệu", min: 0, max: 2_000_000 },
  { label: "2 – 3,5 triệu", min: 2_000_000, max: 3_500_000 },
  { label: "3,5 – 5 triệu", min: 3_500_000, max: 5_000_000 },
  { label: "5 – 7 triệu", min: 5_000_000, max: 7_000_000 },
  { label: "7 – 10 triệu", min: 7_000_000, max: 10_000_000 },
  { label: "Trên 10 triệu", min: 10_000_000, max: null },
];
export const habits = [
  {
    key: "sleepSchedule",
    label: "Giờ giấc",
    description: "Bạn thường bắt đầu và kết thúc ngày thế nào?",
    options: [
      ["EARLY_BIRD", "Ngủ và dậy sớm"],
      ["FLEXIBLE", "Linh hoạt"],
      ["NIGHT_OWL", "Thường thức khuya"],
    ],
  },
  {
    key: "smokingPreference",
    label: "Hút thuốc",
    description: "Một điều nên nói rõ ngay từ đầu.",
    options: [
      ["NO_SMOKING", "Không hút thuốc"],
      ["OUTDOOR_ONLY", "Chỉ hút ngoài nhà"],
      ["SMOKER", "Có hút thuốc"],
    ],
  },
  {
    key: "petPreference",
    label: "Thú cưng",
    description: "Có chỗ cho một người bạn bốn chân không?",
    options: [
      ["NO_PETS", "Không nuôi thú cưng"],
      ["PET_FRIENDLY", "Thoải mái với thú cưng"],
      ["HAS_PETS", "Đang nuôi thú cưng"],
    ],
  },
  {
    key: "quietLevel",
    label: "Không khí trong nhà",
    description: "Một ngôi nhà hợp với nhịp sống của bạn.",
    options: [
      ["QUIET", "Ưu tiên yên tĩnh"],
      ["BALANCED", "Cân bằng"],
      ["SOCIAL", "Thích giao lưu"],
    ],
  },
] as const;

export type ProfileForm = Pick<
  MyProfile,
  | "displayName"
  | "bio"
  | "budgetMin"
  | "budgetMax"
  | "desiredLocations"
  | "sleepSchedule"
  | "smokingPreference"
  | "petPreference"
  | "quietLevel"
>;
export function budgetText(draft: ProfileForm) {
  const money = (value: number) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
      value / 1_000_000,
    );
  if (draft.budgetMin === null && draft.budgetMax === null)
    return "Chưa chọn ngân sách";
  if (draft.budgetMin === null || draft.budgetMin === 0)
    return `Đến ${money(draft.budgetMax ?? 0)} triệu / tháng`;
  if (draft.budgetMax === null)
    return `Từ ${money(draft.budgetMin)} triệu / tháng`;
  return `${money(draft.budgetMin)} – ${money(draft.budgetMax)} triệu / tháng`;
}

