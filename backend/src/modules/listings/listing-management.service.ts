import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  ListingInputDto,
  ReviewListingDto,
  UpdateListingDto,
} from './dto/listing.dto.js';
import { details } from './listing-views.js';
import { ListingQueriesService } from './listing-queries.service.js';
import { ListingRulesService } from './listing-rules.service.js';
import { ListingPhotosService } from './listing-photos.service.js';

@Injectable()
export class ListingManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: ListingQueriesService,
    private readonly rules: ListingRulesService,
    private readonly photos: ListingPhotosService,
  ) {}

  async create(ownerId: string, input: ListingInputDto) {
    const listing = await this.prisma.listing.create({
      data: { ...this.rules.formData(input), ownerId },
      include: details,
    });
    return this.rules.privateView(listing);
  }

  async update(ownerId: string, id: string, input: UpdateListingDto) {
    const listing = await this.rules.requireOwner(ownerId, id);
    const result = await this.prisma.listing.updateMany({
      where: { id, ownerId, version: input.version },
      data: {
        ...this.rules.formData(input),
        ...this.rules.draftData(),
        ...(listing.type !== input.type ||
        (input.type === 'ROOMMATE' && listing.hasRoom !== input.hasRoom)
          ? { isFull: false }
          : {}),
      },
    });
    this.rules.requireChange(result.count);
    return this.queries.getMine(ownerId, id);
  }

  async submit(ownerId: string, id: string, version: number) {
    const listing = await this.rules.requireOwner(ownerId, id);
    this.rules.requireComplete(listing);
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
    this.rules.requireChange(result.count);
    return this.queries.getMine(ownerId, id);
  }

  async deleteDraft(ownerId: string, id: string, version: number) {
    const publicIds = await this.prisma.$transaction(async (tx) => {
      // Keep the same user -> listing lock order as closing and billing.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${id}::uuid FOR UPDATE`;
      const listing = await tx.listing.findFirst({
        where: { id, ownerId, deletedAt: null },
        select: {
          status: true,
          version: true,
          photos: { select: { publicId: true } },
        },
      });
      if (!listing) this.rules.notFound();
      if (listing.version !== version) this.rules.requireChange(0);
      if (listing.status !== 'DRAFT')
        throw new BadRequestException({
          code: 'LISTING_NOT_DRAFT',
          message: 'Chỉ được xóa tin ở trạng thái bản nháp',
        });
      // Keep the listing row for payment, refund and moderation history.
      await tx.listing.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: 'CLOSED',
          postingRound: { increment: 1 },
          boostUntil: null,
          version: { increment: 1 },
        },
      });
      await tx.serviceOrder.updateMany({
        where: { listingId: id, status: 'PENDING' },
        data: { status: 'EXPIRED', payUrl: null },
      });
      await tx.listingPhoto.deleteMany({ where: { listingId: id } });
      return listing.photos.map((photo) => photo.publicId);
    });
    await this.photos.deleteAssets(id, publicIds);
    return { deleted: true };
  }

  async close(ownerId: string, id: string, version: number) {
    await this.rules.requireOwner(ownerId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId}::uuid FOR UPDATE`;
      const result = await tx.listing.updateMany({
        where: { id, ownerId, version, status: { not: 'CLOSED' } },
        // Closing ends this posting round. Edits and moderation keep its number.
        data: {
          status: 'CLOSED',
          postingRound: { increment: 1 },
          boostUntil: null,
          version: { increment: 1 },
        },
      });
      this.rules.requireChange(result.count);
      await tx.serviceOrder.updateMany({
        where: { listingId: id, status: 'PENDING' },
        data: { status: 'EXPIRED', payUrl: null },
      });
    });
    return this.queries.getMine(ownerId, id);
  }

  async setFull(ownerId: string, id: string, version: number, isFull: boolean) {
    const listing = await this.rules.requireOwner(ownerId, id);
    if (listing.type !== 'ROOMMATE')
      throw new BadRequestException({ code: 'LISTING_TYPE_INVALID' });
    const result = await this.prisma.listing.updateMany({
      where: { id, ownerId, version, status: 'PUBLISHED' },
      data: { isFull, version: { increment: 1 } },
    });
    this.rules.requireChange(result.count);
    return this.queries.getMine(ownerId, id);
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
    if (!listing || listing.deletedAt) this.rules.notFound();
    if (listing.ownerId === adminId)
      throw new BadRequestException({
        code: 'SELF_REVIEW_NOT_ALLOWED',
        message: 'Không được tự duyệt tin của mình',
      });
    if (input.decision === 'PUBLISHED') this.rules.requireComplete(listing);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${listing.ownerId}::uuid FOR UPDATE`;
      const owner = await tx.user.findUniqueOrThrow({
        where: { id: listing.ownerId },
        select: { lockedAt: true },
      });
      if (input.decision === 'PUBLISHED' && owner.lockedAt)
        throw new BadRequestException({
          code: 'LISTING_OWNER_LOCKED',
          message: 'Không thể duyệt tin của tài khoản đang bị khóa',
        });
      const result = await tx.listing.updateMany({
        where: { id, version: input.version, status: 'PENDING' },
        data: {
          status: input.decision,
          rejectionReason: input.decision === 'REJECTED' ? input.reason : null,
          publishedAt: input.decision === 'PUBLISHED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      this.rules.requireChange(result.count);
      await tx.listingReview.create({
        data: {
          listingId: id,
          adminId,
          decision: input.decision,
          reason: input.reason || null,
          version: input.version,
        },
      });
      await tx.adminAction.create({
        data: {
          actorId: adminId,
          entityId: id,
          action: `LISTING_${input.decision}`,
          reason: input.reason || null,
          snapshot: { version: input.version + 1, status: input.decision },
        },
      });
    });
    return this.queries.getModeration(id);
  }

  async save(userId: string, id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, status: 'PUBLISHED', owner: { lockedAt: null } },
      select: { id: true },
    });
    if (!listing) this.rules.notFound();
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
}
