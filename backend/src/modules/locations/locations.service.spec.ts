import { LocationsService } from './locations.service.js';
import { provinces } from './vietnam.data.js';

describe('Vietnam two-tier location catalog', () => {
  const service = new LocationsService();
  it('contains all 34 provinces and 3321 unique commune-level units', () => {
    expect(service.listProvinces()).toHaveLength(34);
    const codes = provinces.flatMap((province) =>
      province.wards.map((ward) => ward.code),
    );
    expect(codes).toHaveLength(3321);
    expect(new Set(codes).size).toBe(3321);
    expect(
      service.listProvinces().find((province) => province.code === '24')?.name,
    ).toBe('Thành phố Bắc Ninh');
  });
  it('resolves official names and rejects a ward in a different province', () => {
    expect(
      service.resolve([{ provinceCode: '01', wardCode: '00004' }]),
    ).toEqual([
      {
        provinceCode: '01',
        wardCode: '00004',
        provinceName: 'Thành phố Hà Nội',
        wardName: 'Phường Ba Đình',
      },
    ]);
    expect(() =>
      service.resolve([{ provinceCode: '79', wardCode: '00004' }]),
    ).toThrow();
    expect(() => service.resolve([{ provinceCode: '00' }])).toThrow();
    expect(() => service.listWards('00')).toThrow();
  });
  it('supports province-wide choice and rejects duplicate selections', () => {
    expect(service.resolve([{ provinceCode: '01' }])[0].wardName).toBeNull();
    expect(() =>
      service.resolve([
        { provinceCode: '01' },
        { provinceCode: '01', wardCode: null },
      ]),
    ).toThrow();
  });
});
