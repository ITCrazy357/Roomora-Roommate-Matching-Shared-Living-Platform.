import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { provinces } from './vietnam.data.js';

export interface DesiredLocation {
  provinceCode: string;
  wardCode?: string | null;
}

@Injectable()
export class LocationsService {
  listProvinces() {
    return provinces.map(({ code, name }) => ({ code, name }));
  }

  listWards(code: string) {
    const province = provinces.find((item) => item.code === code);
    if (!province)
      throw new NotFoundException({
        code: 'PROVINCE_NOT_FOUND',
        message: 'Không tìm thấy tỉnh/thành phố',
      });
    return province.wards;
  }

  resolve(locations: DesiredLocation[]) {
    const seen = new Set<string>();
    return locations.map((location) => {
      const province = provinces.find(
        (item) => item.code === location.provinceCode,
      );
      const ward = location.wardCode
        ? province?.wards.find((item) => item.code === location.wardCode)
        : undefined;
      const key = `${location.provinceCode}:${location.wardCode ?? ''}`;
      if (!province || (location.wardCode && !ward) || seen.has(key)) {
        throw new BadRequestException({
          code: 'LOCATION_INVALID',
          message: 'Khu vực không hợp lệ hoặc bị trùng',
        });
      }
      seen.add(key);
      return {
        provinceCode: province.code,
        wardCode: ward?.code ?? null,
        provinceName: province.name,
        wardName: ward?.name ?? null,
      };
    });
  }
}
