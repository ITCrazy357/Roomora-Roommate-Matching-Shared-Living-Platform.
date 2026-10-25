import { Injectable } from '@nestjs/common';
import { LocationsService } from '../locations/locations.service.js';
import { ListingLookupService } from './listing-lookup.service.js';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

@Injectable()
export class LookupChatService {
  constructor(
    private readonly lookup: ListingLookupService,
    private readonly locations: LocationsService,
  ) {}

  async answer(userId: string, message: string) {
    await this.lookup.requireUser(userId);
    // Deliberately bounded grammar: never silently drop criteria or charge AI credits.
    const match =
      /^(?:tim )?(phong|o ghep) (?:tai|o) (.+?)(?: (duoi|toi da) (\d+(?:[.,]\d+)?) trieu)?[.!?]?$/.exec(
        normalize(message),
      );
    const province =
      match &&
      this.locations
        .listProvinces()
        .find(
          (item) =>
            normalize(item.name).replace(/^(thanh pho|tinh) /, '') ===
            match[2].replace(/^(thanh pho|tinh) /, ''),
        );
    const maxRent = match?.[4]
      ? Math.round(Number(match[4].replace(',', '.')) * 1_000_000)
      : undefined;
    if (
      !match ||
      !province ||
      (maxRent !== undefined && (maxRent <= 0 || maxRent > 100_000_000))
    ) {
      return {
        kind: 'lookup',
        answer:
          'Hãy nhập theo mẫu “Tìm phòng tại Hà Nội dưới 4 triệu” hoặc “Tìm ở ghép tại Đà Nẵng”. Với yêu cầu về phường, tiện ích hay tiêu chí khác, hãy dùng bộ lọc tìm phòng.',
        items: [],
        searchHref: '/tim-phong',
      };
    }
    const type =
      match[1] === 'phong' ? ('ROOM_RENTAL' as const) : ('ROOMMATE' as const);
    const result = await this.lookup.search(userId, {
      provinceCode: province.code,
      type,
      maxRent,
    });
    const filters = `${match[1] === 'phong' ? 'Phòng cho thuê' : 'Tìm người ở ghép'} · ${province.name}${maxRent === undefined ? '' : ` · Tối đa ${maxRent.toLocaleString('vi-VN')} đ/tháng`}`;
    const params = new URLSearchParams({ provinceCode: province.code, type });
    if (maxRent !== undefined) params.set('maxRent', String(maxRent));
    return {
      kind: 'lookup',
      answer: `${filters}. ${result.total ? `Có ${result.total} tin phù hợp; hiển thị ${result.items.length} tin.` : 'Chưa có tin phù hợp. Bạn có thể đổi bộ lọc.'}`,
      items: result.items,
      searchHref: `/tim-phong?${params}`,
    };
  }
}
