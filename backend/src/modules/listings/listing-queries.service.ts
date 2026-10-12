import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { LocationsService } from '../locations/locations.service.js';
import type { ListingQueryDto } from './dto/listing.dto.js';
import { details, type Listing } from './listing-views.js';
import { ListingRulesService } from './listing-rules.service.js';

@Injectable()
export class ListingQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
    private readonly rules: ListingRulesService,
  ) {}

  async getMine(ownerId: string, id: string) {
    return this.rules.privateView(await this.rules.requireOwner(ownerId, id));
  }

  async getPublic(id: string, userId?: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: details,
    });
    if (!listing || listing.deletedAt) this.rules.notFound();
    if (listing.ownerId === userId) return this.rules.privateView(listing);
    if (listing.status !== 'PUBLISHED' || listing.owner.lockedAt)
      this.rules.notFound();
    const saved = userId
      ? await this.prisma.savedListing.findUnique({
          where: { userId_listingId: { userId, listingId: id } },
        })
      : null;
    return { ...this.rules.publicView(listing), saved: Boolean(saved) };
  }

  listPublic(query: ListingQueryDto, userId?: string) {
    return this.list(
      query,
      {
        ...this.filters(query),
        status: 'PUBLISHED',
        owner: { lockedAt: null },
      },
      userId,
    );
  }

  listMine(ownerId: string, query: ListingQueryDto) {
    return this.list(
      query,
      { ...this.filters(query), ownerId, status: query.status },
      ownerId,
      true,
    );
  }

  listSaved(userId: string, query: ListingQueryDto) {
    return this.list(
      query,
      {
        ...this.filters(query),
        status: 'PUBLISHED',
        owner: { lockedAt: null },
        saves: { some: { userId } },
      },
      userId,
      false,
      true,
    );
  }

  listModeration(query: ListingQueryDto) {
    return this.list(
      query,
      { ...this.filters(query), status: query.status ?? 'PENDING' },
      undefined,
      true,
    );
  }

  async getModeration(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: details,
    });
    if (!listing || listing.deletedAt) this.rules.notFound();
    const reviews = await this.prisma.listingReview.findMany({
      where: { listingId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        decision: true,
        reason: true,
        version: true,
        createdAt: true,
      },
    });
    return { ...this.rules.privateView(listing), reviews };
  }

  private async list(
    query: ListingQueryDto,
    where: Prisma.ListingWhereInput,
    userId?: string,
    privateData = false,
    savedOrder = false,
  ) {
    let orderBy: Prisma.ListingOrderByWithRelationInput[] = [
      { publishedAt: 'desc' },
      { id: 'desc' },
    ];
    if (privateData) orderBy = [{ updatedAt: 'desc' }, { id: 'desc' }];
    if (privateData && !userId && where.status === 'PENDING')
      orderBy = [{ submittedAt: 'asc' }, { id: 'asc' }];
    if (query.sort === 'price_asc') orderBy = [{ rent: 'asc' }, { id: 'desc' }];
    if (query.sort === 'price_desc')
      orderBy = [{ rent: 'desc' }, { id: 'desc' }];
    const skip = (query.page - 1) * query.limit;
    let rows: Listing[];
    let total: number;
    if (savedOrder && query.sort === 'newest') {
      const [savedRows, count] = await this.prisma.$transaction(
        [
          this.prisma.savedListing.findMany({
            where: { userId, listing: where },
            include: { listing: { include: details } },
            orderBy: [{ createdAt: 'desc' }, { listingId: 'desc' }],
            skip,
            take: query.limit,
          }),
          this.prisma.savedListing.count({ where: { userId, listing: where } }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
      rows = savedRows.map((row) => row.listing);
      total = count;
    } else if (!privateData && !savedOrder && query.sort === 'newest') {
      // Keep filters and pagination consistent: sponsored rows first only for newest.
      [rows, total] = await this.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const promoted = {
            AND: [where, { boostUntil: { gt: now }, isFull: false }],
          };
          const regular = {
            AND: [
              where,
              {
                OR: [
                  { boostUntil: null },
                  { boostUntil: { lte: now } },
                  { isFull: true },
                ],
              },
            ],
          };
          const count = await tx.listing.count({ where });
          const promotedCount = await tx.listing.count({ where: promoted });
          const first =
            skip < promotedCount
              ? await tx.listing.findMany({
                  where: promoted,
                  include: details,
                  orderBy,
                  skip,
                  take: query.limit,
                })
              : [];
          const rest =
            first.length < query.limit
              ? await tx.listing.findMany({
                  where: regular,
                  include: details,
                  orderBy,
                  skip: Math.max(0, skip - promotedCount),
                  take: query.limit - first.length,
                })
              : [];
          return [[...first, ...rest], count];
        },
        { isolationLevel: 'RepeatableRead' },
      );
    } else {
      [rows, total] = await this.prisma.$transaction(
        [
          this.prisma.listing.findMany({
            where,
            include: details,
            orderBy,
            skip,
            take: query.limit,
          }),
          this.prisma.listing.count({ where }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
    }
    const saves =
      userId && rows.length
        ? await this.prisma.savedListing.findMany({
            where: { userId, listingId: { in: rows.map((row) => row.id) } },
            select: { listingId: true },
          })
        : [];
    const savedIds = new Set(saves.map((save) => save.listingId));
    return {
      items: rows.map((row) => ({
        ...(privateData
          ? this.rules.privateView(row)
          : this.rules.publicView(row)),
        saved: savedIds.has(row.id),
      })),
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    };
  }

  private filters(query: ListingQueryDto): Prisma.ListingWhereInput {
    if (
      query.minRent !== undefined &&
      query.maxRent !== undefined &&
      query.minRent > query.maxRent
    ) {
      throw new BadRequestException({
        code: 'RENT_RANGE_INVALID',
        message: 'Khoảng giá không hợp lệ',
      });
    }
    if (query.provinceCode)
      this.locations.resolve([
        { provinceCode: query.provinceCode, wardCode: query.wardCode },
      ]);
    else if (query.wardCode)
      throw new BadRequestException({
        code: 'LOCATION_INVALID',
        message: 'Cần chọn tỉnh/thành phố',
      });
    return {
      type: query.type,
      deletedAt: null,
      provinceCode: query.provinceCode,
      wardCode: query.wardCode,
      rent: { gte: query.minRent, lte: query.maxRent },
      amenities: query.amenities?.length
        ? { hasEvery: query.amenities }
        : undefined,
      OR: query.search
        ? ['title', 'description', 'provinceName', 'wardName'].map((field) => ({
            [field]: { contains: query.search, mode: 'insensitive' },
          }))
        : undefined,
    };
  }
}
