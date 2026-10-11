import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { LocationsService } from '../locations/locations.service.js';
import type { ListingInputDto } from './dto/listing.dto.js';
import { details, type Listing } from './listing-views.js';

@Injectable()
export class ListingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  formData(input: ListingInputDto) {
    const wanted = input.type === 'ROOM_WANTED';
    const { provinceCode, wardCode, availableFrom, latitude, longitude } =
      input;
    if (
      (!provinceCode && wardCode) ||
      (!wanted && (latitude === null) !== (longitude === null))
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
      deposit: wanted ? 0 : input.deposit,
      electricityCost: wanted ? 0 : input.electricityCost,
      waterCost: wanted ? 0 : input.waterCost,
      internetCost: wanted ? 0 : input.internetCost,
      otherCost: wanted ? 0 : input.otherCost,
      costNote: wanted ? '' : input.costNote,
      area: input.area,
      availableSlots: wanted ? 1 : input.availableSlots,
      currentResidents: input.type === 'ROOMMATE' ? input.currentResidents : 0,
      desiredResidents:
        input.type === 'ROOM_WANTED' ? input.desiredResidents : null,
      availableFrom:
        !wanted && availableFrom
          ? new Date(`${availableFrom}T00:00:00Z`)
          : null,
      ...location,
      privateAddress: wanted ? '' : input.privateAddress,
      // About 1 km precision. The exact input is not persisted.
      latitude:
        wanted || latitude === null ? null : Math.round(latitude * 100) / 100,
      longitude:
        wanted || longitude === null ? null : Math.round(longitude * 100) / 100,
      amenities: input.amenities,
      roommateNote: input.roommateNote,
      smokingPreference: input.smokingPreference,
      petPreference: input.petPreference,
      quietLevel: input.quietLevel,
    };
  }

  draftData() {
    return {
      status: 'DRAFT' as const,
      rejectionReason: null,
      submittedAt: null,
      publishedAt: null,
      version: { increment: 1 },
    };
  }

  async requireOwner(ownerId: string, id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, ownerId },
      include: details,
    });
    if (!listing) this.notFound();
    return listing;
  }

  requireComplete(listing: Listing) {
    if (listing.type !== 'ROOM_RENTAL') {
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

  publicView(listing: Listing) {
    const wanted = listing.type === 'ROOM_WANTED';
    return {
      id: listing.id,
      type: listing.type,
      isFull: listing.isFull,
      ownerId: listing.ownerId,
      title: listing.title,
      description: listing.description,
      status: listing.status,
      sponsored:
        listing.status === 'PUBLISHED' &&
        !listing.isFull &&
        !listing.owner.lockedAt &&
        Boolean(listing.boostUntil && listing.boostUntil > new Date()),
      rent: listing.rent,
      deposit: wanted ? 0 : listing.deposit,
      electricityCost: wanted ? 0 : listing.electricityCost,
      waterCost: wanted ? 0 : listing.waterCost,
      internetCost: wanted ? 0 : listing.internetCost,
      otherCost: wanted ? 0 : listing.otherCost,
      costNote: wanted ? '' : listing.costNote,
      area: listing.area,
      availableSlots: listing.availableSlots,
      currentResidents: listing.currentResidents,
      desiredResidents: listing.desiredResidents,
      availableFrom: wanted ? null : listing.availableFrom,
      provinceCode: listing.provinceCode,
      provinceName: listing.provinceName,
      wardCode: listing.wardCode,
      wardName: listing.wardName,
      latitude: wanted ? null : listing.latitude,
      longitude: wanted ? null : listing.longitude,
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
        profilePublic: listing.owner.profile?.visibility === 'PUBLIC',
      },
    };
  }

  privateView(listing: Listing) {
    return {
      ...this.publicView(listing),
      postingRound: listing.postingRound,
      paymentCompleted: listing.serviceOrders.some(
        (order) => order.postingRound === listing.postingRound,
      ),
      privateAddress:
        listing.type === 'ROOM_WANTED' ? '' : listing.privateAddress,
      rejectionReason: listing.rejectionReason,
      version: listing.version,
      submittedAt: listing.submittedAt,
    };
  }

  requireChange(count: number) {
    if (count !== 1)
      throw new ConflictException({
        code: 'LISTING_CHANGED',
        message: 'Tin đã thay đổi. Tải lại trước khi tiếp tục',
      });
  }

  photoLimit(): never {
    throw new BadRequestException({
      code: 'PHOTO_LIMIT_REACHED',
      message: 'Mỗi tin có tối đa 8 ảnh',
    });
  }

  notFound(): never {
    throw new NotFoundException({
      code: 'LISTING_NOT_FOUND',
      message: 'Tin không còn hiển thị hoặc bạn không có quyền truy cập',
    });
  }
}
