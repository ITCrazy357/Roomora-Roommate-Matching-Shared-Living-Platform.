import { Injectable } from '@nestjs/common';
import type {
  ListingInputDto,
  ListingQueryDto,
  ReviewListingDto,
  UpdateListingDto,
} from './dto/listing.dto.js';
import { ListingManagementService } from './listing-management.service.js';
import { ListingQueriesService } from './listing-queries.service.js';
import { ListingPhotosService } from './listing-photos.service.js';

@Injectable()
export class ListingsService {
  constructor(
    private readonly management: ListingManagementService,
    private readonly queries: ListingQueriesService,
    private readonly photos: ListingPhotosService,
  ) {}

  create(ownerId: string, input: ListingInputDto) {
    return this.management.create(ownerId, input);
  }

  update(ownerId: string, id: string, input: UpdateListingDto) {
    return this.management.update(ownerId, id, input);
  }

  getMine(ownerId: string, id: string) {
    return this.queries.getMine(ownerId, id);
  }

  getPublic(id: string, userId?: string) {
    return this.queries.getPublic(id, userId);
  }

  listPublic(query: ListingQueryDto, userId?: string) {
    return this.queries.listPublic(query, userId);
  }

  listMine(ownerId: string, query: ListingQueryDto) {
    return this.queries.listMine(ownerId, query);
  }

  listSaved(userId: string, query: ListingQueryDto) {
    return this.queries.listSaved(userId, query);
  }

  listModeration(query: ListingQueryDto) {
    return this.queries.listModeration(query);
  }

  getModeration(id: string) {
    return this.queries.getModeration(id);
  }

  submit(ownerId: string, id: string, version: number) {
    return this.management.submit(ownerId, id, version);
  }

  close(ownerId: string, id: string, version: number) {
    return this.management.close(ownerId, id, version);
  }

  deleteDraft(ownerId: string, id: string, version: number) {
    return this.management.deleteDraft(ownerId, id, version);
  }

  setFull(ownerId: string, id: string, version: number, isFull: boolean) {
    return this.management.setFull(ownerId, id, version, isFull);
  }

  review(adminId: string, id: string, input: ReviewListingDto) {
    return this.management.review(adminId, id, input);
  }

  uploadPhoto(
    ownerId: string,
    id: string,
    version: number,
    file: Express.Multer.File,
  ) {
    return this.photos.uploadPhoto(ownerId, id, version, file);
  }

  removePhoto(ownerId: string, id: string, photoId: string, version: number) {
    return this.photos.removePhoto(ownerId, id, photoId, version);
  }

  save(userId: string, id: string) {
    return this.management.save(userId, id);
  }

  unsave(userId: string, id: string) {
    return this.management.unsave(userId, id);
  }
}
