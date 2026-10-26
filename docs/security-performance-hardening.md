# Bảo mật, hiệu năng và vận hành — 26/10/2026

Đây là mốc kiểm chứng đợt 35.1. Đợt bổ sung sau đó có hướng dẫn tại
[kích hoạt vận hành](operations-activation.md): PostgreSQL đã được xác nhận ở
Render; CI GitHub của commit `7d6fd49` đã thành công và frontend public đã có CSP
nonce khi kiểm tra lại. Các trạng thái local/chưa deploy dưới đây là ảnh chụp
tại thời điểm đợt 35.1, không thay thế kết quả đo hoặc quy trình mới.

Đợt này hoàn thiện các mục còn lại sau bốn bản sửa về đăng nhập/reset mật khẩu,
bản nháp chi định kỳ, PayOS reconciliation và cập nhật ngân sách đồng thời.
Các kết quả dưới đây được phân biệt giữa mã nguồn/local và hệ thống đang chạy.

## Thay đổi trong mã nguồn

| Phần | Hành vi mới |
| --- | --- |
| Mật khẩu | scrypt `N=32768, r=8, p=3`, salt 16 byte, key 64 byte. Vẫn kiểm tra hash cũ `16384/8/1`; chỉ nâng cấp sau khi mật khẩu đúng và email đã xác minh. |
| Đồng thời | Tính hash bên ngoài transaction; kiểm tra lại hash cũ dưới khóa user rồi nâng cấp hash và tạo session trong cùng transaction. Reset mật khẩu không bị ghi đè bằng kết quả đăng nhập cũ. |
| CSP | Proxy tạo nonce ngẫu nhiên cho từng response HTML; script framework và script khởi tạo theme dùng nonce. Production không cho `unsafe-eval`; chặn object, iframe nhúng trang và script inline không được cấp nonce. |
| Header | API thêm `nosniff` và bỏ `X-Powered-By`; Caddy thêm HSTS cho phương án Compose. Header Caddy không tự áp dụng cho Vercel/Render. |
| Trang chủ | Ba nhóm tin công khai được tải song song ở server, có HTML trước hydration. Khách không gọi lại ba API; người đăng nhập vẫn tải trạng thái lưu tin riêng. |
| Ảnh | Ảnh public Cloudinary nhận width/quality/format theo màn hình; ảnh hero dùng Next Image. URL ảnh riêng tư hoặc có chữ ký giữ đường truy cập hiện có. |
| Realtime | `/updates/unread` chỉ trả hai bộ đếm; gộp sự kiện dồn trong 150 ms. Tab ẩn ngừng tải lại bộ đếm, quay lại tab sẽ đồng bộ. |
| SSE | NOTIFY vẫn đẩy sync ngay; sync dự phòng mỗi 60 giây. Heartbeat và kiểm tra session vẫn mỗi 20 giây; session bị thu hồi vẫn đóng stream. |
| Tìm kiếm | Hai GIN trigram index cho tin PUBLISHED chưa xóa và hồ sơ PUBLIC; giữ nguyên kết quả, phân trang và quy tắc quyền truy cập. |
| Vận hành | Monitor readiness + tuổi backup; script backup/restore hỗ trợ PostgreSQL role khác mặc định. CI thêm typecheck backend, monitor test và toàn bộ frontend test. |

