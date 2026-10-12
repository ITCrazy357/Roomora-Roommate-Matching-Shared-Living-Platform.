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
    const hasRoom =
      input.type === 'ROOM_RENTAL' ||
      (input.type === 'ROOMMATE' && input.hasRoom);
    const roommateSeekingRoom = input.type === 'ROOMMATE' && !hasRoom;
    const { provinceCode, wardCode, availableFrom, latitude, longitude } =
      input;
    if (
      (!provinceCode && wardCode) ||
      (hasRoom && (latitude === null) !== (longitude === null))
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
      hasRoom,
      title: input.title,
      description: input.description,
      rent: input.rent,
      deposit: hasRoom ? input.deposit : 0,
      electricityCost: hasRoom ? input.electricityCost : 0,
      waterCost: hasRoom ? input.waterCost : 0,
      internetCost: hasRoom ? input.internetCost : 0,
      otherCost: hasRoom ? input.otherCost : 0,
      costNote: hasRoom ? input.costNote : '',
      area: roommateSeekingRoom ? null : input.area,
      availableSlots: hasRoom ? input.availableSlots : 1,
      currentResidents:
        input.type === 'ROOMMATE' && hasRoom ? input.currentResidents : 0,
      desiredResidents:
        input.type === 'ROOM_WANTED' ? input.desiredResidents : null,
      availableFrom:
        input.type === 'ROOM_RENTAL' && availableFrom
          ? new Date(`${availableFrom}T00:00:00Z`)
          : null,
      ...location,
      privateAddress: hasRoom ? input.privateAddress : '',
      // About 1 km precision. The exact input is not persisted.
      latitude:
        !hasRoom || latitude === null ? null : Math.round(latitude * 100) / 100,
      longitude:
        !hasRoom || longitude === null
          ? null
          : Math.round(longitude * 100) / 100,
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
      where: { id, ownerId, deletedAt: null },
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
    const hasRoom =
      listing.type === 'ROOM_RENTAL' ||
      (listing.type === 'ROOMMATE' && listing.hasRoom);
    const roommateSeekingRoom = listing.type === 'ROOMMATE' && !hasRoom;
    return {
      id: listing.id,
      type: listing.type,
      hasRoom,
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
      deposit: hasRoom ? listing.deposit : 0,
      electricityCost: hasRoom ? listing.electricityCost : 0,
      waterCost: hasRoom ? listing.waterCost : 0,
      internetCost: hasRoom ? listing.internetCost : 0,
      otherCost: hasRoom ? listing.otherCost : 0,
      costNote: hasRoom ? listing.costNote : '',
      area: roommateSeekingRoom ? null : listing.area,
      availableSlots: hasRoom ? listing.availableSlots : 1,
      currentResidents: hasRoom ? listing.currentResidents : 0,
      desiredResidents: listing.desiredResidents,
      availableFrom:
        listing.type === 'ROOM_RENTAL' ? listing.availableFrom : null,
      provinceCode: listing.provinceCode,
      provinceName: listing.provinceName,
      wardCode: listing.wardCode,
      wardName: listing.wardName,
      latitude: hasRoom ? listing.latitude : null,
      longitude: hasRoom ? listing.longitude : null,
      amenities: listing.amenities,
      roommateNote: listing.roommateNote,
      smokingPreference: listing.smokingPreference,
      petPreference: listing.petPreference,
      quietLevel: listing.quietLevel,
      publishedAt: listing.publishedAt,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      photos: (roommateSeekingRoom ? [] : listing.photos).map(
        ({ id, url, position }) => ({
          id,
          url,
          position,
        }),
      ),
      owner: {
        id: listing.owner.id,
        displayName: listing.owner.profile?.displayName ?? 'Thành viên Roomora',
        avatarUrl: listing.owner.profile?.avatarUrl ?? null,
        profilePublic: listing.owner.profile?.visibility === 'PUBLIC',
      },
    };
  }

  privateView(listing: Listing) {
    const view = this.publicView(listing);
    return {
      ...view,
      postingRound: listing.postingRound,
      paymentCompleted: listing.serviceOrders.some(
        (order) => order.postingRound === listing.postingRound,
      ),
      privateAddress: view.hasRoom ? listing.privateAddress : '',
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
