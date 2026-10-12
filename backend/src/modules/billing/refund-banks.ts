// VietQR transfer-supported banks, reviewed 2026-10-13.
// Source: https://api.vietqr.io/v2/banks. Keep the catalog local so refunds
// remain available when the public directory is offline.
export const refundBanks = [
  {
    bin: '970425',
    code: 'ABB',
    name: 'ABBANK',
    fullName: 'Ngân hàng TMCP An Bình',
  },
  {
    bin: '970416',
    code: 'ACB',
    name: 'ACB',
    fullName: 'Ngân hàng TMCP Á Châu',
  },
  {
    bin: '970405',
    code: 'VBA',
    name: 'Agribank',
    fullName: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam',
  },
  {
    bin: '970409',
    code: 'BAB',
    name: 'BacABank',
    fullName: 'Ngân hàng TMCP Bắc Á',
  },
  {
    bin: '970438',
    code: 'BVB',
    name: 'BaoVietBank',
    fullName: 'Ngân hàng TMCP Bảo Việt',
  },
  {
    bin: '970418',
    code: 'BIDV',
    name: 'BIDV',
    fullName: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam',
  },
  {
    bin: '546034',
    code: 'CAKE',
    name: 'CAKE',
    fullName: 'TMCP Việt Nam Thịnh Vượng - Ngân hàng số CAKE by VPBank',
  },
  {
    bin: '422589',
    code: 'CIMB',
    name: 'CIMB',
    fullName: 'Ngân hàng TNHH MTV CIMB Việt Nam',
  },
  {
    bin: '970446',
    code: 'COOPBANK',
    name: 'COOPBANK',
    fullName: 'Ngân hàng Hợp tác xã Việt Nam',
  },
  {
    bin: '970431',
    code: 'EIB',
    name: 'Eximbank',
    fullName: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam',
  },
  {
    bin: '970437',
    code: 'HDB',
    name: 'HDBank',
    fullName: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh',
  },
  {
    bin: '668888',
    code: 'KBank',
    name: 'KBank',
    fullName: 'Ngân hàng Đại chúng TNHH Kasikornbank',
  },
  {
    bin: '970452',
    code: 'KLB',
    name: 'KienLongBank',
    fullName: 'Ngân hàng TMCP Kiên Long',
  },
  {
    bin: '970449',
    code: 'LPB',
    name: 'LPBank',
    fullName: 'Ngân hàng TMCP Lộc Phát Việt Nam',
  },
  {
    bin: '970422',
    code: 'MB',
    name: 'MBBank',
    fullName: 'Ngân hàng TMCP Quân đội',
  },
  {
    bin: '970414',
    code: 'MBV',
    name: 'MBV',
    fullName: 'Ngân hàng TNHH MTV Việt Nam Hiện Đại',
  },
  {
    bin: '971025',
    code: 'momo',
    name: 'MoMo',
    fullName: 'CTCP Dịch Vụ Di Động Trực Tuyến',
  },
  {
    bin: '970426',
    code: 'MSB',
    name: 'MSB',
    fullName: 'Ngân hàng TMCP Hàng Hải Việt Nam',
  },
  {
    bin: '970428',
    code: 'NAB',
    name: 'NamABank',
    fullName: 'Ngân hàng TMCP Nam Á',
  },
  {
    bin: '970419',
    code: 'NCB',
    name: 'NCB',
    fullName: 'Ngân hàng TMCP Quốc Dân',
  },
  {
    bin: '970448',
    code: 'OCB',
    name: 'OCB',
    fullName: 'Ngân hàng TMCP Phương Đông',
  },
  {
    bin: '970430',
    code: 'PGB',
    name: 'PGBank',
    fullName: 'Ngân hàng TMCP Thịnh vượng và Phát triển',
  },
  {
    bin: '970412',
    code: 'PVCB',
    name: 'PVcomBank',
    fullName: 'Ngân hàng TMCP Đại Chúng Việt Nam',
  },
  {
    bin: '971133',
    code: 'PVDB',
    name: 'PVcomBank Pay',
    fullName: 'Ngân hàng TMCP Đại Chúng Việt Nam Ngân hàng số',
  },
  {
    bin: '970403',
    code: 'STB',
    name: 'Sacombank',
    fullName: 'Ngân hàng TMCP Sài Gòn Thương Tín',
  },
  {
    bin: '970400',
    code: 'SGICB',
    name: 'SaigonBank',
    fullName: 'Ngân hàng TMCP Sài Gòn Công Thương',
  },
  {
    bin: '970429',
    code: 'SCB',
    name: 'SCB',
    fullName: 'Ngân hàng TMCP Sài Gòn',
  },
  {
    bin: '970440',
    code: 'SEAB',
    name: 'SeABank',
    fullName: 'Ngân hàng TMCP Đông Nam Á',
  },
  {
    bin: '970443',
    code: 'SHB',
    name: 'SHB',
    fullName: 'Ngân hàng TMCP Sài Gòn - Hà Nội',
  },
  {
    bin: '970424',
    code: 'SHBVN',
    name: 'ShinhanBank',
    fullName: 'Ngân hàng TNHH MTV Shinhan Việt Nam',
  },
  {
    bin: '970407',
    code: 'TCB',
    name: 'Techcombank',
    fullName: 'Ngân hàng TMCP Kỹ thương Việt Nam',
  },
  {
    bin: '963388',
    code: 'TIMO',
    name: 'Timo',
    fullName: 'Ngân hàng số Timo by Ban Viet Bank (Timo by Ban Viet Bank)',
  },
  {
    bin: '970423',
    code: 'TPB',
    name: 'TPBank',
    fullName: 'Ngân hàng TMCP Tiên Phong',
  },
  {
    bin: '546035',
    code: 'Ubank',
    name: 'Ubank',
    fullName: 'TMCP Việt Nam Thịnh Vượng - Ngân hàng số Ubank by VPBank',
  },
  {
    bin: '970441',
    code: 'VIB',
    name: 'VIB',
    fullName: 'Ngân hàng TMCP Quốc tế Việt Nam',
  },
  {
    bin: '970427',
    code: 'VAB',
    name: 'VietABank',
    fullName: 'Ngân hàng TMCP Việt Á',
  },
  {
    bin: '970433',
    code: 'VIETBANK',
    name: 'VietBank',
    fullName: 'Ngân hàng TMCP Việt Nam Thương Tín',
  },
  {
    bin: '970454',
    code: 'VCCB',
    name: 'VietCapitalBank',
    fullName: 'Ngân hàng TMCP Bản Việt',
  },
  {
    bin: '970436',
    code: 'VCB',
    name: 'Vietcombank',
    fullName: 'Ngân hàng TMCP Ngoại Thương Việt Nam',
  },
  {
    bin: '970415',
    code: 'ICB',
    name: 'VietinBank',
    fullName: 'Ngân hàng TMCP Công thương Việt Nam',
  },
  {
    bin: '970432',
    code: 'VPB',
    name: 'VPBank',
    fullName: 'Ngân hàng TMCP Việt Nam Thịnh Vượng',
  },
  {
    bin: '970457',
    code: 'WVN',
    name: 'Woori',
    fullName: 'Ngân hàng TNHH MTV Woori Việt Nam',
  },
] as const;

export function findRefundBank(value: string | null) {
  const key = value?.trim().toUpperCase();
  return refundBanks.find((bank) => bank.bin === key || bank.code === key);
}

export function refundBankId(value: string | null) {
  return findRefundBank(value)?.bin ?? value;
}

export function normalizeAccountName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase();
}
