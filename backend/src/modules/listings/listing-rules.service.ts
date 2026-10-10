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
      desiredResidents:
        input.type === 'ROOM_WANTED' ? input.desiredResidents : null,
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

  publicView(listing: Listing) {
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
      desiredResidents: listing.desiredResidents,
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
        profilePublic: listing.owner.profile?.visibility === 'PUBLIC',
      },
    };
  }

  privateView(listing: Listing) {
    return {
      ...this.publicView(listing),
      privateAddress: listing.privateAddress,
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
