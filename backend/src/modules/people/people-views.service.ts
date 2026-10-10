import { Injectable } from '@nestjs/common';
import type { Connection, Profile } from '../../generated/prisma/client.js';
import { LocationsService } from '../locations/locations.service.js';
import { publicProfile } from '../profile/public-profile.js';
import { matchProfiles } from './matching.js';

@Injectable()
export class PeopleViewsService {
  constructor(private readonly locations: LocationsService) {}

  person(profile: Profile, viewer: Profile | null, connection?: Connection) {
    return {
      ...publicProfile(profile, this.locations),
      match:
        viewer?.userId === profile.userId
          ? null
          : matchProfiles(viewer, profile),
      connection:
        connection && viewer
          ? this.connectionView(connection, viewer.userId)
          : null,
    };
  }

  connectionView(connection: Connection, userId: string) {
    return {
      id: connection.id,
      status: connection.status,
      version: connection.version,
      message: connection.message,
      direction: connection.senderId === userId ? 'sent' : 'received',
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  page<T>(items: T[], total: number, query: { page: number; limit: number }) {
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    };
  }
}
