# Bằng chứng đợt hoàn thiện vận hành — 26/10/2026

## Cập nhật triển khai — 27/10/2026

Các kết quả dưới đây đã được đối chiếu với GitHub; bảng local ngày 26/10 phía
dưới được giữ như lịch sử kiểm thử, không phải số đo mới.

| Hạng mục | Bằng chứng |
| --- | --- |
| Backup + restore drill sau bản sửa TCP/upload | [Run 40489900758](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40489900758), commit `36137b6`, thành công và có artifact mã hóa. |
| Backup theo lịch | [Run 40417834569](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40417834569), thành công; bản ngày giữ 7 ngày. |
| Monitor bình thường | [Run 40492232358](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40492232358), commit `ad5b8c0`, thành công. |
| Bài thử cảnh báo | [Run 40492030285](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40492030285), cố ý thất bại; người vận hành xác nhận bài thử đúng dự kiến. Việc nhận email dựa trên xác nhận của người vận hành. |
| CI mốc `ad5b8c0` | [Run 40491618063](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40491618063), thành công; chưa chứng minh CI cho bản sửa chưa push tiếp theo. |

Readiness qua monitor chứng minh schema/index thuộc contract của release sẵn
sàng tại lúc kiểm tra; không thay thế kiểm thử toàn bộ nghiệp vụ trên production.
Người vận hành xác nhận ngày 27/10/2026 đã cất khóa backup riêng ngoài GitHub/Render;
không thu thập giá trị khóa. Monitor theo lịch, dữ liệu Web Vitals người dùng thật
và UAT có con người vẫn cần bằng chứng riêng. Người vận hành xác nhận chưa có UAT;
đã chuẩn bị [kịch bản 10–15 phút](user-acceptance-check.md) và giữ CSV kết quả trống.

## Bổ sung hiệu năng và dev tooling — 27/10/2026

[Báo cáo đo lặp](performance-followup-2026-10-27.md) ghi baseline/candidate, lệnh
chạy và giới hạn. Trang chủ local có trung vị LCP 3.600 → 2.752 ms, 6 mẫu/cấu hình;
không phải số đo sau deploy hay field CWV. Build/lint frontend và 19 unit tests qua.

Audit backend trước cập nhật: 9 dependency có cảnh báo, gồm 3 high. Đã nâng Vitest và coverage
lên 4.1.12, Vite lên 8.3.5; giữ Nest Mau 0.2.8 và override riêng Inquirer 8.2.7,
Undici 6.29.1 dưới package này. Không dùng `audit fix --force` hoặc downgrade Mau.
Audit toàn bộ dependency backend và frontend sau cập nhật đều 0 advisory tại
thời điểm kiểm tra. Lockfile giữ nguyên phiên bản 359 package runtime backend.
CI backend/frontend kiểm tra toàn bộ dependency bằng `npm audit --audit-level=high`,
gồm dev tooling; bước audit runtime image hiện có vẫn được giữ.

Smoke test Inquirer và vòng đời file tạm của external editor mới qua; không mở
editor hoặc gọi Nest Cloud. Unit backend: 230 qua, 5 Redis integration bỏ qua do
chưa cấu hình `REDIS_TEST_URL`. Build, typecheck và lint backend qua. Đây không
phải kết quả full E2E hay remote CI cho bản sửa chưa push.

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

