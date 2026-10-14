# Vận hành Roomora — Phase 12

Chưa chọn nhà cung cấp hoặc domain. Bộ đóng gói này phục vụ một máy Docker,
một API instance theo mặc định. Redis chia sẻ rate limit và cache bản đồ giữa các
API instance; việc tăng replica vẫn cần kiểm tra tổng pool và tải thực tế.
Chưa có staging/production công khai hoặc phản hồi người dùng.
Không suy ra sức tải production từ số liệu local trong `phase-12-status.md`.

## Kiểm tra trước khi đưa lên server

`Roomora CI` chạy validate/generate/build Prisma, migrations trên PostgreSQL mới,
lint/unit/HTTP tests, lint/API tests/build frontend và build cả ba Docker image.
Redis test chạy trong service riêng; kiểm tra bộ đếm nguyên tử, TTL, cache và
hai API dùng chung giới hạn qua HTTP. Xem [Redis](redis.md).
CI chặn advisory mức high/critical ở dependencies production frontend và API runtime.
Suite HTTP chạy lần lượt vì một số kiểm tra dashboard/queue dùng số liệu toàn database.
`NODE_ENV=test` bỏ qua backend `.env`; truyền `DATABASE_URL`, `FRONTEND_ORIGIN`,
`AUTH_DEV_EXPOSE_LINKS=true`, `AUTH_OTP_SECRET` dành riêng cho test qua môi trường.
Không dùng database chứa dữ liệu ứng dụng để chạy bộ kiểm thử.

Sau CI thành công cho push lên `main`, `Roomora images` checkout đúng commit đã
kiểm thử và xuất API/migrate/frontend lên GHCR với tag SHA. Không đẩy tag `latest`.
Workflow mới chỉ được kiểm chứng trong checkout local; cần push để nghiệm thu trên GitHub.
Triển khai lên server chưa tự động hóa vì chưa có đích triển khai.

Font frontend được đóng gói local, giữ Be Vietnam Pro 400/500/600/700, giấy phép OFL.
Các `.dockerignore` loại `.env`, node_modules và output local khỏi build context.
API runtime chạy user `node`, chỉ có production dependencies và `dist`, bao gồm font PDF.
Runtime bỏ khai báo dev dependencies trước `npm ci --omit=dev --omit=peer`, để Prisma CLI
không bị giữ lại qua optional peer của client. Sharp được vá lên 0.35.5; Next.js/
eslint-config-next dùng patch 16.3.8, source-map-js dùng bản vá tương thích đã khóa.
Image migrate riêng có Prisma CLI/schema/migrations; không chạy migration trong mỗi API replica.

## Staging và production

1. Chuẩn bị hai host riêng, DNS trỏ đúng host, mở 80/443; PostgreSQL và API không có port public.
2. Sao chép `deploy/environment.example` thành `deploy/roomora.env` trên mỗi host,
   đặt `DEPLOY_ENV=staging` hoặc `production`, domain, mật khẩu DB và OTP secret riêng.
   Giới hạn quyền đọc file cho tài khoản vận hành. `DATABASE_URL` dùng `postgres:5432`;
   percent-encode mật khẩu. Không đưa file cấu hình thật vào Git.
   Đặt `REDIS_URL=redis://redis:6379/0`; Redis chỉ ở mạng riêng của Compose,
   không publish cổng trên server. Dùng Redis riêng cho từng môi trường.
3. Đặt `IMAGE_PREFIX=ghcr.io/<owner>/<repo>` (chữ thường) và `RELEASE=<commit SHA>`
   của CI đã qua. Đăng nhập GHCR trên server nếu package riêng tư.
4. Cấu hình SMTP thật trước khi mời người dùng: đăng ký/quên mật khẩu cần OTP email.
   Cấu hình Cloudinary, Geoapify, Google và AI nếu sử dụng. Staging dùng credentials
   riêng. PayOS là giao dịch thật, không phải sandbox; không đưa keys production vào test.
5. Chạy các lệnh từ thư mục gốc, dùng PowerShell 7 hoặc Windows PowerShell:

```powershell
docker compose --env-file deploy/roomora.env -f compose.deploy.yml config --quiet
docker compose --env-file deploy/roomora.env -f compose.deploy.yml pull
# Trước mỗi release có schema mới, backup theo phần bên dưới.
docker compose --env-file deploy/roomora.env -f compose.deploy.yml up -d --no-build --wait
docker compose --env-file deploy/roomora.env -f compose.deploy.yml ps
Invoke-RestMethod https://<domain>/api/v1/health/ready
```

