import type { Profile } from '../../generated/prisma/client.js';
import type { DesiredLocation } from '../locations/locations.service.js';

type MatchResult = 'MATCH' | 'PARTIAL' | 'DIFFERENT' | 'UNKNOWN';
export interface MatchReason {
  key: string;
  label: string;
  result: MatchResult;
  explanation: string;
  weight: number;
}

const habitExplanations = {
  MATCH: 'Thói quen phù hợp với nhau.',
  PARTIAL: 'Có thể phù hợp; nên trao đổi thêm.',
  DIFFERENT: 'Thói quen khác nhau; cần thống nhất trước khi ở chung.',
};
const matchPoints = { MATCH: 1, PARTIAL: 0.5, DIFFERENT: 0, UNKNOWN: 0 };

export function matchProfiles(
  myProfile: Profile | null,
  otherProfile: Profile,
) {
  const reasons: MatchReason[] = [];
  function add(
    key: string,
    label: string,
    weight: number,
    result: MatchResult,
    explanation: string,
  ) {
    reasons.push({ key, label, weight, result, explanation });
  }
  const unknown = 'Chưa đủ thông tin công khai để đối chiếu.';
  const myAreas = myProfile?.desiredLocations as unknown as
    DesiredLocation[] | undefined;
  const otherAreas =
    otherProfile.desiredLocations as unknown as DesiredLocation[];
  if (
    !otherProfile.showDesiredAreas ||
    !myAreas?.length ||
    !otherAreas.length
  ) {
    add('area', 'Khu vực', 25, 'UNKNOWN', unknown);
  } else {
    const sameArea = myAreas.some((myArea) =>
      otherAreas.some(
        (otherArea) =>
          myArea.provinceCode === otherArea.provinceCode &&
          (!myArea.wardCode ||
            !otherArea.wardCode ||
            myArea.wardCode === otherArea.wardCode),
      ),
    );
    const sameProvince = myAreas.some((myArea) =>
      otherAreas.some(
        (otherArea) => myArea.provinceCode === otherArea.provinceCode,
      ),
    );
    if (sameArea) {
      add('area', 'Khu vực', 25, 'MATCH', 'Có khu vực mong muốn chung.');
    } else if (sameProvince) {
      add(
        'area',
        'Khu vực',
        25,
        'PARTIAL',
        'Cùng tỉnh/thành phố, khác phường/xã mong muốn.',
      );
    } else {
      add(
        'area',
        'Khu vực',
        25,
        'DIFFERENT',
        'Chưa có khu vực mong muốn chung.',
      );
    }
  }
  const hasMyBudget =
    myProfile && (myProfile.budgetMin !== null || myProfile.budgetMax !== null);
  const hasOtherBudget =
    otherProfile.budgetMin !== null || otherProfile.budgetMax !== null;
  if (!hasMyBudget || !hasOtherBudget || !otherProfile.showBudget) {
    add('budget', 'Ngân sách', 25, 'UNKNOWN', unknown);
  } else {
    const overlaps =
      Math.max(myProfile.budgetMin ?? 0, otherProfile.budgetMin ?? 0) <=
      Math.min(
        myProfile.budgetMax ?? 100_000_000,
        otherProfile.budgetMax ?? 100_000_000,
      );
    add(
      'budget',
      'Ngân sách',
      25,
      overlaps ? 'MATCH' : 'DIFFERENT',
      overlaps
        ? 'Khoảng ngân sách có phần giao nhau.'
        : 'Khoảng ngân sách chưa giao nhau.',
    );
  }
  function compareHabit(
    key: 'sleepSchedule' | 'smokingPreference' | 'petPreference' | 'quietLevel',
    label: string,
    weight: number,
    flexibleValue: string,
  ) {
    const myValue = myProfile?.[key];
    const otherValue = otherProfile[key];
    if (!otherProfile.showLifestyle || !myValue || !otherValue)
      return add(key, label, weight, 'UNKNOWN', unknown);
    let result: MatchResult = myValue === otherValue ? 'MATCH' : 'DIFFERENT';
    if (
      myValue !== otherValue &&
      (myValue === flexibleValue || otherValue === flexibleValue)
    )
      result = 'PARTIAL';
    if (
      key === 'petPreference' &&
      ((myValue === 'HAS_PETS' && otherValue === 'PET_FRIENDLY') ||
        (otherValue === 'HAS_PETS' && myValue === 'PET_FRIENDLY'))
    )
      result = 'MATCH';
    add(key, label, weight, result, habitExplanations[result]);
  }
  compareHabit('sleepSchedule', 'Giờ ngủ', 15, 'FLEXIBLE');
  compareHabit('smokingPreference', 'Hút thuốc', 15, 'OUTDOOR_ONLY');
  compareHabit('petPreference', 'Thú cưng', 10, 'PET_FRIENDLY');
  compareHabit('quietLevel', 'Mức độ yên tĩnh', 10, 'BALANCED');
  const assessedReasons = reasons.filter((item) => item.result !== 'UNKNOWN');
  const totalWeight = assessedReasons.reduce(
    (sum, item) => sum + item.weight,
    0,
  );
  const points = assessedReasons.reduce(
    (sum, item) => sum + item.weight * matchPoints[item.result],
    0,
  );
  return {
    score:
      assessedReasons.length >= 2
        ? Math.round((points / totalWeight) * 100)
        : null,
    assessed: assessedReasons.length,
    total: reasons.length,
    reasons,
  };
}
