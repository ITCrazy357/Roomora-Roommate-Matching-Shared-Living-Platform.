# Kích hoạt vận hành Render / Vercel

Đợt này bổ sung kiểm tra schema/index trong readiness, backup mã hóa và restore
drill, monitor theo lịch, Web Vitals cùng kiểm thử trình duyệt. PostgreSQL được
người dùng xác nhận ở Render, PostgreSQL 18; workflow và script mặc định dùng
client/restore PostgreSQL 18. Chưa biết gói dịch vụ. Cấu hình database
trong workspace chỉ trỏ localhost, nên không dùng nó làm bằng chứng DB production.

## Backup ngoài Render và email GitHub

Đích lưu là **GitHub Actions artifacts đã mã hóa**, giữ ngoài Render. Đã xác minh
[backup thủ công và restore drill](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40372096924)
và [backup theo lịch](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40417834569)
thành công. Đây là bằng chứng lịch sử; tiếp tục theo dõi các lần chạy mới. Không
đưa DB URL hoặc khóa mã hóa vào chat, code, PR hay biến `NEXT_PUBLIC_*`.

1. Trong GitHub repo, mở Settings → Environments, tạo `production-backup` và
   giới hạn deployment branch là **main**. Chỉ cho maintainer tin cậy sửa workflow.
2. Tạo hai **environment secrets** trong môi trường đó:

   | Secret | Giá trị nhập riêng trong dashboard |
   | --- | --- |
   | `ROOMORA_BACKUP_DATABASE_URL` | External Database URL của PostgreSQL Roomora ở Render. |
   | `ROOMORA_BACKUP_KEY` | Khóa ngẫu nhiên 32 byte, mã hóa base64, không phải mật khẩu tự đặt. |

   Có thể tạo khóa bằng Node trên máy riêng rồi lưu vào trình quản lý mật khẩu:

   ```powershell
   New-Item -ItemType Directory -Force .verification | Out-Null
   node -e "require('node:fs').writeFileSync('.verification/backup-key.txt',require('node:crypto').randomBytes(32).toString('base64'),{flag:'wx',mode:0o600})"
   ```

   File này nằm trong thư mục Git ignore. Chỉ tài khoản vận hành được đọc file;
   chuyển khóa vào kho bí mật riêng, không để khóa chỉ tồn tại trong GitHub.
   Mất khóa sẽ không khôi phục được archive. Khi xoay khóa, giữ khóa cũ để đọc các
   bản cũ còn trong retention.
   Ngày 27/10/2026, người vận hành xác nhận đã cất khóa backup ở nơi riêng an toàn;
   không thu thập hoặc ghi giá trị khóa vào tài liệu kiểm chứng.
3. Kiểm tra PostgreSQL version trong Render. Tạo repository variable
   `ROOMORA_POSTGRES_MAJOR=17` hoặc `18`, bằng/cao hơn major version server.
   Client 17 đọc được server cũ hơn 17; server 18 cần client 18. Không nới TLS
   hoặc tắt xác minh chứng chỉ để vượt lỗi kết nối. Export yêu cầu external host
   `.render.com`, TLS `verify-full` và không đưa credentials vào argv. Workflow cấp
   CA hệ thống của runner qua `ROOMORA_BACKUP_CA_FILE`, mount chỉ đọc vào container.
   Nếu Render có IP allowlist, cần cấp đường truy cập cho runner đã chọn theo
   chính sách hệ thống; không tự mở DB cho toàn Internet để chạy workflow.
4. Sau khi push/review workflow trên main, vào Actions → **Roomora database backup**
   → Run workflow. Lần chạy tay luôn gồm restore drill. Chỉ xem backup hoạt động
   khi workflow thành công và artifact `database-encrypted-<run id>` tồn tại.
5. Đặt repository variable `ROOMORA_BACKUP_ENABLED=true` để bật lịch hằng ngày,
   khoảng **02:23 giờ Việt Nam/Thái Lan**. Bản thường giữ 7 ngày; bản Chủ nhật UTC
   giữ 35 ngày và có restore drill. Cron GitHub có thể trễ hoặc ngừng theo chính
   sách hoạt động repo; cần monitor tuổi artifact và thỉnh thoảng kiểm tra lịch.

