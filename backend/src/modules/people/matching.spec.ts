import type { Profile } from '../../generated/prisma/client.js';
import { matchProfiles } from './matching.js';

const profile = {
  userId: 'test',
  desiredLocations: [{ provinceCode: '01', wardCode: '00004' }],
  budgetMin: 2000000,
  budgetMax: 3000000,
  sleepSchedule: 'EARLY_BIRD',
  smokingPreference: 'NO_SMOKING',
  petPreference: 'NO_PETS',
  quietLevel: 'QUIET',
  showBudget: true,
  showDesiredAreas: true,
  showLifestyle: true,
} as unknown as Profile;
describe('Roommate matching rules', () => {
  it('explains six matching criteria and fixed weights', () => {
    const result = matchProfiles(profile, profile);
    expect(result.score).toBe(100);
    expect(result.assessed).toBe(6);
    expect(result.reasons.map((item) => item.weight)).toEqual([
      25, 25, 15, 15, 10, 10,
    ]);
    expect(result.reasons.every((item) => item.result === 'MATCH')).toBe(true);
  });
  it('does not score hidden data or reveal conflicts through reasons', () => {
    const hidden = {
      ...profile,
      showBudget: false,
      showDesiredAreas: false,
      showLifestyle: false,
    };
    const result = matchProfiles(profile, hidden);
    expect(result.score).toBeNull();
    expect(result.assessed).toBe(0);
    expect(result.reasons.every((item) => item.result === 'UNKNOWN')).toBe(
      true,
    );
    expect(matchProfiles(null, profile).score).toBeNull();
  });
  it('distinguishes differences from flexible habits and shared province', () => {
    const other = {
      ...profile,
      desiredLocations: [{ provinceCode: '01', wardCode: '00007' }],
      budgetMin: 4000000,
      budgetMax: 5000000,
      sleepSchedule: 'FLEXIBLE',
      smokingPreference: 'SMOKER',
      petPreference: 'HAS_PETS',
      quietLevel: 'BALANCED',
    } as unknown as Profile;
    const result = matchProfiles(profile, other);
    expect(result.reasons.map((item) => item.result)).toEqual([
      'PARTIAL',
      'DIFFERENT',
      'PARTIAL',
      'DIFFERENT',
      'DIFFERENT',
      'PARTIAL',
    ]);
    expect(result.score).toBe(25);
  });
  it('accepts pets when one person has pets and the other welcomes them', () => {
    const result = matchProfiles(
      { ...profile, petPreference: 'HAS_PETS' },
      { ...profile, petPreference: 'PET_FRIENDLY' },
    );
    expect(
      result.reasons.find((item) => item.key === 'petPreference')?.result,
    ).toBe('MATCH');
  });
  it('treats open-ended budgets as ranges and requires two known criteria', () => {
    const other = {
      ...profile,
      budgetMin: null,
      budgetMax: 2100000,
      showDesiredAreas: false,
      showLifestyle: false,
    };
    expect(
      matchProfiles(profile, other).reasons.find(
        (item) => item.key === 'budget',
      )?.result,
    ).toBe('MATCH');
    expect(matchProfiles(profile, other).score).toBeNull();
  });
});