Caddy cung cấp HTTPS, chuyển nguyên `/api/*` sang API và flush SSE ngay.
Frontend dùng `/api/v1` cùng origin, không nhúng domain vào bundle. Cookie production
giữ `Secure`/`HttpOnly`/`SameSite=Lax`; OriginGuard và chữ ký webhook vẫn kiểm tra như trước.
Compose đặt `TRUST_PROXY_HOPS=1`: chỉ an toàn khi API chỉ nhận kết nối qua proxy riêng.
Không mở thêm port API hoặc đặt một CDN/proxy nữa mà chưa rà lại chuỗi IP tin cậy.
`compose.yml` local và `compose.deploy.yml` dùng tên project/volume khác nhau;
staging/production dùng host và secrets riêng. Không chạy `down -v` trên môi trường có dữ liệu.

Để build local thay cho GHCR: giữ `IMAGE_PREFIX=roomora`, `RELEASE=local`, chạy
`docker compose --env-file deploy/roomora.env -f compose.deploy.yml build` trước khi up.
Migrate cần PostgreSQL healthy; API cần migrate thành công và Redis healthy;
proxy cần API/frontend healthy.
Healthcheck báo lỗi nhưng Docker không tự restart container chỉ vì trạng thái unhealthy.

## Log, health và cảnh báo

`/api/v1/health` là liveness, không phụ thuộc DB/Redis. `/api/v1/health/ready` chạy
SELECT 1 và PING Redis song song, trả 503 nếu DB hoặc Redis đã cấu hình bị lỗi.
Dùng timeout 6 giây cho monitor ngoài để bao phủ query timeout 5 giây.
Docker health dùng timeout 4 giây để phát hiện DB suy giảm sớm.

API production ghi JSON stdout. HTTP log gồm requestId, method, route template,
status, durationMs, aborted. Header `X-Request-ID` giúp đối chiếu lỗi người dùng.
SSE đóng kết nối bình thường không bị xem là request chậm chỉ vì sống hơn một giây.
Không ghi body, URL query, cookie, SQL hoặc tham số SQL. Lỗi 5xx ghi loại lỗi/mã truy vết;
lỗi bất ngờ trả thông báo chung. Health thành công không tạo access log.
Truy vấn từ `DATABASE_SLOW_QUERY_MS` (mặc định 500 ms) ghi duration và fingerprint SQL;
đối chiếu fingerprint bằng tracing trong môi trường test, không bật query parameter log production.
Pool mặc định 10 kết nối/API, cộng một kết nối LISTEN. Khi tăng instance, tính tổng pool,
worker/migration/backup so với `max_connections`; không tăng pool để che truy vấn chậm.

```powershell
docker compose --env-file deploy/roomora.env -f compose.deploy.yml logs --tail 100 api
```

Khi có host, gắn uptime monitor bên ngoài và đích cảnh báo cho người vận hành.
Ngưỡng khởi đầu cần hiệu chỉnh sau tải staging: readiness thất bại 3 lần liên tiếp
ở chu kỳ 30 giây; HTTP 5xx >1%/5 phút; p95 >1 giây/5 phút; dung lượng đĩa >80%;
backup quá 24 giờ; notification email tồn >15 phút hoặc `email_attempts >= 5`.
Chưa có dịch vụ nhận cảnh báo hoặc kiểm thử gửi cảnh báo thật.

Email thông báo đã có queue PostgreSQL, lease/retry và `FOR UPDATE SKIP LOCKED`.
Redis hiện chỉ phục vụ rate limit và cache tile. SMTP có thể gửi trùng nếu worker chết sau gửi
nhưng trước ghi `emailSentAt`; queue không bảo đảm exactly-once ở nhà cung cấp mail.
OCR/PDF/ảnh vẫn xử lý trong request; cần đo với ảnh/PDF thực tế trước khi quyết định queue.
Các rate limit từng nằm trong RAM (auth/OTP/Google, chatbot, avatar, hoàn tiền)
đã dùng Redis. Giới hạn nghiệp vụ dựa trên lịch sử gửi/khoản chi/AI vẫn kiểm tra
trong PostgreSQL. Redis mất kết nối: thao tác có rate limit trả 503; cache bỏ qua,
readiness trả 503. Chi tiết dung lượng, TTL và phục hồi: [Redis](redis.md).

