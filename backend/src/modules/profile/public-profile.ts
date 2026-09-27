import type { Profile } from '../../generated/prisma/client.js';
import type {
  DesiredLocation,
  LocationsService,
} from '../locations/locations.service.js';

// Discovery, matching and public profiles use the same privacy boundary.
export function publicProfile(profile: Profile, locations: LocationsService) {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    visibility: profile.visibility,
    budgetMin: profile.showBudget ? profile.budgetMin : undefined,
    budgetMax: profile.showBudget ? profile.budgetMax : undefined,
    desiredAreas: profile.showDesiredAreas ? profile.desiredAreas : undefined,
    desiredLocations: profile.showDesiredAreas
      ? locations.resolve(
          profile.desiredLocations as unknown as DesiredLocation[],
        )
      : undefined,
    sleepSchedule: profile.showLifestyle ? profile.sleepSchedule : undefined,
    smokingPreference: profile.showLifestyle
      ? profile.smokingPreference
      : undefined,
    petPreference: profile.showLifestyle ? profile.petPreference : undefined,
    quietLevel: profile.showLifestyle ? profile.quietLevel : undefined,
  };
}
