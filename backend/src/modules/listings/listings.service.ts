import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { LocationsService } from '../locations/locations.service.js';
import type {
  ListingInputDto,
  ListingQueryDto,
  ReviewListingDto,
  UpdateListingDto,
} from './dto/listing.dto.js';

const details = {
  photos: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
  owner: {
    select: {
      id: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.ListingInclude;
type Listing = Prisma.ListingGetPayload<{ include: typeof details }>;
const MAX_PHOTOS = 8;

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: CloudinaryService,
    private readonly locations: LocationsService,
  ) {}

  async create(ownerId: string, input: ListingInputDto) {
    const listing = await this.prisma.listing.create({
      data: { ...this.formData(input), ownerId },
      include: details,
    });
    return this.privateView(listing);
  }

  async update(ownerId: string, id: string, input: UpdateListingDto) {
    await this.requireOwner(ownerId, id);
    const result = await this.prisma.listing.updateMany({
      where: { id, ownerId, version: input.version },
      data: { ...this.formData(input), ...this.draftData() },
    });
    this.requireChange(result.count);
    return this.getMine(ownerId, id);
  }

  async getMine(ownerId: string, id: string) {
    return this.privateView(await this.requireOwner(ownerId, id));
  }

  async getPublic(id: string, userId?: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: details,
    });
    if (!listing) this.notFound();
    if (listing.ownerId === userId) return this.privateView(listing);
    if (listing.status !== 'PUBLISHED') this.notFound();
    const saved = userId
      ? await this.prisma.savedListing.findUnique({
          where: { userId_listingId: { userId, listingId: id } },
        })
      : null;
    return { ...this.publicView(listing), saved: Boolean(saved) };
  }

  listPublic(query: ListingQueryDto, userId?: string) {
    return this.list(
      query,
      { ...this.filters(query), status: 'PUBLISHED' },
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
    if (!listing) this.notFound();
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
    return { ...this.privateView(listing), reviews };
  }

  async submit(ownerId: string, id: string, version: number) {
    const listing = await this.requireOwner(ownerId, id);
    this.requireComplete(listing);
    const result = await this.prisma.listing.updateMany({
      where: {
        id,
        ownerId,
        version,
        status: { in: ['DRAFT', 'REJECTED', 'CLOSED'] },
      },
      data: {
        status: 'PENDING',
        rejectionReason: null,
        submittedAt: new Date(),
        publishedAt: null,
        version: { increment: 1 },
      },
    });
    this.requireChange(result.count);
    return this.getMine(ownerId, id);
  }

  async close(ownerId: string, id: string, version: number) {
    await this.requireOwner(ownerId, id);
    const result = await this.prisma.listing.updateMany({
      where: { id, ownerId, version, status: { not: 'CLOSED' } },
      data: { status: 'CLOSED', version: { increment: 1 } },
    });
    this.requireChange(result.count);
    return this.getMine(ownerId, id);
  }

  async setFull(ownerId: string, id: string, version: number, isFull: boolean) {
    const listing = await this.requireOwner(ownerId, id);
    if (listing.type !== 'ROOMMATE')
      throw new BadRequestException({ code: 'LISTING_TYPE_INVALID' });
    const result = await this.prisma.listing.updateMany({
      where: { id, ownerId, version, status: 'PUBLISHED' },
      data: { isFull, version: { increment: 1 } },
    });
    this.requireChange(result.count);
    return this.getMine(ownerId, id);
  }

  async review(adminId: string, id: string, input: ReviewListingDto) {
    if (input.decision === 'REJECTED' && !input.reason?.trim()) {
      throw new BadRequestException({
        code: 'REJECTION_REASON_REQUIRED',
        message: 'Cần nhập lý do từ chối',
      });
    }
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: details,
    });
    if (!listing) this.notFound();
    if (listing.ownerId === adminId)
      throw new BadRequestException({
        code: 'SELF_REVIEW_NOT_ALLOWED',
        message: 'Không được tự duyệt tin của mình',
      });
    if (input.decision === 'PUBLISHED') this.requireComplete(listing);
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.listing.updateMany({
        where: { id, version: input.version, status: 'PENDING' },
        data: {
          status: input.decision,
          rejectionReason: input.decision === 'REJECTED' ? input.reason : null,
          publishedAt: input.decision === 'PUBLISHED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      this.requireChange(result.count);
      await tx.listingReview.create({
        data: {
          listingId: id,
          adminId,
          decision: input.decision,
          reason: input.reason || null,
          version: input.version,
        },
      });
    });
    return this.getModeration(id);
  }

  async uploadPhoto(
    ownerId: string,
    id: string,
    version: number,
    file: Express.Multer.File,
  ) {
    const listing = await this.requireOwner(ownerId, id);
    if (listing.version !== version) this.requireChange(0);
    if (listing.photos.length >= MAX_PHOTOS) this.photoLimit();
    const image = await this.images.uploadListingPhoto(file, id);
    try {
      await this.prisma.$transaction(async (tx) => {
        // The version update locks this listing before counting/inserting photos.
        const result = await tx.listing.updateMany({
          where: { id, ownerId, version },
          data: this.draftData(),
        });
        this.requireChange(result.count);
        const photos = await tx.listingPhoto.findMany({
          where: { listingId: id },
          select: { position: true },
        });
        if (photos.length >= MAX_PHOTOS) this.photoLimit();
        await tx.listingPhoto.create({
          data: {
            listingId: id,
            url: image.secureUrl,
            publicId: image.publicId,
            position:
              Math.max(-1, ...photos.map((photo) => photo.position)) + 1,
          },
        });
      });
    } catch (error) {
      await this.images.deleteListingPhoto(image.publicId, id);
      throw error;
    }
    return this.getMine(ownerId, id);
  }

  async removePhoto(
    ownerId: string,
    id: string,
    photoId: string,
    version: number,
  ) {
    await this.requireOwner(ownerId, id);
    const photo = await this.prisma.listingPhoto.findFirst({
      where: { id: photoId, listingId: id },
    });
    if (!photo) this.notFound();
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.listing.updateMany({
        where: { id, ownerId, version },
        data: this.draftData(),
      });
      this.requireChange(result.count);
      await tx.listingPhoto.delete({ where: { id: photoId } });
    });
    await this.images.deleteListingPhoto(photo.publicId, id);
    return this.getMine(ownerId, id);
  }

  async save(userId: string, id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!listing) this.notFound();
    // PostgreSQL handles duplicate clicks atomically with ON CONFLICT DO NOTHING.
    await this.prisma.savedListing.createMany({
      data: [{ userId, listingId: id }],
      skipDuplicates: true,
    });
    return { saved: true };
  }

  async unsave(userId: string, id: string) {
    await this.prisma.savedListing.deleteMany({
      where: { userId, listingId: id },
    });
    return { saved: false };
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
        ...(privateData ? this.privateView(row) : this.publicView(row)),
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

  private formData(input: ListingInputDto) {
    const { provinceCode, wardCode, availableFrom, latitude, longitude } =
      input;
    if (
      (!provinceCode && wardCode) ||
      (latitude === null) !== (longitude === null)
    ) {
      throw new BadRequestException({
        code: 'LOCATION_INVALID',
        message: 'Vị trí không đầy đủ',
      });
    }
    const location = provinceCode
      ? this.locations.resolve([{ provinceCode, wardCode }])[0]
      : {
          provinceCode: null,
          wardCode: null,
          provinceName: null,
          wardName: null,
        };
    return {
      type: input.type,
      title: input.title,
      description: input.description,
      rent: input.rent,
      deposit: input.deposit,
      electricityCost: input.electricityCost,
      waterCost: input.waterCost,
      internetCost: input.internetCost,
      otherCost: input.otherCost,
      costNote: input.costNote,
      area: input.area,
      availableSlots: input.availableSlots,
      currentResidents: input.currentResidents,
      availableFrom: availableFrom
        ? new Date(`${availableFrom}T00:00:00Z`)
        : null,
      ...location,
      privateAddress: input.privateAddress,
      // About 1 km precision. The exact input is not persisted.
      latitude: latitude === null ? null : Math.round(latitude * 100) / 100,
      longitude: longitude === null ? null : Math.round(longitude * 100) / 100,
      amenities: input.amenities,
      roommateNote: input.roommateNote,
      smokingPreference: input.smokingPreference,
      petPreference: input.petPreference,
      quietLevel: input.quietLevel,
    };
  }

  private draftData() {
    return {
      status: 'DRAFT' as const,
      rejectionReason: null,
      submittedAt: null,
      publishedAt: null,
      version: { increment: 1 },
    };
  }

  private async requireOwner(ownerId: string, id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, ownerId },
      include: details,
    });
    if (!listing) this.notFound();
    return listing;
  }

  private requireComplete(listing: Listing) {
    if (listing.type === 'ROOM_WANTED') {
      if (
        listing.title.length < 10 ||
        listing.description.length < 30 ||
        !listing.rent ||
        !listing.provinceCode ||
        !listing.wardCode
      )
        throw new BadRequestException({
          code: 'LISTING_INCOMPLETE',
          message: 'Cần tiêu đề, mô tả, ngân sách và khu vực muốn tìm',
        });
      return;
    }
    if (
      listing.title.length < 10 ||
      listing.description.length < 30 ||
      !listing.rent ||
      !listing.area ||
      !listing.provinceCode ||
      !listing.wardCode ||
      !listing.availableFrom ||
      !listing.privateAddress ||
      listing.latitude === null ||
      listing.longitude === null ||
      !listing.photos.length
    ) {
      throw new BadRequestException({
        code: 'LISTING_INCOMPLETE',
        message:
          'Cần bổ sung thông tin phòng, chi phí, vị trí và ít nhất một ảnh trước khi gửi duyệt',
      });
    }
  }

  private publicView(listing: Listing) {
    return {
      id: listing.id,
      type: listing.type,
      isFull: listing.isFull,
      ownerId: listing.ownerId,
      title: listing.title,
      description: listing.description,
      status: listing.status,
      rent: listing.rent,
      deposit: listing.deposit,
      electricityCost: listing.electricityCost,
      waterCost: listing.waterCost,
      internetCost: listing.internetCost,
      otherCost: listing.otherCost,
      costNote: listing.costNote,
      area: listing.area,
      availableSlots: listing.availableSlots,
      currentResidents: listing.currentResidents,
      availableFrom: listing.availableFrom,
      provinceCode: listing.provinceCode,
      provinceName: listing.provinceName,
      wardCode: listing.wardCode,
      wardName: listing.wardName,
      latitude: listing.latitude,
      longitude: listing.longitude,
      amenities: listing.amenities,
      roommateNote: listing.roommateNote,
      smokingPreference: listing.smokingPreference,
      petPreference: listing.petPreference,
      quietLevel: listing.quietLevel,
      publishedAt: listing.publishedAt,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      photos: listing.photos.map(({ id, url, position }) => ({
        id,
        url,
        position,
      })),
      owner: {
        id: listing.owner.id,
        displayName: listing.owner.profile?.displayName ?? 'Thành viên Roomora',
        avatarUrl: listing.owner.profile?.avatarUrl ?? null,
      },
    };
  }

  private privateView(listing: Listing) {
    return {
      ...this.publicView(listing),
      privateAddress: listing.privateAddress,
      rejectionReason: listing.rejectionReason,
      version: listing.version,
      submittedAt: listing.submittedAt,
    };
  }
  private requireChange(count: number) {
    if (count !== 1)
      throw new ConflictException({
        code: 'LISTING_CHANGED',
        message: 'Tin đã thay đổi. Tải lại trước khi tiếp tục',
      });
  }
  private photoLimit(): never {
    throw new BadRequestException({
      code: 'PHOTO_LIMIT_REACHED',
      message: 'Mỗi tin có tối đa 8 ảnh',
    });
  }
  private notFound(): never {
    throw new NotFoundException({
      code: 'LISTING_NOT_FOUND',
      message: 'Tin không còn hiển thị hoặc bạn không có quyền truy cập',
    });
  }
}