## Đo tải và truy vấn

`scripts/load-test.mjs` chỉ gửi GET, dùng concurrency hữu hạn (1–100), tối đa 10000 requests,
timeout 10 giây, warmup trước đo. Báo cáo tính cả thời gian đọc body, p50/p95/p99/max,
throughput và mọi HTTP/network error. Không dùng `/health` để tuyên bố sức tải nghiệp vụ.

```powershell
$env:LOAD_BASE_URL = 'http://127.0.0.1:5000/api/v1'
$env:LOAD_PATHS = '/listings?limit=12'
$env:LOAD_CONCURRENCY = '10'
$env:LOAD_REQUESTS = '200'
$env:LOAD_REPORT = '.verification/load-10.json'
node scripts/load-test.mjs
```

Để đo endpoint có xác thực, đặt `LOAD_COOKIE` bằng phiên test riêng; không đưa cookie vào
command arguments/log. Host khác loopback yêu cầu `LOAD_ALLOW_REMOTE=true` và quyền đo tải.
Seed bằng `node backend/scripts/phase12-fixture.mjs` sau build/migrations trên database
`roomora_phase12` local còn trống. Script từ chối DB khác, tạo 200 users/10000 listings/
500 notifications và một session DB; không gửi email, gọi AI hoặc cổng thanh toán.
Thông tin cookie ghi vào `.verification/phase12-fixture.json` bị Git ignore.
`scripts/phase12-query-plans.sql` đo các SELECT bằng EXPLAIN ANALYZE/BUFFERS.
Chỉ thêm index/cache sau khi đối chiếu plan, latency và quy tắc dữ liệu riêng tư.

## Backup, khôi phục và rollback

```powershell
$taskBackup = ./scripts/database-backup.ps1
./scripts/database-restore-check.ps1 -BackupFile $taskBackup
```

Backup dùng `pg_dump --format=custom --no-owner --no-acl`, tạo sidecar SHA256.
Restore-check xác minh checksum, tạo DB ngẫu nhiên `roomora_restore_<uuid>`, chạy
`pg_restore --exit-on-error --single-transaction`, đọc count mọi bảng và drop đúng DB
do lần gọi đó tạo ra. Không nhận tên database đích và không đụng DB ứng dụng.
Đối chiếu các count và kiểm tra nghiệp vụ trên DB phục hồi trong maintenance drill.
Giữ bản mã hóa ngoài host, chạy hằng ngày và trước migration; đề xuất giữ 7 bản/ngày,
4 bản/tuần. Dump DB không backup ảnh public trên Cloudinary: cần chính sách lưu riêng.
RPO/RTO cần đo sau khi có host/dataset thật; thử khôi phục local chưa đủ để cam kết.

Giữ SHA release trước. Khi lỗi và schema tương thích ngược, đổi RELEASE về SHA cũ,
chạy `up -d --no-build --no-deps api frontend`, rồi smoke test. Không chạy lại migration
image cũ để “undo” schema. Migration phá tương thích cần maintenance window, backup đã
thử restore và kế hoạch SQL forward-fix; phục hồi backup có thể mất writes sau thời điểm dump.
Không restore đè DB ứng dụng hoặc tự drop column khi chưa xác định cách bảo toàn dữ liệu.

## Nghiệm thu khi có staging

Chạy luồng hai tài khoản và ADMIN bằng trình duyệt thật: OTP/session/quyền, đăng tin/
kiểm duyệt, kết nối/chat/SSE/hẹn, nhà chung/chi phí/quyết toán, mua/hoàn dịch vụ, AI fallback.
Thử reconnect SSE qua HTTPS, webhook public, email thật, restart API và lỗi DB/readiness.
Chạy lại tải với dataset gần thật và đủ lâu, thử backup/restore, rollback release và cảnh báo.
Sau đó mời nhóm nhỏ, ghi lỗi/phản hồi bằng ticket hỗ trợ. Chưa đánh dấu Phase 12 hoàn tất
trước khi có bản public, quy trình vận hành hoạt động và số liệu tải từ host đó.

Tài liệu đối chiếu: [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/),
[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html),
[GitHub PostgreSQL CI services](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).
