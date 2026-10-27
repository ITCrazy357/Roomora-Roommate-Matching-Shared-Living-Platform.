# Đo và tối ưu tiếp — 27/10/2026

## Phạm vi và giới hạn

Thử một giả thuyết: không preload đồng loạt bốn trọng lượng Be Vietnam Pro,
để font chưa cần vẽ không cạnh tranh với ảnh LCP. Font, glyph tiếng Việt, weight,
fallback và `display: swap` giữ nguyên. Không thêm cache dữ liệu công khai, đổi
quyền truy cập hay thay nội dung để cải thiện số đo.

Profile: Chromium/Pixel 7 giả lập, CPU slowdown 4, mạng 1,6 Mbps/150 ms; context
trình duyệt mới mỗi lượt. Một biến thể, hai vòng baseline/candidate, mỗi vòng
3 mẫu trang chủ. Chỉ duyệt các trang và dữ liệu công khai; không gọi AI trả phí,
đăng tin, nhắn tin hoặc ghi dữ liệu ứng dụng. Không bật dịch vụ trả phí mới.

Đây là phép đo lab, không phải p75 Core Web Vitals của người dùng thật. API công
khai không được snapshot nên TTFB vẫn biến động. Server baseline/candidate đều
chạy local, dùng cùng API public và cache biến đổi ảnh đã có; một lượt sandbox
bị chặn proxy/không có API đã bị loại, không tính vào so sánh.

## Bản public trước thay đổi này

| Trang | LCP trong 3 mẫu | CLS lớn nhất |
| --- | --- | --- |
| Trang chủ | 4.376–8.716 ms | 0 |
| Tìm phòng | 3.404–3.764 ms | 0,08575 |
| Chi tiết tin | 3.544–3.920 ms | 0 |

TTFB trang chủ có lượt 3.307 ms; hai lượt sau khoảng 332–338 ms. Không quy toàn
bộ độ chậm đó cho font, và không dùng số đo local để tuyên bố production đã nhanh
hơn. Cả 9 mẫu trả HTTP 200, không page error hoặc tràn ngang.

## So sánh trang chủ local

| Cấu hình | Số mẫu | LCP trung vị | Khoảng LCP | CLS lớn nhất |
| --- | --- | --- | --- | --- |
| Baseline: preload cả bốn weight | 6 | 3.600 ms | 3.352–3.688 ms | 0 |
| Candidate: `preload: false` | 6 | 2.752 ms | 2.520–3.124 ms | 0 |

Trung vị giảm khoảng 24% trong mẫu. Vòng đầu có LCP lớn nhất 3.660 → 2.928 ms;
vòng đối chứng sau 3.688 → 3.124 ms. Các khoảng mẫu không giao nhau, nhưng số mẫu
nhỏ chưa đủ để cam kết mức giảm này cho mọi thiết bị/kết nối.

Resource Timing cho thấy weight 500 ở baseline bắt đầu preload khoảng 843 ms;
trong lượt candidate đầu nó bắt đầu theo CSS khoảng 5.180 ms, sau LCP 2.928 ms.
Các file font vẫn được tải khi cần: thay đổi thứ tự ưu tiên, không phải cắt glyph
hay giảm tổng dung lượng font. Giữ candidate trong `frontend/src/app/layout.tsx`.
Rollback: bỏ `preload: false` rồi rebuild/deploy frontend.

Vòng candidate cuối đo thêm tìm phòng (LCP lớn nhất 2.576 ms, CLS 0,000088) và
chi tiết tin (2.924 ms, CLS 0,001335), 3 mẫu/trang. Không có baseline local cho
hai trang này nên không đưa ra phần trăm cải thiện của chúng.

## Kiểm tra đúng chức năng

- Frontend production build, lint và 19 unit tests: qua.
- Kiểm tra trình duyệt ở Pixel 7 và desktop 1440 px: font Be Vietnam Pro, ba nhóm
  tin, đổi theme, slideshow, mở/đóng trợ lý đều qua; không page error/tràn ngang.
- Tắt JavaScript: trang tìm phòng vẫn có 9 card SSR và card đầu nhìn thấy.
- Đây là smoke test bằng công cụ; chưa thay thế UAT có con người.

## Lặp lại phép đo

Build baseline với `preload: true` và candidate với `preload: false`; các biến
khác giữ nguyên. Lệnh dưới dùng PowerShell từ `frontend` với Node 22 trong PATH:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = '/api/v1'
$env:API_PROXY_TARGET = 'https://roomora-api-qxjb.onrender.com'
$env:API_SERVER_BASE_URL = 'https://roomora-api-qxjb.onrender.com/api/v1'
npm run build
npm run start -- --hostname 127.0.0.1 --port 3421
```

Ở terminal khác, cùng thư mục:

```powershell
$env:PERF_SITE_URL = 'http://127.0.0.1:3421'
$env:PERF_ROUTES = 'home'
$env:PERF_RUNS = '3'
$env:PERF_OUTPUT = '../.verification/home-new-sample.json'
node scripts/measure-public.mjs
```

`next start` là server lab theo script repo; triển khai Docker vẫn dùng standalone
theo Dockerfile. Đo sau deploy: đặt `PERF_SITE_URL` thành domain Vercel,
`PERF_ROUTES=home,listings,listing` và chọn file output mới. Script không ghi đè
artifact cũ; báo rõ profile, nguồn ảnh LCP và thời điểm bắt đầu tải tài nguyên.

Artifact phiên đo nằm trong `.verification/operations-c2-20261027/` (Git ignore):
`public-mobile-before.json`, `local-baseline-valid.json`, `baseline-holdout.json`,
`font-demand.json`, `font-demand-final.json` và screenshot/smoke test.

## Phần chưa đạt

Candidate chưa được deploy trong lúc đo. Trang chủ lab vẫn chưa đạt LCP 2,5 giây;
không tuyên bố đã đạt CWV/INP thực địa. Cần đo lại sau deploy và thu thập đủ dữ
liệu thực, cùng phản hồi UAT trên thiết bị của người dùng.
