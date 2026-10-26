# Bằng chứng đợt hoàn thiện vận hành — 26/10/2026

## Local

Node 22.23.2, PostgreSQL 17 và Redis 7.4 trong container tách biệt. Không dùng DB
ứng dụng hoặc tài khoản người dùng thật để tạo khoản chi/kết nối/tin nhắn.

| Kiểm tra | Kết quả |
| --- | --- |
| Backend unit sau patch Prisma | 235/235, không skip. |
| Backend HTTP/PostgreSQL sau patch Prisma | 489/489, 32 files, không skip. |
| Hành trình UI desktop/mobile | 8/8: tìm phòng/giá/cọc; SSR không JavaScript; kết nối/chấp nhận/chat có persist; thanh toán một phần trong nhà. |
| Web Vitals qua trình duyệt và API thật local | 2/2: payload coarse labels, không URL/query, tôn trọng Do Not Track. |
| Frontend unit | 19/19. |
| Scripts crypto/monitor/report | 6/6. |
| Schema release | DB đủ 53 migration/index/CHECK → true; đổi tên index trong DB giả → false; hoàn nguyên → true. |
| Backup drill | pg_dump thật của DB giả → AES-GCM → giải mã → pg_restore vào container không mạng → schema/index hợp lệ; container/plaintext tạm được dọn. |
| Build/lint/TypeScript | Backend và frontend qua; 4 workflow YAML được parse. |
| Dependency audit | Production backend và frontend: 0 advisory theo npm audit lúc kiểm tra. Prisma/client/adapter lên patch 7.10.1; Zod frontend lên 4.6.6. |

Backend full dependency audit còn 9 advisory ở dev tooling (3 high, 4 moderate,
2 low), chủ yếu chuỗi Nest Mau và Vitest/Vite. Không dùng `audit fix --force`
để downgrade/đổi major ngoài phạm vi. Con số 0 phía trên chỉ nói tập dependency
production, không phải tuyên bố mọi công cụ phát triển đều hết advisory.

Bổ sung lúc cấu hình backup: người dùng xác nhận PostgreSQL 18; đã đổi mặc định
client/restore sang 18 và thêm hai test policy có Docker giả lập. Tổng scripts
8/8 qua: backup trước migration vẫn hợp lệ khi `schemaReady=false`, nhưng archive
không có bảng lõi Roomora bị từ chối. Đây là kiểm thử policy, không phải bằng chứng
đã kết nối DB Render hoặc khôi phục DB production.

## Đo public trước khi deploy đợt này

Pixel 7 giả lập, CPU slowdown 4, mạng 1,6 Mbps/150 ms, 3 lượt mỗi trang:

| Trang | LCP trong mẫu | CLS lớn nhất trong mẫu |
| --- | --- | --- |
| Trang chủ | 4,02–9,116 giây | 0 |
| Tìm phòng | 5,228–5,640 giây | 0,08575 |
| Chi tiết tin | 4,520–4,716 giây | 0,00134 |

LCP chưa đạt 2,5 giây. Đây là lab sample, không phải p75 người dùng thực địa.
API qua proxy Vercel: 12 GET tuần tự, 6 mỗi endpoint, không lỗi; listings p95
615 ms và people p95 326 ms. Mẫu nhỏ không chứng minh năng lực chịu tải.

## So sánh có kiểm soát trên local

Baseline lấy source frontend từ commit `7d6fd49`, candidate là source đợt này;
cùng runtime dependencies, máy, cấu hình 4G/CPU và nguồn public API qua proxy
chỉ đọc. Cache biến đổi ảnh đã warm ở cả hai server, context trình duyệt mới mỗi
lượt. API public không được snapshot; TTFB vẫn biến động. 3 mẫu/trang nên p75
trong bảng là mẫu lớn nhất, chưa đủ kết luận thống kê hay tác động production.

| Trang | LCP p75 lab baseline | LCP p75 lab candidate |
| --- | --- | --- |
| Trang chủ | 5.040 ms | 4.844 ms |
| Tìm phòng | 4.968 ms | 3.568 ms |
| Chi tiết tin | 4.160 ms | 3.232 ms |

Thay đổi tập trung vào nguyên nhân quan sát được: font WOFF2 giữ nguyên cmap/
metrics, trì hoãn slide phụ, tối ưu ảnh local public và SSR kết quả tìm kiếm.
Trang chủ chưa cho thấy cải thiện đủ lớn để tách khỏi nhiễu TTFB. Các số này không
chứng minh đã đạt Core Web Vitals; cần đo lại sau deploy và thu thập field data.
Không đổi sang full-text/cursor: query trigram đã được đo ở đợt trước; điểm chậm
hiện quan sát được nằm ở tài nguyên và trình tự tải frontend. Giữ tương thích tìm
kiếm và phân trang hiện có, tránh thay ngữ nghĩa chỉ để xóa một mục trong checklist.

Artifact Git ignore ở `.verification/operations-b1/`:

- `public-mobile-before.json`, `public-mobile-diagnostic.json`: đo bản public.
- `public-api.json`: độ trễ GET từ máy đo.
- `local-baseline-valid.json`, `local-candidate.json`: so sánh local hợp lệ.
- `restore-drill.json`: nguồn dữ liệu giả, không phải backup production.

Mẫu baseline ban đầu có proxy bị sandbox chặn đã bị loại, không dùng trong bảng.
Lưu ý raw font TTF vốn được nén khi truyền HTTP: giảm file từ 545.964 xuống
160.012 byte không đồng nghĩa giảm cùng tỷ lệ băng thông hoặc LCP.

## Chưa có bằng chứng

- Backup/restore DB production, artifact backup production và email báo lỗi thực nhận.
- Migration/schema mới được xác nhận trên Render bằng readiness mới.
- Deploy/remote CI của đợt chưa push này. CI commit trước `7d6fd49` đã thành công:
  [GitHub run](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40345169450).
- P75 Core Web Vitals từ người dùng thật hoặc kết quả UAT có con người.

Xem [các bước kích hoạt](operations-activation.md) và
[kịch bản UAT](user-acceptance-check.md). Lịch backup/monitor chỉ bật sau khi cấu
hình secrets/variables; kiểm thử Playwright không được thay tên thành UAT thực tế.
