import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { LocationsService } from '../locations/locations.service.js';
import type { PeopleQuery } from '../people/dto/people.dto.js';
import { PeopleViewsService } from './people-views.service.js';
import { PeopleAccessService } from './people-access.service.js';

@Injectable()
export class PeopleDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
    private readonly views: PeopleViewsService,
    private readonly access: PeopleAccessService,
  ) {}

  async search(query: PeopleQuery, viewerId?: string) {
    if (
      query.budgetMin !== undefined &&
      query.budgetMax !== undefined &&
      query.budgetMin > query.budgetMax
    )
      throw new BadRequestException({
        code: 'BUDGET_RANGE_INVALID',
        message: 'Khoảng ngân sách không hợp lệ',
      });
    if (query.wardCode && !query.provinceCode)
      throw new BadRequestException({ code: 'LOCATION_INVALID' });
    if (query.provinceCode)
      this.locations.resolve([
        { provinceCode: query.provinceCode, wardCode: query.wardCode },
      ]);
    const where: Prisma.ProfileWhereInput = {
      visibility: 'PUBLIC',
      userId: viewerId ? { not: viewerId } : undefined,
      user: {
        role: 'USER',
        lockedAt: null,
        emailVerifiedAt: { not: null },
        ...(viewerId
          ? {
              blockedUsers: { none: { targetId: viewerId } },
              blockedBy: { none: { blockerId: viewerId } },
              sentConnections: {
                none: { receiverId: viewerId, status: 'ACCEPTED' },
              },
              receivedConnections: {
                none: { senderId: viewerId, status: 'ACCEPTED' },
              },
            }
          : {}),
      },
    };
    const filters: Prisma.ProfileWhereInput[] = [];
    if (query.q)
      filters.push({
        OR: [
          { displayName: { contains: query.q, mode: 'insensitive' } },
          { bio: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    if (query.provinceCode)
      filters.push({
        showDesiredAreas: true,
        desiredLocations: {
          array_contains: [
            {
              provinceCode: query.provinceCode,
              ...(query.wardCode ? { wardCode: query.wardCode } : {}),
            },
          ],
        },
      });
    if (query.budgetMin !== undefined)
      filters.push({
        showBudget: true,
        OR: [
          { budgetMax: { gte: query.budgetMin } },
          { budgetMax: null, budgetMin: { not: null } },
        ],
      });
    if (query.budgetMax !== undefined)
      filters.push({
        showBudget: true,
        OR: [
          { budgetMin: { lte: query.budgetMax } },
          { budgetMin: null, budgetMax: { not: null } },
        ],
      });
    for (const key of [
      'sleepSchedule',
      'smokingPreference',
      'petPreference',
      'quietLevel',
    ] as const)
      if (query[key]) filters.push({ showLifestyle: true, [key]: query[key] });
    where.AND = filters;
    const [profiles, total, viewer] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        include: {
          user: {
            select: { identityDeclaration: { select: { status: true } } },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { userId: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.profile.count({ where }),
      viewerId
        ? this.prisma.profile.findUnique({ where: { userId: viewerId } })
        : null,
    ]);
    const userIds = profiles.map((profile) => profile.userId);
    const connections =
      viewerId && userIds.length
        ? await this.prisma.connection.findMany({
            where: {
              OR: [
                { senderId: viewerId, receiverId: { in: userIds } },
                { receiverId: viewerId, senderId: { in: userIds } },
              ],
            },
          })
        : [];
    const connectionsByUser = new Map(
      connections.map((item) => [
        item.senderId === viewerId ? item.receiverId : item.senderId,
        item,
      ]),
    );
    return this.views.page(
      profiles.map((profile) =>
        this.views.person(
          profile,
          viewer,
          connectionsByUser.get(profile.userId),
        ),
      ),
      total,
      query,
    );
  }

  async getPerson(targetId: string, viewerId?: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: targetId },
      include: {
        user: {
          select: {
            emailVerifiedAt: true,
            lockedAt: true,
            role: true,
            identityDeclaration: { select: { status: true } },
          },
        },
      },
    });
    if (
      !profile ||
      profile.user.lockedAt ||
      profile.user.role !== 'USER' ||
      (!profile.user.emailVerifiedAt && targetId !== viewerId) ||
      (profile.visibility !== 'PUBLIC' && targetId !== viewerId)
    )
      this.access.unavailable();
    if (
      viewerId &&
      (await this.access.isBlocked(this.prisma, viewerId, targetId))
    )
      this.access.unavailable();
    const [viewer, connection, listings] = await Promise.all([
      viewerId
        ? this.prisma.profile.findUnique({ where: { userId: viewerId } })
        : null,
      viewerId && targetId !== viewerId
        ? this.prisma.connection.findUnique({
            where: { pairKey: this.access.getPairKey(viewerId, targetId) },
          })
        : null,
      this.prisma.listing.findMany({
        where: { ownerId: targetId, status: 'PUBLISHED' },
        select: {
          id: true,
          title: true,
          rent: true,
          type: true,
          hasRoom: true,
          provinceName: true,
          wardName: true,
          latitude: true,
          longitude: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 8,
      }),
    ]);
    return {
      ...this.views.person(profile, viewer, connection ?? undefined),
      identityStatus: profile.user.identityDeclaration?.status ?? null,
      listings: listings.map((listing) => ({
        ...listing,
        latitude:
          listing.type === 'ROOM_WANTED' ||
          !listing.hasRoom ||
          listing.latitude === null
            ? null
            : Math.round(listing.latitude * 100) / 100,
        longitude:
          listing.type === 'ROOM_WANTED' ||
          !listing.hasRoom ||
          listing.longitude === null
            ? null
            : Math.round(listing.longitude * 100) / 100,
      })),
    };
  }
}
