import { BadRequestException, Injectable } from '@nestjs/common';
import { Amenity, ListingType } from '../../generated/prisma/enums.js';
import { LocationsService } from '../locations/locations.service.js';
import { AiProviderService, aiUnavailable } from './ai-provider.service.js';
import {
  nullableNumberSchema,
  objectSchema,
  outputAmount,
  outputList,
  outputObject,
  outputText,
  textSchema,
} from './ai-output.js';
import type { AiDescriptionDto, AiSearchDto } from './dto/ai.dto.js';

@Injectable()
export class AiListingsService {
  constructor(
    private readonly provider: AiProviderService,
    private readonly locations: LocationsService,
  ) {}

  async description(userId: string, dto: AiDescriptionDto) {
    const hasRoom =
      dto.type === 'ROOM_RENTAL' || (dto.type === 'ROOMMATE' && dto.hasRoom);
    if (!dto.title && !dto.rent && !dto.provinceCode && !dto.roommateNote)
      throw new BadRequestException({ code: 'AI_FACTS_REQUIRED' });
    if (dto.wardCode && !dto.provinceCode)
      throw new BadRequestException({ code: 'LOCATION_INVALID' });
    const location = dto.provinceCode
      ? this.locations.resolve([
          { provinceCode: dto.provinceCode, wardCode: dto.wardCode },
        ])[0]
      : null;
    // Chỉ gửi trường công khai, không gửi địa chỉ riêng, tọa độ hay dữ liệu tài khoản.
    const facts = {
      type: dto.type,
      hasRoom,
      title: dto.title,
      rent: dto.rent,
      costUnit:
        dto.type === 'ROOM_RENTAL' ? 'VNĐ/phòng/tháng' : 'VNĐ/người/tháng',
      location,
      amenities: dto.amenities,
      roommateNote: dto.roommateNote,
      smokingPreference: dto.smokingPreference,
      petPreference: dto.petPreference,
      quietLevel: dto.quietLevel,
      ...(hasRoom
        ? {
            area: dto.area,
            currentResidents:
              dto.type === 'ROOMMATE' ? dto.currentResidents : null,
            availableSlots: dto.availableSlots,
            deposit: dto.deposit,
            electricityCost: dto.electricityCost,
            waterCost: dto.waterCost,
            internetCost: dto.internetCost,
            otherCost: dto.otherCost,
            costNote: dto.costNote,
            availableFrom:
              dto.type === 'ROOM_RENTAL' ? dto.availableFrom : null,
          }
        : {
            desiredResidents:
              dto.type === 'ROOM_WANTED' ? dto.desiredResidents : null,
            desiredArea: dto.type === 'ROOM_WANTED' ? dto.area : null,
          }),
    };
    const raw = await this.provider.generate(
      userId,
      'listing_description',
      `Write a ${dto.tone === 'CONCISE' ? 'concise' : 'friendly'} listing description, at most 3000 characters. Never invent amenities, distances, availability, price, bill units, free services, safety claims or owner approval. Missing and zero costs do not mean free. For ROOM_WANTED or hasRoom=false, describe desired housing, never an existing room. Do not add exact addresses or contact details.`,
      facts,
      objectSchema({ description: textSchema }),
    );
    return { description: outputText(outputObject(raw).description, 3000) };
  }

  async search(userId: string, dto: AiSearchDto) {
    const provinces = this.locations.listProvinces();
    const raw = await this.provider.generate(
      userId,
      'listing_filters',
      'Extract ONLY supported explicit listing filters: type, province, monthly rent in VNĐ and amenities. Do not guess ambiguous price units or locations. ROOM_RENTAL rent is per room; other types per person. Leave ambiguous fields null and explain them in unsupported. Districts, wards, distance, smoking, pets, sleep, occupant counts and hasRoom are NOT supported filters; list each unmet condition in unsupported. Never silently convert them to keyword search. If unrelated, return null fields and unsupported explanation. Use province codes only from supplied directory.',
      { query: dto.query, provinces },
      objectSchema({
        type: {
          type: ['string', 'null'],
          enum: [...Object.values(ListingType), null],
        },
        provinceCode: {
          type: ['string', 'null'],
          enum: [...provinces.map((p) => p.code), null],
        },
        minRent: nullableNumberSchema,
        maxRent: nullableNumberSchema,
        amenities: {
          type: 'array',
          items: { type: 'string', enum: Object.values(Amenity) },
        },
        unsupported: { type: 'array', items: textSchema },
      }),
    );
    const result = outputObject(raw);
    const type = result.type === null ? null : outputText(result.type, 20);
    if (
      type !== null &&
      !Object.values(ListingType).includes(type as ListingType)
    )
      aiUnavailable();
    const provinceCode =
      result.provinceCode === null ? null : outputText(result.provinceCode, 2);
    const province = provinces.find((p) => p.code === provinceCode);
    if (provinceCode !== null && !province) aiUnavailable();
    const minRent = outputAmount(result.minRent, 100_000_000),
      maxRent = outputAmount(result.maxRent, 100_000_000);
    if (minRent !== null && maxRent !== null && minRent > maxRent)
      aiUnavailable();
    const amenities = outputList(result.amenities);
    if (
      new Set(amenities).size !== amenities.length ||
      amenities.some((a) => !Object.values(Amenity).includes(a as Amenity))
    )
      aiUnavailable();
    return {
      filters: { type, provinceCode, minRent, maxRent, amenities },
      provinceName: province?.name ?? null,
      unsupported: outputList(result.unsupported, 12),
    };
  }
}
