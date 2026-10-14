# Phase 12 — chuẩn bị triển khai và kiểm chứng local

Trạng thái: đã làm và kiểm chứng phần đóng gói/vận hành local. **Chưa hoàn tất Phase 12**:
chưa chọn host/domain, chưa có staging/production public, cảnh báo ngoài hệ thống hoặc
phản hồi người dùng đầu tiên. Kiểm chứng diễn ra trong phiên 14–15/10/2026 (UTC+7).
Hướng dẫn thao tác: [operations.md](operations.md).

## Thay đổi và rà chất lượng code

- API/frontend/migrate có Dockerfile riêng theo target; Compose triển khai dùng HTTPS
  Caddy, health dependency, migration một lần và volume tách theo environment.
  Backend chạy user `node`; runtime bỏ dev declarations/peer tooling, còn 182 packages
  cài thực tế. Schema/Prisma CLI ở target migrate.
- CI chạy build/lint/unit/HTTP tests trên DB mới, audit production, build Docker images.
  Workflow GHCR chỉ lấy SHA của push `main` có CI thành công. Chưa chạy workflow trên GitHub.
- Middleware HTTP và exception filter nhỏ, tách khỏi nghiệp vụ; JSON log production có
  requestId/route/status/duration, không ghi body/cookie/query string/SQL parameters.
  Lỗi stream sau khi đã gửi header vẫn đóng response; SSE dài bình thường không bị cảnh báo chậm.
- Pool/query threshold/trust proxy được validate chung. Proxy chỉ tin một hop, API không
  mở port public. Test mode nhận env tường minh và không đọc `.env` có provider keys.
- Sửa lockfile thiếu optional TypeScript peer của vite-tsconfig-paths trên npm 10;
  không đổi TypeScript 6 của backend. Font Be Vietnam Pro 400/500/600/700 đóng gói local,
  kèm OFL, để build không phụ thuộc kết nối Google Fonts.
- Sharp 0.35.5, Next.js/eslint-config-next 16.3.8 và source-map-js 1.2.2 có trong lockfile.
  Audit production frontend và API runtime cuối phiên đều 0 advisory tại thời điểm kiểm tra.
  Đây là kết quả audit dependency theo scope, không phải chứng nhận không có lỗi bảo mật.
- Kiểm tra đường nóng dùng lại transaction/locks/idempotency đã có trong chat, quyết toán,
  billing; tăng thử đồng thời ở chat lên 20 retries và quyết toán lên 12 calls.
  Email đã có queue PostgreSQL/lease/retry. Không tạo lớp cache hoặc queue thứ hai khi số đo
  hiện tại chưa chỉ ra nhu cầu. Không có migration/index mới trong Phase 12.

