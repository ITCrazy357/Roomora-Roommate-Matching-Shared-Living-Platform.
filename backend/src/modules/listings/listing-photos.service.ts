import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { MAX_PHOTOS } from './listing-views.js';
import { ListingQueriesService } from './listing-queries.service.js';
import { ListingRulesService } from './listing-rules.service.js';

@Injectable()
export class ListingPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: CloudinaryService,
    private readonly queries: ListingQueriesService,
    private readonly rules: ListingRulesService,
  ) {}

  async uploadPhoto(
    ownerId: string,
    id: string,
    version: number,
    file: Express.Multer.File,
  ) {
    const listing = await this.rules.requireOwner(ownerId, id);
    if (listing.version !== version) this.rules.requireChange(0);
    if (listing.photos.length >= MAX_PHOTOS) this.rules.photoLimit();
    const image = await this.images.uploadListingPhoto(file, id);
    try {
      await this.prisma.$transaction(async (tx) => {
        // The version update locks this listing before counting/inserting photos.
        const result = await tx.listing.updateMany({
          where: { id, ownerId, version },
          data: this.rules.draftData(),
        });
        this.rules.requireChange(result.count);
        const photos = await tx.listingPhoto.findMany({
          where: { listingId: id },
          select: { position: true },
        });
        if (photos.length >= MAX_PHOTOS) this.rules.photoLimit();
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
    return this.queries.getMine(ownerId, id);
  }

  async removePhoto(
    ownerId: string,
    id: string,
    photoId: string,
    version: number,
  ) {
    await this.rules.requireOwner(ownerId, id);
    const photo = await this.prisma.listingPhoto.findFirst({
      where: { id: photoId, listingId: id },
    });
    if (!photo) this.rules.notFound();
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.listing.updateMany({
        where: { id, ownerId, version },
        data: this.rules.draftData(),
      });
      this.rules.requireChange(result.count);
      await tx.listingPhoto.delete({ where: { id: photoId } });
    });
    await this.images.deleteListingPhoto(photo.publicId, id);
    return this.queries.getMine(ownerId, id);
  }
}
