import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { ListingQueriesService } from '../listings/listing-queries.service.js';
import { ListingQueryDto } from '../listings/dto/listing.dto.js';
import { listingDetailSchema, listingSearchSchema } from './lookup.schemas.js';

type PublicListing = Awaited<ReturnType<ListingQueriesService['getPublished']>>;

@Injectable()
export class ListingLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: ListingQueriesService,
    private readonly config: ConfigService,
  ) {}

  async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        lockedAt: true,
        closedAt: true,
        emailVerifiedAt: true,
      },
    });
    if (
      !user ||
      user.role !== 'USER' ||
      user.lockedAt ||
      user.closedAt ||
      !user.emailVerifiedAt
    )
      throw new ForbiddenException({
        code: 'LOOKUP_NOT_ALLOWED',
        message: 'Cần tài khoản USER đang hoạt động và đã xác minh email.',
      });
  }

  async search(userId: string, input: unknown) {
    await this.requireUser(userId);
    const parsed = listingSearchSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({ code: 'LOOKUP_FILTERS_INVALID' });
    const result = await this.queries.listPublic(
      Object.assign(new ListingQueryDto(), parsed.data),
    );
    return { ...result, items: result.items.map((item) => this.present(item)) };
  }

  async detail(userId: string, input: unknown) {
    await this.requireUser(userId);
    const parsed = listingDetailSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({ code: 'LOOKUP_ID_INVALID' });
    return this.present(await this.queries.getPublished(parsed.data.id));
  }

  private present(item: PublicListing) {
    return {
      id: item.id,
      type: item.type,
      hasRoom: item.hasRoom,
      title: item.title,
      description: item.description,
      rent: item.rent,
      priceUnit:
        item.type === 'ROOM_RENTAL' ? 'VNĐ/phòng/tháng' : 'VNĐ/người/tháng',
      area: item.area,
      provinceCode: item.provinceCode,
      wardCode: item.wardCode,
      provinceName: item.provinceName,
      wardName: item.wardName,
      amenities: item.amenities,
      isFull: item.isFull,
      sponsored: item.sponsored,
      deposit: item.deposit,
      electricityCost: item.electricityCost,
      waterCost: item.waterCost,
      internetCost: item.internetCost,
      otherCost: item.otherCost,
      costNote: item.costNote,
      availableSlots: item.availableSlots,
      availableFrom: item.availableFrom,
      publishedAt: item.publishedAt,
      photos: item.photos,
      href: `${this.config.getOrThrow<string>('FRONTEND_ORIGIN')}/phong/${item.id}`,
    };
  }
}