Các advisory còn ở dependency tooling của Prisma CLI (deepmerge-ts/mysql2/source-map-js)
được tách khỏi API runtime. Image migrate vẫn cần rà lại trước triển khai; CLI chỉ đọc
config/schema do người vận hành quản lý. Không dùng `audit fix --force` để hạ Prisma xuống
major 6 mà chưa đánh giá tương thích. [Sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w),
[Next.js patch](https://github.com/vercel/next.js/releases/tag/v16.3.8).

## Kiểm chứng chức năng

- 42 migrations áp dụng thành công từ DB trống; không dùng DB ứng dụng hiện tại.
- 157 unit tests trong 20 bộ qua sau bản vá Sharp.
- 421 HTTP/PostgreSQL tests trong 26 bộ qua. Lần đầu có 2 timeout ở message-changes khi
  build cùng lúc; bộ đó chạy riêng qua cả 5 test, rồi toàn bộ chạy lại không còn build nặng
  qua 421/421. Không nới timeout để che lỗi.
- Sau cập nhật Sharp, chạy lại 119 HTTP/PostgreSQL tests trong 7 bộ liên quan ảnh/chứng từ/
  chat/chi phí/AI/hoàn tiền, tất cả qua. Sau chỉnh log SSE, 4 health/observability tests qua.
- Backend lint 0 error, còn 5 warning sort comparator ở test cũ; phần thêm mới không warning.
  Frontend lint và 8 API tests qua. Build cả ba image qua; frontend cuối dùng Next 16.3.8.
- Stack `compose.deploy.yml` boot local với override riêng: PostgreSQL → migrate → API →
  proxy; API/frontend/PostgreSQL healthy, migrate exit 0. HTTPS dùng CA riêng của Caddy
  test, không cài CA vào trust store máy người dùng.
- 12 smoke checks qua HTTPS: frontend, 4 font assets, liveness/readiness/no-store,
  auth 401/200 với session DB thật, notifications, Origin sai 403, SSE sync (30 ms ở lần cuối).
- Tạm pause riêng DB test: liveness giữ 200, readiness trả 503; unpause phục hồi 200.
  Không tạm dừng PostgreSQL đang dùng cho ứng dụng.

## Đo tải đọc

Intel i7-1165G7, Windows 16 GiB RAM, 8 logical processors. Docker VM 8 vCPU,
8153325568 bytes RAM (~7.59 GiB). API Node 22.23.3, generator Node 22.23.2,
PostgreSQL 17, một API instance, pool 10. Qua HTTPS Caddy local, đã warmup,
đo cả body response. Dataset: 200 users/profiles, 10000 listings công khai,
500 notifications và session thật; một tài khoản được dùng cho các request có xác thực.

Bốn endpoint chia đều: `/health/ready`, `/listings?limit=12`, `/auth/me`,
`/notifications?limit=12`. Các giá trị p95 bên dưới tính bằng ms.

| Request đồng thời | Requests | Thời gian | Req/s toàn hỗn hợp | Ready p95 | Listings p95 | Me p95 | Notifications p95 | Lỗi |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 400 | 7.684 s | 52.1 | 20 | 41 | 27 | 24 | 0 |
| 10 | 400 | 1.790 s | 223.5 | 37 | 139 | 54 | 58 | 0 |
| 25 | 400 | 1.683 s | 237.6 | 108 | 224 | 137 | 124 | 0 |
| 25 | 5000 | 16.327 s | 306.2 | 43 | 195 | 116 | 93 | 0 |

Tổng 6200 request đo, ngoài warmup; tất cả HTTP 200, không có network error.
Ở mẫu 5000 requests, listings p99 252 ms, me p99 175 ms, notifications p99 156 ms.
Đây là các cửa sổ đo ngắn với dữ liệu tổng hợp và kết nối local đã ấm. **Không quy đổi
306.2 req/s thành số người dùng online hoặc sức tải production**, chưa có soak test,
traffic internet, nhiều tài khoản, dataset phân bố gần thực tế hoặc tải upload/PDF/AI/gateway thật.

## Đồng thời và truy vấn

Qua API production trong stack HTTPS local: tạo/chấp nhận kết nối giữa hai user fixture,
gửi 20 tin khác nhau đồng thời. Persist đúng 20 tin, số thứ tự 1–20, batch 463 ms,
p95 445 ms, max 458 ms. Gửi lại một tin 10 lần đồng thời vẫn 20 tin, không tạo bản ghi trùng.
Đây là một batch trong một hội thoại, không phải đo công suất hệ thống chat.

HTTP/PostgreSQL suite còn kiểm tra 12 lần quyết toán cùng lúc (một lần chốt, các lần khác
trả settled=0), 20 gửi trùng chat, 8 callback MoMo trùng và các race PayOS webhook/query.
Cổng thanh toán được mô phỏng và ký dữ liệu test; không phát sinh giao dịch thật.

EXPLAIN ANALYZE/BUFFERS trên dataset nói trên:

- Trang listings thường dùng `listings_status_published_at_id_idx` và `users_pkey`,
  execution 0.117 ms; count toàn bộ 10000 tin dùng seq scan/hash join, 5.237 ms.
  Seq scan ở đây hợp lý vì mọi tin fixture khớp điều kiện.
- Poll queue email dùng index hiện có, execution 0.032 ms, không có mail pending trong fixture.
  Kết quả này không chứng minh tốc độ gửi SMTP hoặc khả năng drain queue lớn.
- Một truy vấn PostgreSQL cố ý trễ được kiểm tra: log có fingerprint/duration, không lộ parameter.

Chưa có bằng chứng cần thêm index/cache từ những plan này. Cần đo lại bộ lọc và dữ liệu
gần thực tế trên staging; PDF/ảnh/OCR vẫn xử lý trong request.

## Backup và khôi phục

`database-backup.ps1` và `database-restore-check.ps1` đã chạy thật cả nhánh Docker container
và Compose. Archive custom ~764538 bytes, có sidecar SHA256. Khôi phục vào DB UUID mới,
đọc các bảng, đối chiếu 10000 listings/200 users/200 profiles/500 notifications/1 session/
42 migration records; DB thử đã được drop bởi script. Nhánh Compose mất ~2.34 s trong lần đo.
Checksum sai bị từ chối trước truy cập Docker/DB. Không restore đè DB ứng dụng.
Thời gian local này không phải RTO cam kết; chưa thử backup ngoài host, Cloudinary hoặc
rollback trên server production.

## Phần còn lại để hoàn tất Phase 12

Chọn host/domain; tạo staging và production/secrets riêng; chạy GitHub CI/GHCR thực;
nghiệm thu HTTPS/webhook/SMTP và browser flow trên host đó; gắn monitor/cảnh báo và
scheduler backup ngoài host; thử restore/rollback trên môi trường đó; chạy tải đủ dài với
dataset gần thực tế; mời nhóm người dùng đầu tiên và ghi nhận phản hồi.

Evidence local nằm trong `.verification/phase12-*`: E2E/unit/regression logs, Docker logs,
audit JSON, smoke/readiness, query plans, load JSON, chat batch, backup/restore logs.
Fixture/credentials test và archive không commit; services test được dừng sau kiểm chứng.