`pg_dump` được mã hóa AES-256-GCM ngay từ stdout, không ghi dump plaintext khi
export. Chỉ `.dump.enc` và checksum được upload; lỗi pg_dump không được công bố
thành backup hoàn chỉnh. Restore drill xác thực GCM/checksum, tạo PostgreSQL
không có mạng/port public và kiểm tra schema/index sau restore, rồi dọn plaintext
và container. Drill không kết nối hoặc ghi vào DB production.

File mã hóa được upload ngay sau export, trước restore drill. Nếu drill thất bại,
workflow vẫn báo lỗi nhưng file đã lưu được giữ lại để điều tra/phục hồi; không
coi file này là đã kiểm chứng. Summary ghi riêng kết quả upload và restore. Monitor
chỉ tính artifact đúng tên/run của workflow backup trên main đã kết thúc thành công,
để file còn lại từ một lần drill lỗi không che khuất backup đã quá hạn. Các lần hằng
ngày không có drill vẫn được tính nếu workflow thành công; drill chạy tay/hằng tuần
là bằng chứng khôi phục riêng. Restore chờ PostgreSQL qua TCP loopback để tránh
nhận nhầm server tạm chỉ có Unix socket trong lúc image khởi tạo.

Lịch này chưa thay thế PITR nếu bạn cần RPO ngắn hơn một ngày. Khóa mã hóa identity
của ứng dụng, cấu hình provider và tài sản Cloudinary phải có kế hoạch lưu riêng;
DB dump không chứa đủ các thành phần đó. Render trả phí có recovery/PITR; Free
không có cùng khả năng. Xem [Render backups](https://render.com/docs/postgresql-backups).

Để khôi phục archive tải về, dùng máy riêng với Docker và khóa trong biến môi
trường `ROOMORA_BACKUP_KEY`, không nhập khóa vào command arguments:

```powershell
node --experimental-strip-types scripts/restore-encrypted-backup.mjs <backup.dump.enc>
```

Lệnh này chỉ kiểm tra phục hồi trong container tạm. Chuyển DB ứng dụng sang bản
khôi phục là thao tác riêng cần đối chiếu dữ liệu và cấu hình trước khi cutover.

Restore yêu cầu các bảng lõi Roomora phục hồi được. `schemaReady=false` trong
kết quả có thể chỉ ra bản backup được tạo trước migration mới; không hủy bản
backup đó. Xác nhận `restored=true` và `coreSchemaReady=true` để đánh giá khôi phục;
chỉ yêu cầu `schemaReady=true` khi kiểm tra sẵn sàng triển khai release mới.

## Monitor và email

Sau khi backend mới được deploy và có backup thành công:

1. Actions → **Roomora production monitor** → Run workflow.
2. Workflow kiểm tra trang Vercel trả 200/CSP nonce; readiness trực tiếp và qua
   proxy phải có `database=up`, `schema=up`, Redis up hoặc disabled; artifact backup
   phải không quá 26 giờ (24 giờ + 2 giờ dư cho lịch/runner).
   Health check thử tối đa 5 lần, mỗi yêu cầu có timeout 20 giây, cách nhau 5 giây:
   tổng ngân sách khoảng 120 giây, chưa tính tra metadata backup. Job có giới hạn
   4 phút. JSON log giữ từng lần thử, thời gian mỗi endpoint và mã `TIMEOUT`,
   `NETWORK_ERROR` hoặc `INVALID_JSON`; không ghi response body/lỗi thô của provider.
   Phải đạt cả ba kiểm tra trong cùng một lần thử mới được coi là healthy.
   API phục hồi sau retry không chứng minh người truy cập không gặp chậm/lỗi.
   Nếu dùng Render Free, dịch vụ có thể ngủ sau 15 phút không có traffic và mất
   khoảng một phút khởi động lại ([Render](https://render.com/docs/free#spinning-down-on-idle)).
   Không mặc định quy lỗi timeout cho chế độ ngủ: đối chiếu Render Events/Logs
   với thời gian `checkedAt` trước khi kết luận. Tăng cửa sổ retry không cải thiện
   thời gian người dùng chờ API; nếu cần luôn sẵn sàng, đánh giá compute không ngủ.
3. Monitor mặc định chạy theo lịch trên `main`, mỗi giờ khoảng phút 17; không cần
   tạo variable để bật. GitHub có thể chạy lịch trễ. Nếu cần chủ động tạm dừng,
   vào Settings → Secrets and variables → Actions → **Variables** →
   **Repository variables**, đặt `ROOMORA_MONITOR_ENABLED=false`. Đặt `true` hoặc
   xóa variable này để tiếp tục. Variable trong Environment hoặc Secrets không
   điều khiển điều kiện job này. Chạy tay vẫn được phép khi lịch đang tạm dừng.
   Ba lần thử chỉ xử lý gián đoạn ngắn, không phải kiểm tra mỗi phút.
4. Trong tài khoản GitHub: Settings → Notifications → System → Actions, chọn
   **Email** và **Only notify for failed workflows**.
5. Actions → **Roomora production monitor** → Run workflow trên main, bật
   `test_alert`. Lần chạy có tên **Roomora notification test (expected failure)**
   sẽ cố ý báo lỗi ngay ở bước đầu để kiểm tra thông báo GitHub. Nó không gọi API,
   kết nối database hoặc thay đổi cấu hình app; các bước kiểm tra thật bị bỏ qua.
   Tùy chọn mặc định tắt và chỉ áp dụng khi chạy tay, không tác động lịch tự động.
6. Kiểm tra Inbox/Spam của email đã cấu hình. Chỉ xác nhận cảnh báo hoạt động khi
   nhận được email đúng lần chạy thử; trạng thái đỏ của workflow không chứng minh
   email đã đến. Chạy lại với `test_alert` tắt để xác nhận monitor thật thành công.
7. Sau khi bản sửa workflow đã lên `main`, kiểm tra một lượt có **Event: schedule**:
   job `monitor` phải thực sự chạy, bước `node scripts/check-production.mjs` thành
   công và báo `healthy=true`, `backupArtifactFresh=true`. Lượt chạy tay thành
   công không thay thế bằng chứng này. Nếu lịch bị `skipped`, kiểm tra repository
   variable có đang là `false` và workflow có bị Disable trong Actions hay không.

GitHub gửi thông báo theo tài khoản kích hoạt hoặc sửa lịch gần nhất và thiết lập
notification, không tự gửi tới mọi collaborator. Xem
[GitHub Actions notifications](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications)
và [workflow notifications](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).
Ngày 27/10/2026, người vận hành xác nhận bài thử cảnh báo đúng dự kiến sau
[run thử lỗi](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40492030285)
và [run bình thường](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40492232358).
Trạng thái nhận email dựa trên xác nhận của người vận hành.
Monitor artifact chỉ chứng minh metadata có bản upload mới từ một lần backup thành
công, không tự chứng minh archive còn khôi phục được; restore drill là bước riêng.

## Xác nhận migration sau deploy

Readiness mới trả 503 nếu thiếu cột nghiệp vụ, migration tìm kiếm chưa thành
công, có migration bị lỗi, hai trigram index chưa hợp lệ hoặc CHECK ngân sách
chưa validate. Response chỉ có trạng thái tổng hợp, không công khai tên bảng,
schema history, dữ liệu hoặc lỗi PostgreSQL.

Sau khi có backup, dùng quy trình migrate trong
[runbook](security-performance-hardening.md), deploy backend/frontend rồi chạy:

```powershell
$env:SITE_URL='https://roomora-blond.vercel.app'
$env:API_ORIGIN='https://roomora-api-qxjb.onrender.com'
node scripts/check-production.mjs
```

Có thể xác nhận trực tiếp từ môi trường đã có `DATABASE_URL` production và build
backend bằng `npm run verify:release` trong backend. Script chỉ đọc, không tự load
`.env` hoặc chạy migration. Không dùng `db push`, `migrate dev`, hay sửa dữ liệu
production để làm health xanh. Kiểm tra này là các điều kiện của bản vá hiện tại,
không phải kiểm tra toàn bộ nghiệp vụ hoặc mọi checksum migration trong lịch sử.

## Hiệu năng và người dùng thật

Backend mới nhận `POST /api/v1/telemetry/web-vitals`, có OriginGuard, DTO allowlist
và rate limit. Frontend production dùng hook chính thức `useReportWebVitals`;
không gửi cookie, URL/query, DOM entries, thông tin tài khoản hoặc định danh lâu
dài. Bỏ qua automation, Do Not Track và Global Privacy Control. Device là phân
loại theo viewport, không suy ra thiết bị vật lý.

Log `web_vital` có LCP/INP/CLS/FCP/TTFB, nhóm trang public và id metric tạm để loại
trùng. Xuất JSON logs của Render trong cùng khoảng thời gian cần đánh giá rồi chạy:

```powershell
Get-Content <render-json-logs.jsonl> | node scripts/report-performance.mjs
```

Report tách mobile/desktop và nhóm trang, tính p75; dưới 100 mẫu/nhóm ghi
`insufficient_samples`. Có 100 mẫu cũng chưa chứng minh mẫu đại diện cho mọi
người dùng hoặc đủ cửa sổ 28 ngày. Chỉ gom log sau deploy của cùng release khi
so sánh hiệu năng giữa các phiên bản. API p95 lấy từ HTTP server logs, bỏ SSE/health/
telemetry; đây là thời gian xử lý server, khác độ trễ HTTP từ máy người dùng.
Không gom p75 từ những lần đo lab vào thống kê người dùng thật.

Đo lab lặp lại (chỉ duyệt public/GET) từ frontend:

```powershell
$env:PERF_OUTPUT='../.verification/mobile-public.json'
node scripts/measure-public.mjs
```

Pixel 7/4G/CPU chậm được giả lập. `maxInteractionMs` là Event Timing trong lab,
không gọi đó là INP thực địa. Lần đo ngày 26/10/2026 trên bản đang public trước
đợt sửa này: LCP 4–9 giây, CLS dưới 0,1 trong 3 mẫu/trang; chưa đạt mục tiêu LCP.
12 GET tuần tự qua Vercel proxy: listings p95 615 ms, people p95 326 ms, không lỗi;
chỉ 6 mẫu mỗi endpoint, không phải chứng minh sức tải production.

Các sửa theo bằng chứng gồm WOFF2 giữ nguyên 459 ký tự/metrics mỗi font, ảnh local
public đi qua Next Image, trì hoãn tải slide phụ đến khi ảnh đầu tải xong và SSR
kết quả tìm kiếm. Tổng font nguồn từ 545.964 byte TTF xuống 160.012 byte WOFF2;
đây là kích thước file, không phải mức giảm LCP hoặc transfer trước đó đã nén HTTP.
Chưa có số đo sau deploy để khẳng định LCP thực tế đã đạt 2,5 giây.
Đo tiếp ngày 27/10 và thử thay đổi preload font được ghi tại
[báo cáo hiệu năng](performance-followup-2026-10-27.md); candidate local chưa phải
bằng chứng cải thiện sau deploy hoặc p75 người dùng thật.

Kiểm thử kỹ thuật ba hành trình có ở `frontend/e2e/journeys.spec.ts`: tìm phòng/
đọc giá-cọc; kết nối-chấp nhận-nhắn tin có lưu DB; phân biệt tổng chi/đã trả/còn
phải thanh toán và bù trừ trong nhà. Chạy trên tài khoản/DB giả, không ghi production.
Để đánh giá khả năng hiểu của con người, dùng
[kịch bản thử người dùng](user-acceptance-check.md); chưa có người dùng thật tham gia
trong phiên này, nên không đánh dấu UAT thực tế đã đạt.