Chi phí scrypt mới dùng khoảng 32 MiB cho mỗi tác vụ KDF. Đây là một cấu hình
được liệt kê trong [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Đo local Node 22.23.2, 8 lần sau warmup: trung bình 383 ms, tối đa 436 ms;
4 tác vụ đồng thời hoàn thành trong 540 ms, peak RSS cả tiến trình 188 MiB.
Đo lại đăng nhập trên đúng gói Render trước khi tăng tải; số này không phải latency production.
Hai lần đăng nhập cùng hash cũ có thể khiến lần thứ hai nhận 401 sau khi lần đầu
nâng cấp hash; đăng nhập lại bằng mật khẩu hiện tại sẽ hoạt động.

**Rollback auth:** phiên bản trước đợt này chỉ nhận hash `16384/8/1`. Sau khi đã
tạo/nâng cấp hash mới, không rollback nguyên trạng sang phiên bản đó: phải giữ
bộ verifier nhận cả hai cấu hình. Không thể chuyển hash mới về hash cũ khi không
có mật khẩu gốc; không reset mật khẩu hàng loạt để vượt qua vấn đề này.

CSP dùng nonce khiến các trang cần render động, không dùng chung HTML cache giữa
các request. SSR trang chủ gọi API với `no-store`, không gửi cookie và timeout
5 giây; Render cold start có thể làm trang chậm hoặc dùng đường tải lại phía client.
Giữ fallback/retry và không cache tin bị ẩn/khóa. Style inline vẫn được phép vì
React, Leaflet và biểu đồ sử dụng style attribute. CSP không thay thế kiểm soát
quyền truy cập hoặc xử lý nội dung người dùng.
Xem [Next.js CSP](https://nextjs.org/docs/app/guides/content-security-policy).

## Migration tìm kiếm

Ba migration mới:

- `20261026120000_enable_trigram_search`: bật `pg_trgm`.
- `20261026120100_listing_search_index`: GIN đa cột cho tin công khai.
- `20261026120200_profile_search_index`: GIN đa cột cho hồ sơ công khai.

Role migrate phải được phép tạo extension/index; kiểm tra khả năng này ở nhà
cung cấp PostgreSQL thực tế. Mỗi migration index chỉ có một statement
`CREATE INDEX CONCURRENTLY`, không bọc trong `BEGIN/COMMIT`. Giữ đủ dung lượng
và theo dõi I/O khi tạo index trên dữ liệu thật. Index tăng chi phí ghi và dung
lượng; truy vấn rất ngắn hoặc trả nhiều hàng vẫn có thể dùng sequential scan.

Sau khi có backup đã kiểm tra, chạy từ `backend` với biến môi trường deployment
đã được quản lý riêng:

```powershell
npm run prisma:migrate:deploy -- --config prisma7.config.ts
npm run prisma:migrate:status -- --config prisma7.config.ts
```

Nếu tạo index concurrent bị ngắt, kiểm tra `pg_index.indisvalid` cho đúng tên
index. Chỉ drop concurrently index của migration thất bại, xử lý nguyên nhân,
đánh dấu migration đó `prisma migrate resolve --rolled-back <tên migration>`
rồi chạy deploy lại. Không sửa lịch sử migration đã thành công hoặc đánh dấu
applied khi index chưa được tạo hợp lệ.

EXPLAIN ANALYZE trên 10.000 tin giả: cùng một truy vấn tìm một kết quả, trước
index là Seq Scan 9,879 ms, sau index là Bitmap Heap Scan 0,917 ms. Đây là một
lần đo local, không phải benchmark toàn site hoặc Core Web Vitals production.

## Vercel và Render hiện tại

Ngày 26/10/2026 kiểm tra GET không đăng nhập:

- `https://roomora-blond.vercel.app`: HTTP 200.
- `https://roomora-api-qxjb.onrender.com/api/v1/health/ready`: HTTP 200.
- `https://roomora-blond.vercel.app/api/v1/health/ready`: HTTP 200.
- API CORS khớp origin frontend trên. Trang public đang chạy chưa trả CSP;
  các thay đổi mới chưa được triển khai trong phiên làm việc này.

Readiness hiện chỉ kiểm tra kết nối DB (`SELECT 1`) và Redis nếu có cấu hình.
Kết quả 200 không chứng minh schema mới đã migrate hoặc nghiệp vụ hoạt động.
Đối chiếu migration status, commit release và smoke test sau deploy.

Đối chiếu các biến **không phải secret** sau trong Vercel, Production environment;
sau khi sửa cần build/deploy lại để Next nhận rewrite và biến public:

```dotenv
NEXT_PUBLIC_API_BASE_URL=/api/v1
API_PROXY_TARGET=https://roomora-api-qxjb.onrender.com
API_SERVER_BASE_URL=https://roomora-api-qxjb.onrender.com/api/v1
SITE_URL=https://roomora-blond.vercel.app
```

Render API dùng `NODE_ENV=production` và
`FRONTEND_ORIGIN=https://roomora-blond.vercel.app`. Giữ OriginGuard,
cookie `Secure/HttpOnly/SameSite=Lax` và đi qua proxy `/api/v1` cùng origin;
không đổi sang cookie cross-site hoặc wildcard CORS để chữa lỗi đăng nhập.
Nếu dùng Google OAuth/MCP, đối chiếu callback, public origin và URL discovery
đã cấu hình ở provider trước khi thay đổi; không tự thay host theo request.

Migrate một lần trước khi chạy API, bằng job/pre-deploy hoặc bước deploy riêng
phù hợp gói đang dùng; không chạy `migrate dev` hoặc `db push` trên production.
Build hiện có là `npm ci && npm run build`, runtime là `npm run start:prod` từ
thư mục backend. Kiểm tra dashboard trước khi thay command đang dùng.
Có thể đặt Render auto-deploy thành “After CI Checks Pass” theo
[tài liệu Render](https://render.com/docs/deploys). Chưa truy cập dashboard,
thay biến môi trường, chạy migration production hoặc xác nhận remote CI.

## Thiết lập backup đầu tiên

Người dùng xác nhận chưa có backup. Chưa biết PostgreSQL nằm ở đâu hoặc gói nào;
không suy ra PostgreSQL cũng ở Render chỉ vì API đang ở Render.

Nếu DB là Render Postgres trả phí, kiểm tra Recovery/PITR và tạo logical export
trong dashboard; tải bản export xuống thiết bị hoặc kho riêng ngoài dịch vụ.
Render không cung cấp recovery/logical export tự động cho Free compute; có thể
dùng `pg_dump` từ máy riêng. Tham khảo
[Render Postgres backups](https://render.com/docs/postgresql-backups).
Không bật dịch vụ trả phí hoặc upload dữ liệu vào một kho mới khi chưa chọn đích lưu.

Để backup DB được quản lý bằng `pg_dump` trên Windows:

1. Cài PostgreSQL client tương thích phiên bản server, thêm `pg_dump` vào PATH.
2. Cấu hình service `roomora-production` trong
   `%APPDATA%\postgresql\.pg_service.conf` với host, port, dbname, user và TLS theo
   nhà cung cấp. Mật khẩu để trong `%APPDATA%\postgresql\pgpass.conf` với quyền
   đọc chỉ cho tài khoản chạy backup. Không đưa các file này vào repo/log/chat.
   Xem [service file](https://www.postgresql.org/docs/current/libpq-pgservice.html)
   và [password file](https://www.postgresql.org/docs/current/libpq-pgpass.html).
3. Chạy từ repo với thư mục `backups` trên ổ đĩa được bảo vệ; lệnh không chứa
   URL hoặc mật khẩu:

```powershell
$env:PGSERVICE = 'roomora-production'
$taskBackupDirectory = New-Item -ItemType Directory -Force -Path backups
$taskExport = Join-Path $taskBackupDirectory.FullName "roomora-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$([Guid]::NewGuid().ToString('N')).dump"
pg_dump --no-password --format=custom --no-owner --no-acl --file=$taskExport
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; do not use the incomplete file' }
(Get-FileHash -LiteralPath $taskExport -Algorithm SHA256).Hash |
  Set-Content -LiteralPath "$taskExport.sha256" -Encoding ascii
```

Với Compose dùng script `database-backup.ps1` hiện có. Kiểm tra restore bản dump
vào PostgreSQL local **tách biệt**, cùng major version phù hợp, bằng
`database-restore-check.ps1 -BackupFile <file.dump> -ContainerName <container-test>
-DatabaseUser <role-local>`; script tự tạo/drop DB ngẫu nhiên, không ghi đè DB thật.
Không chạy restore vào DB production. Export dạng `.dir.tar.gz` của dashboard
Render dùng hướng dẫn restore riêng của Render, không đưa thẳng vào script nhận `.dump`.

Đặt lịch backup hằng ngày và trước migration; giữ ít nhất 7 bản ngày/4 bản tuần,
đưa bản mã hóa vào đích lưu ngoài máy chạy backup với quyền truy cập riêng.
Lịch chỉ chạy khi máy/runner hoạt động. Không coi bản dump còn nằm trên ổ tạm
của Render là offsite backup. Chỉ xác nhận backup sẵn sàng khi có bản thật,
checksum, bản sao ngoài server và một lần phục hồi thành công. DB dump không
bao gồm ảnh trên Cloudinary, secrets provider hoặc khóa mã hóa dữ liệu ứng dụng;
cần lưu khóa cần thiết bằng cơ chế bí mật riêng để phục hồi dữ liệu mã hóa.

## Monitor

Chạy từ repo trên máy có thư mục backup hoàn chỉnh:

```powershell
$env:MONITOR_URL = 'https://roomora-api-qxjb.onrender.com/api/v1/health/ready'
$env:MONITOR_BACKUP_DIRECTORY = (Resolve-Path backups).Path
$env:MONITOR_BACKUP_MAX_AGE_HOURS = '24'
node scripts/monitor-health.mjs
```

Exit 0 khi readiness trả 200 với JSON đúng service, DB up, Redis up/disabled
và có `.dump` không rỗng kèm sidecar SHA256 đúng
định dạng, mới hơn 24 giờ. Exit 1 khi một trong hai điều kiện không đạt. Monitor
chỉ kiểm tra **tuổi và dấu hoàn tất**, không tính lại hash, restore hoặc xác nhận
bản sao offsite. HTML fallback hoặc JSON không khớp contract bị xem là chưa ready.
Lên lịch bằng Task Scheduler/cron trên runner riêng, giữ lịch sử exit code và
chuyển lỗi tới kênh cảnh báo vận hành đã chọn. Chưa có lịch hoặc kênh cảnh báo thật.

## Bằng chứng kiểm thử local

Ngày 26/10/2026, Node 22.23.2, PostgreSQL 17 và Redis 7.4 trong container thử riêng:

- 235 unit tests backend, 486 E2E tests backend: toàn bộ qua, không skip.
- 17 frontend tests, 1 monitor test: qua.
- Backend/frontend lint và TypeScript: qua. Production build hai ứng dụng: qua.
- 53 migration được áp dụng trên DB test mới, gồm 3 migration trigram của đợt này.
- Backup/restore dữ liệu giả thành công: 200 profiles, 10.000 listings,
  500 notifications; checksum đúng, DB restore ngẫu nhiên được dọn sau kiểm tra.
- Trình duyệt production build local: 3 card SSR nhìn thấy khi tắt JavaScript;
  nonce khác giữa hai response; script chèn vào HTML bị CSP chặn; ảnh hero có
  srcset và tải được; không có page error hoặc tràn ngang ở 390/1440 px.
- Ảnh Cloudinary demo được gắn bằng fixture vào response danh sách trong trình
  duyệt: có srcset, URL transform đúng và tải thành công. Trang chi tiết mở được
  ở 390 px; kiểm tra này không thay đổi ảnh hoặc tin thật.
- Kiểm tra provider frontend với auth/counts/EventSource giả lập: mount 1 lần tải,
  burst 20 sync tạo 1 request, tab ẩn 0, quay lại tab 1. Đây là kiểm tra giao diện
  có fixture; xác thực/quyền/SSE thật được kiểm tra riêng bằng E2E backend.

Artifact local ở `.verification/combined-hardening-a1/` (Git ignore): query plans,
benchmark mật khẩu và dump thử. Cookie fixture chỉ dành cho DB giả, không chia sẻ.
Chưa chứng minh load/CWV production, backup production, Google indexing hoặc
remote CI của các thay đổi chưa push.
