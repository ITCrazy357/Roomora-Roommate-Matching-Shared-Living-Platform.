# LCP: chọn ảnh theo chiều rộng hiển thị — 28/10/2026

## Thay đổi và phạm vi

Baseline là frontend tại commit `60cdf80`. Chỉ sửa `sizes` của ảnh hero, ảnh thẻ
tin và ảnh đầu trong gallery. Trên điện thoại, `.container` có lề 16 px mỗi bên,
nhưng ảnh khai báo `100vw`. Pixel 7 giả lập rộng 412 CSS px, DPR 2,625, vì vậy
trình duyệt chọn nguồn 1.200 px dù ảnh thực rộng khoảng 378–380 CSS px.

Candidate khai báo `calc(100vw - 32px)` ở nhánh mobile tương ứng. Hero dùng mốc
767 px theo breakpoint chuyển sang một cột trong CSS. Giữ nhánh desktop hiện có,
quality 75, ảnh gốc, crop, preload ảnh đầu, lazy loading slide phụ và đường truy
cập ảnh riêng tư. Không thêm format, dependency, cache dữ liệu hay thay quyền.

Giới hạn lượt này là hai giả thuyết; dừng sau một giả thuyết đã có cải thiện lặp
lại. Không thử hạ quality vì candidate hiện tại đã giảm payload với bố cục cũ.

## Phương pháp

Chromium/Pixel 7, CPU slowdown 4, latency 150 ms, downlink 1,6 Mbps. Context mới
mỗi mẫu, cùng server local `127.0.0.1:3421`, API public hiện tại, cùng máy và font.
Chạy A → B → A2 → B2; mỗi vòng 3 mẫu/trang, tổng 36 mẫu hợp lệ, tức 6 mẫu/trang/
cấu hình. B2 là build cuối. Vòng A/B đầu dùng image cache local đã tồn tại; có
warm nguồn 1.080 px trước B. Trước A2/B2 warm rõ cả nguồn 1.080/1.200 px ở q75,
nên bảng không đại diện cold image-optimizer cache. Không chạy QA/lint đồng thời
với các vòng đo. API không snapshot, TTFB vẫn biến động.

## Kết quả local

| Trang | Trung vị A/A2 | Trung vị B/B2 | Giảm trong mẫu | Khoảng candidate |
| --- | ---: | ---: | ---: | ---: |
| Trang chủ | 2.592 ms | 2.122 ms | 18,1% | 1.972–2.432 ms |
| Tìm phòng | 2.178 ms | 1.762 ms | 19,1% | 1.540–1.876 ms |
| Chi tiết tin | 2.284 ms | 1.896 ms | 17,0% | 1.812–2.044 ms |

Trung vị từng vòng xác nhận hướng giảm: home 2.488 → 2.088 rồi 2.696 → 2.156 ms;
listings 2.340 → 1.792 rồi 2.136 → 1.712 ms; listing 2.236 → 1.900 rồi
2.484 → 1.892 ms. Không dùng các mẫu lab này để công bố field p75.

Ảnh LCP trong dataset cả ba trang là `/images/home-balcony.webp`. Browser chọn
1.200 → 1.080 px ở Pixel 7, q75 không đổi. Resource Timing: 93.316 → 64.136 byte
transfer, giảm khoảng 31%. GET riêng image optimizer đo body 93.016 → 63.836 byte;
hai con số body/transfer khác nhau do phần overhead. Không tuyên bố mọi ảnh hoặc
mọi thiết bị đều giảm 31%: lựa chọn nguồn phụ thuộc viewport, DPR và ảnh thực tế.

TTFB trung vị home 875 → 793 ms, listings 502 → 507 ms, listing 496 → 488 ms.
Để kiểm tra nhiễu server, trung vị `LCP - TTFB` tương ứng 1.725 → 1.347,
1.687 → 1.241 và 1.758 → 1.365 ms. Đây chỉ là chẩn đoán thời gian sau byte đầu,
không phải chỉ số Core Web Vitals riêng. Không quy toàn bộ delta LCP cho transfer.

36/36 mẫu HTTP 200, API dùng được, không page error/tràn ngang. Candidate có CLS
lớn nhất home 0; listings 0,000088; listing 0,001335.

## Public baseline và giới hạn

Bản public trước sửa, 3 mẫu/trang: home LCP 2.808–7.064 ms; listings
2.892–3.744 ms; listing 2.764–3.000 ms. Lượt home đầu có TTFB 3.258 ms, các lượt
home sau khoảng 342–348 ms. Tối ưu ảnh không xử lý phần trễ phản hồi đó.

Chưa deploy candidate trong phiên đo. Các con số local dưới 2,5 giây không chứng
minh production đạt mục tiêu, cũng không phải p75 của người dùng thật. Cần đo lại
sau deploy cùng profile và tiếp tục thu thập field data. Không so trực tiếp phần
trăm local với baseline public, hoặc với các phiên đo ngày trước.

## Kiểm tra đúng chức năng

- Bốn production builds qua; frontend 19 tests, lint toàn frontend qua. Build
  cuối đã chạy TypeScript thành công.
- QA candidate 18 tổ hợp: ba trang ở viewport 375, 412, 700, 767, 768, 1.440 px;
  ảnh tải được, không page error hoặc tràn ngang. Pixel 7 chọn đúng 1.080 px/q75.
- Ở mobile/desktop, chuyển slide, tạm dừng, đổi theme, mở/đóng trợ lý qua; không
  gửi câu hỏi tới AI. Tắt JavaScript vẫn thấy 9 card SSR trang tìm phòng.
- Đã xem screenshot hero baseline/candidate ở mobile: bố cục, crop và chữ giữ
  nguyên; ảnh candidate vẫn có chi tiết sử dụng được ở kích thước hiển thị. Đây
  là quan sát bằng công cụ, không thay thế UAT có con người.

## Lặp lại và rollback

Từ `frontend`, với Node 22 trong PATH, build từng cấu hình riêng và dừng server
trước khi đổi build. Các biến giống nhau cho cả baseline/candidate:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL='/api/v1'
$env:API_PROXY_TARGET='https://roomora-api-qxjb.onrender.com'
$env:API_SERVER_BASE_URL='https://roomora-api-qxjb.onrender.com/api/v1'
npm run build
npm run start -- --hostname 127.0.0.1 --port 3421
```

Terminal khác, từ `frontend`, chọn output mới vì script không ghi đè file:

```powershell
$env:PERF_SITE_URL='http://127.0.0.1:3421'
$env:PERF_ROUTES='home,listings,listing'
$env:PERF_OUTPUT='../.verification/lcp-replay-new.json'
node scripts/measure-public.mjs
```

`next start` ở đây là server lab; Docker deployment vẫn theo standalone. Sau
deploy, đặt `PERF_SITE_URL=https://roomora-blond.vercel.app` và output khác.

Rollback chỉ hoàn nguyên ba `sizes` về mốc `60cdf80` rồi rebuild/deploy frontend;
không hoàn nguyên các bản vá limiter/auth khác.

Artifacts Git ignore: `.verification/lcp-20261028-public-before.json`,
`lcp-20261028-baseline-a.json`, `lcp-20261028-sizes-b.json`,
`lcp-20261028-baseline-a2.json`, `lcp-20261028-sizes-b2.json`,
`lcp-20261028-{baseline,candidate}-qa.json` và screenshot cùng prefix.