Tại mốc local 26/10, backend full dependency audit còn 9 advisory ở dev tooling (3 high, 4 moderate,
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

## Review và sửa monitor — 28/10/2026

Commit `08354e5` đã có [CI thành công](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40498386472)
và [10 bài browser journeys qua](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40498386405).
Log CI backend xác nhận 489 E2E qua. [Backup theo lịch](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40598885878)
đã export/upload thành công; restore drill bỏ qua đúng chính sách ngày thường.

Tuy nhiên, [monitor theo lịch ngày 28/10](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40639858975)
trên cùng commit bị `skipped`. Điều kiện cũ chỉ cho lịch chạy khi repository vars
trả về đúng `true`; chưa đọc được giá trị/phạm vi variable thực tế, nên không kết
luận người vận hành đã đặt nhầm. Chạy tay bỏ qua điều kiện này, do đó manual pass
không chứng minh lịch đã bật.

Bản sửa monitor mặc định chạy trên `main`; chỉ `ROOMORA_MONITOR_ENABLED=false`
ở repository variables mới tạm dừng lịch. Manual vẫn được phép. Không đổi lịch,
quyền GitHub token hoặc kiểm tra readiness/tuổi backup. Bản sửa cần được push và
có một lượt `schedule` thực sự chạy trước khi xác nhận phần này hoạt động từ xa.

Kiểm chứng local cho bản sửa: 5 kiểm thử monitor qua, không skip; YAML parse được,
6 trường hợp điều kiện workflow qua (lịch thiếu variable/true/false, manual khi
tạm dừng, manual và schedule ngoài main). Cron, quyền token và mặc định tắt
`test_alert` được kiểm tra. `git diff --check` qua; chưa có remote CI cho bản sửa này.

Review cũng đo lại bản public: 3 lượt/trang, Pixel 7 giả lập, mạng 1,6 Mbps/150 ms,
CPU slowdown 4. LCP trung vị home/listings/listing lần lượt 3.400/3.116/3.000 ms;
9 lượt HTTP 200, không page error/tràn ngang, CLS dưới 0,1. Đây là lab sample,
không phải field p75 và chưa đạt mục tiêu LCP 2,5 giây. Artifact local đã ignore:
`.verification/ecc-review-20261028-public-verified.json`.

## Giới hạn yêu cầu gửi chat — 28/10/2026

Thêm `MessageSendRateGuard` sau xác thực và trước `FileFieldsInterceptor` cho
POST tin nhắn riêng và nhà chung. Mỗi tài khoản có tối đa 60 yêu cầu gửi trong
cửa sổ 60 giây; multipart có thêm ngưỡng 30 yêu cầu trong cùng khoảng thời gian.
Hai loại chat dùng chung bucket theo tài khoản, nên đổi hội thoại/nhà hoặc gửi lại
cùng `clientId` không làm mới hạn mức. Cả yêu cầu không hợp lệ cũng được tính.
Vượt ngưỡng trả 429 `RATE_LIMITED` trước khi Multer buffer file hoặc Sharp xử lý
ảnh. Guard dùng `RateLimitService` hiện có: production chia sẻ counter qua Redis,
Redis đã cấu hình mà không dùng được trả 503 `RATE_LIMIT_UNAVAILABLE`.

Giới hạn tạo tin 30/phút và cơ chế chống tạo trùng ở service vẫn được giữ; một
lượt gửi lại trong hạn mức vẫn đi qua xử lý idempotency hiện có. Frontend giữ
nội dung/tệp khi nhận lỗi để người dùng thử lại. Không thêm migration, dependency
hoặc biến môi trường. Đây là bảo vệ trong ứng dụng, không cam kết proxy đã từ chối
nhận byte từ mạng trước đó.

5 regression HTTP mới dùng controller/guard/Multer thật, xác thực và service
nghiệp vụ là fixture, không kết nối database: đã bắt lỗi trước khi vá (mong 429
nhưng nhận 400 từ multipart parser), rồi qua sau vá. Bao phủ retry cùng mã tin,
quota chung hai route, tài khoản độc lập, reset cửa sổ, yêu cầu sai vẫn tính,
xác thực trước quota và lỗi limiter trả 503 trước parser. Kiểm tra này không tự
chứng minh persistence/idempotency với PostgreSQL.

Unit backend: 235 qua, 5 Redis integration bỏ qua do chưa có `REDIS_TEST_URL`.
Build, lint, TypeScript và Prettier qua; dependency graph toàn AppModule compile
được và resolve guard từ build, không khởi động server hoặc kết nối database.
Fixture E2E giới hạn tạo tin chuyển sang cặp tài khoản riêng để không phụ thuộc
hạn mức HTTP đã dùng trong các bài trước. Chưa chạy lại PostgreSQL E2E vì Docker
engine local không hoạt động; cần CI sau push để xác nhận regression DB/Redis.

## Giới hạn API tìm kiếm công khai — 28/10/2026

`PublicSearchRateGuard` áp dụng sau `OptionalAuthGuard` cho `GET /listings` và
`GET /people`, trước DTO validation và service tìm kiếm. Hai endpoint dùng chung
600 lượt/IP trong cửa sổ 60 giây; phiên đăng nhập hợp lệ có thêm ngưỡng 60 lượt/
tài khoản/60 giây, kể cả khi đổi IP. Khách vẫn tìm kiếm được; không thay bộ lọc,
phân trang hoặc quyền xem dữ liệu. Yêu cầu không hợp lệ cũng được tính. Đây là
giới hạn tìm kiếm HTTP, không áp dụng lại lên tool MCP đã có limiter riêng.

Trả 429 `RATE_LIMITED` với `Retry-After: 60` khi vượt ngưỡng, 503
`RATE_LIMIT_UNAVAILABLE` khi limiter không hoạt động. `private, no-store` áp dụng
cả kết quả và lỗi; frontend có thông báo cho hai trường hợp này. Không cache tin
để né truy vấn. Dùng IP theo cấu hình proxy hiện có, không tin header tùy ý.
Người vận hành xác nhận `TRUST_PROXY_HOPS=1` trên Render; đây là xác nhận cấu hình,
chưa chứng minh API nhận đúng IP từng người qua Vercel. Bucket IP có thể dùng
chung cho NAT/proxy/SSR; xem lưu ý ngưỡng và theo dõi 429 trong runbook.

4 kiểm thử HTTP mới dùng controller, routing, DTO validation và limiter thật,
xác thực/query là fixture. Đã thấy lỗi trước vá (yêu cầu vượt ngưỡng vẫn 200),
sau vá đều qua: quota chung hai API và các filter/trang/IP; tài khoản độc lập;
600 lượt khách có tính DTO sai; header IP giả không đổi bucket khi proxy không
được tin cậy; IP từ proxy được tin cậy có bucket riêng; hết cửa sổ được thử lại;
Redis lỗi không gọi service tìm kiếm. Chỉ gọi localhost, không tạo tải production.

Local: backend 239 bài qua, 5 Redis integration bỏ qua; build/lint/typecheck qua.
Frontend 19 bài qua; lint hai helper sửa và typecheck toàn frontend qua. DI của
AppModule từ build resolve được guard ở cả ListingsModule và PeopleModule, dùng
chung RateLimitService, không khởi động server hoặc kết nối database. Docker
engine local chưa hoạt động nên chưa chạy lại PostgreSQL E2E cho bản sửa này.

Đợt upload chat trước đó đã có [CI thành công ở commit b10455a](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40662229906)
và [browser journeys thành công](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40662229832).
Đây không phải bằng chứng remote CI/deploy cho limiter tìm kiếm đang sửa local.

## LCP theo chiều rộng ảnh — 28/10/2026

[Báo cáo đo đối chứng](performance-followup-2026-10-28.md): chỉ sửa `sizes` theo
lề mobile, không hạ quality hoặc sửa ảnh gốc. Pixel 7 chọn ảnh 1.080 thay vì
1.200 px; ảnh LCP trong dataset giảm transfer khoảng 31%. A/B/A2/B2 trên cùng
server local, 6 mẫu/trang/cấu hình: LCP trung vị home 2.592 → 2.122 ms, listings
2.178 → 1.762 ms, listing 2.284 → 1.896 ms. Không so phần trăm này với production.

36 mẫu hợp lệ, CLS dưới 0,1, không page error/tràn ngang. 18 tổ hợp viewport/
trang qua QA; slideshow/theme/trợ lý và SSR không JavaScript qua. Frontend build,
lint và 19 tests qua. Candidate chưa deploy; chưa có field p75 hoặc UAT mới.

Limiter tìm kiếm tại `60cdf80` đã có [CI thành công](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40664001277)
và [browser journeys thành công](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40664001238).
Các run đó không kiểm chứng bản sửa `sizes` chưa push trong phiên này.

## Bằng chứng còn thiếu sau review 28/10

- Monitor theo lịch đã có lượt thành công; xem cập nhật 29/10 bên dưới về lỗi
  truy cập API ngắt quãng và bản sửa chẩn đoán/retry.
- P75 Core Web Vitals từ người dùng thật hoặc kết quả UAT có con người.

Xem [các bước kích hoạt](operations-activation.md) và
[kịch bản UAT](user-acceptance-check.md). Backup cần cấu hình secrets/variable bật;
monitor mặc định chạy theo lịch trên main nếu không chủ động tạm dừng. Kiểm thử
Playwright không được thay tên thành UAT thực tế.

## Monitor theo lịch và lỗi truy cập API — 29/10/2026

Đối chiếu GitHub trên commit `becf11e`: [#14](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40749226837),
[#15](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40785979562)
và [#16](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40806648978)
đều là `event=schedule`, `conclusion=success`. Đây là bằng chứng lịch tự kích hoạt
và kiểm tra đã chạy được sau bản sửa điều kiện job.

[#17](https://github.com/ITCrazy357/Roomora-Roommate-Matching-Shared-Living-Platform./actions/runs/40854191403)
lúc 17:01 ngày 29/10 (UTC+7) thất bại: direct/proxy đều `status=null`, home 200/CSP
hợp lệ, backup còn mới khoảng 10,75 giờ. #13 có cùng biểu hiện. Mã cũ gộp lỗi mạng,
timeout và lỗi đọc JSON thành null nên không thể phân biệt nguyên nhân từ log đó.
Không có bằng chứng lỗi backup hay lịch chưa bật. Kiểm tra GET công khai lúc
17:08 ngày 29/10: direct/proxy 200 với readiness hợp lệ; home 200/CSP hợp lệ.
Điều này chứng minh đã phục hồi lúc kiểm tra, không phủ nhận sự cố trước đó.

Bản sửa local giữ status đã nhận, thêm thời gian và mã lỗi an toàn, giữ lịch sử
từng lần thử; tăng từ 3 lần/3 giây nghỉ (khoảng 66 giây tối đa) lên 5 lần/5 giây
nghỉ (khoảng 120 giây tối đa). Job giới hạn 4 phút để còn thời gian setup và tra
metadata backup. Không gộp các endpoint thành công ở những lần khác nhau; vẫn lỗi
nếu không có một lần tất cả cùng đạt. Backup quá hạn/lỗi metadata vẫn làm job lỗi.
Không đổi lịch, không tạo traffic liên tục, không thay điều kiện schema/Redis/CSP.

8 kiểm thử monitor local qua: phân loại lỗi không lộ provider body, timeout khi
body chưa hoàn tất dù đã nhận HTTP 200, phục hồi và dừng retry sớm, hết 5 lần vẫn
unhealthy, cùng các kiểm tra schema và backup hiện có. Fixture không chứng minh
nguyên nhân hạ tầng. Chưa có kết quả GitHub Actions cho bản sửa local này.
Toàn bộ 18 kiểm thử script local qua, không skip; YAML và `git diff --check` qua.
Chạy CLI vừa sửa lúc 17:11 (UTC+7) với ba URL công khai đạt ngay lần đầu, cả ba
HTTP 200, `healthy=true`. Lượt local này không tra metadata artifact GitHub vì
không sử dụng token workflow, nên không thay thế lần chạy đầy đủ trên Actions.
