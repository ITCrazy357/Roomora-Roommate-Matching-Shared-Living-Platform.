export interface DesiredLocation {
  provinceCode: string;
  wardCode: string | null;
  provinceName: string;
  wardName: string | null;
}

export interface MyProfile {
  id?: string;
  userId: string;
  email?: string;
  emailVerified?: boolean;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  desiredAreas: string[];
  desiredLocations: DesiredLocation[];
  sleepSchedule: string | null;
  smokingPreference: string | null;
  petPreference: string | null;
  quietLevel: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  showBudget: boolean;
  showDesiredAreas: boolean;
  showLifestyle: boolean;
  onboardingCompleted: boolean;
  updatedAt?: string;
}

export const lifestyleLabels: Record<string, string> = {
  EARLY_BIRD: "Ngủ và dậy sớm",
  FLEXIBLE: "Linh hoạt",
  NIGHT_OWL: "Thường thức khuya",
  NO_SMOKING: "Không hút thuốc",
  OUTDOOR_ONLY: "Chỉ hút ngoài nhà",
  SMOKER: "Có hút thuốc",
  NO_PETS: "Không nuôi thú cưng",
  PET_FRIENDLY: "Thoải mái với thú cưng",
  HAS_PETS: "Đang nuôi thú cưng",
  QUIET: "Ưu tiên yên tĩnh",
  BALANCED: "Cân bằng",
  SOCIAL: "Thích giao lưu",
};
