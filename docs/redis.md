# Redis trong Roomora

Triển khai ngày 15/10/2026: Redis cho rate limiting dùng chung và cache tile bản đồ.
PostgreSQL tiếp tục là nguồn dữ liệu nghiệp vụ. Không cần migration schema mới.

## Đánh giá các trường hợp sử dụng

| Trường hợp | Quyết định và lý do trong code hiện tại |
| --- | --- |
| Rate limiting | Đã triển khai: thay bốn bộ đếm Map riêng của auth, chatbot, avatar và hoàn tiền bằng `RateLimitService`. Một giới hạn dùng chung cho các API instance. |
| Caching | Đã triển khai cache Redis cho tile Geoapify công khai; cache RAM cũ vẫn giảm truy cập Redis ở instance vừa tải tile. Tile trên instance khác được đọc từ Redis. |
| Session store | Giữ PostgreSQL: `SessionService`, AuthGuard và SSE kiểm tra session/revocation trong DB. Cache session sẽ cần cơ chế vô hiệu hóa khi khóa, đóng tài khoản hoặc thu hồi phiên. Chưa có số liệu chứng minh cần đổi. |
| Pub/sub, realtime | Đã có PostgreSQL `LISTEN/NOTIFY` trong `UpdatesService`/`NotificationsService`, phát sau khi transaction commit; SSE có sync định kỳ để bù sự kiện bị lỡ. Thay bằng Redis Pub/Sub sẽ thêm bước đồng bộ hai kho dữ liệu. |
| Message queue | Email đã có queue PostgreSQL, retry, lease và `FOR UPDATE SKIP LOCKED`. Chuyển sang BullMQ cần outbox để tránh commit nghiệp vụ thành công nhưng enqueue thất bại. Chưa có nhu cầu đo được để thay queue. |
| Realtime analytics | Dashboard đọc dữ liệu nghiệp vụ từ DB. Chưa có luồng thu thập sự kiện analytics, retention hoặc tải đo được để xây bộ đếm Redis riêng. |
| Cache tin đăng/hồ sơ/tài chính/AI | Chưa thêm: kết quả phụ thuộc quyền, chặn người dùng, moderation, phiên bản khoản chi, số dư/quota AI. Cache cần thiết kế invalidation và bằng chứng truy vấn chậm trước. AI summary hiện đã có bản lưu và điều kiện tái sử dụng trong DB. |

## Rate limiting

`backend/src/redis/redis.service.ts` dùng Lua để kiểm tra, tăng bộ đếm và đặt TTL
trong cùng một lệnh nguyên tử. Cửa sổ bắt đầu từ request đầu tiên; request bị chặn
không kéo dài cửa sổ. Giữ nguyên ngưỡng và mã lỗi 429 của từng luồng:

| Luồng | Giới hạn |
| --- | --- |
| Đăng ký | 5/IP/giờ |
| Đăng nhập | 50/IP/15 phút và 10/IP + email/15 phút |
| Gửi OTP ngoài đăng ký | 20/loại OTP + IP/giờ |
| Xác nhận OTP | 60/IP/15 phút |
| Đặt lại mật khẩu | 20/IP/15 phút |
| Google login | 30/IP/10 phút |
| Liên kết Google | 5/user/10 phút |
| Chatbot FAQ | 20/IP/phút |
| Tải avatar | 10/user/10 phút |
| Hoàn tiền | USER 20/user/phút; ADMIN 60/user/phút |

Các giới hạn theo email/OTP, lịch sử kết nối, báo cáo và quota/credit AI trong
PostgreSQL vẫn được áp dụng. Redis không thay thế tính toàn vẹn nghiệp vụ.
Redis key dùng prefix và SHA-256 của định danh có namespace; không lưu IP/email
nguyên văn trong key hoặc log. Hash không được coi là cơ chế ẩn danh hoàn toàn.

## Cache và tình huống lỗi

- Tile Redis có TTL 300 giây, tối đa 128 tile/prefix; chỉ cache tile <=512 KiB.
  ZSET và Lua giới hạn số entry giữa các instance, dùng thời gian Redis để tránh
  lệch đồng hồ giữa các backend. Dữ liệu base64 tối đa khoảng 86 MiB, chưa tính overhead.
- Tile lớn hơn vẫn trả về theo giới hạn 2 MiB hiện có và dùng cache RAM cũ.
  Không cache truy vấn địa chỉ riêng tư, cookie, OTP, hồ sơ hay dữ liệu tài chính.
- Deadline ở tầng ứng dụng giới hạn mỗi Redis command trong 1 giây, gồm cả thời
  gian chờ phản hồi sau khi gửi. Không xếp lệnh offline; client tự reconnect,
  heartbeat 5 giây và socket timeout 10 giây để thu hồi kết nối bị treo.
  Startup có Redis URL nhưng không kết nối được trong 4 giây sẽ báo lỗi khởi động.
- Mất Redis khi đang chạy: thao tác có rate limit trả 503 `RATE_LIMIT_UNAVAILABLE`,
  không chuyển ngầm sang bộ đếm RAM từng instance. Cache lỗi thì gọi Geoapify.
  Readiness trả 503 với `redis: down`; liveness vẫn hoạt động.
- Không cấu hình Redis: chỉ development/test được dùng RAM tối đa 10.000 bucket;
  không loại bucket đang hiệu lực để nhận key mới. Production bắt buộc `REDIS_URL`.
- Compose đặt `maxmemory 256mb`, `noeviction` để cache không đẩy mất bộ đếm đang
  hiệu lực, và AOF trên volume riêng. Khi đầy bộ nhớ, Redis có thể từ chối ghi;
  rate limit trả 503, cache bỏ qua. Theo dõi `used_memory`, `rejected_connections`,
  lỗi ghi và dung lượng volume. AOF mặc định fsync mỗi giây; crash vẫn có thể mất
  bộ đếm rất gần thời điểm crash. Redis không phải sổ giao dịch tài chính.

## Cấu hình và vận hành

Local, tại gốc repo:

```powershell
docker compose up -d redis
docker compose exec redis redis-cli ping
```

Trong `backend/.env`:

```dotenv
REDIS_URL=redis://127.0.0.1:6379/0
REDIS_KEY_PREFIX=roomora
```

Khởi động lại backend để đọc biến môi trường mới. Health:
`GET /api/v1/health/ready` có `redis: up | down | disabled`.
Production dùng `deploy/environment.example`, hostname `redis`, không mở cổng Redis
ra host. Mỗi môi trường dùng Redis/volume riêng. Khi dùng Redis ngoài Compose,
dùng credentials và `rediss://` theo cấu hình nhà cung cấp; giữ URL ở backend.
Các instance cùng môi trường phải dùng cùng Redis URL, database index và prefix.

Không `FLUSHDB`, xóa volume hoặc đổi prefix để chữa lỗi Redis: các thao tác này
sẽ reset rate limit. Khôi phục dịch vụ/kết nối và kiểm tra readiness trước.

## Kiểm thử

Unit tests mặc định kiểm tra chế độ RAM và từ chối thao tác khi Redis lỗi.
Các bài tích hợp được bật bằng biến riêng, không nạp URL Redis thật từ `.env`:

```powershell
cd backend
$env:REDIS_TEST_URL = 'redis://127.0.0.1:6379/15'
npm test
# Chỉ chạy với DATABASE_URL trỏ tới database test riêng đã migrate.
$env:NODE_ENV = 'test'
npm run test:e2e -- --testTimeout=30000 --hookTimeout=60000
```

`redis.integration.spec.ts` kiểm tra hai client đồng thời, TTL, cache binary, giới
hạn cache và mất kết nối. `redis.e2e-spec.ts` chạy hai Nest app qua HTTP, xác minh
20/80 chatbot request được chấp nhận, giới hạn login dùng chung, lỗi 503 và kết
nối lại vẫn giữ bộ đếm. Chỉ FAQ trả lời được stub; guard/client Redis là thật.
Test dùng prefix UUID riêng và chỉ xóa các key của prefix đó, không `FLUSHDB`.
CI cung cấp Redis 7.4 cùng PostgreSQL để chạy các bài này.

Kiểm chứng local ngày 15/10/2026: build backend qua, 172 unit test và 5 Redis
integration test qua; 425 E2E qua trên database test riêng đã migrate. Sau chỉnh
deadline, chạy lại 16 E2E Redis/health/OTP đều qua. Thử `CLIENT PAUSE` trên Redis
thật: thao tác trả 503 sau khoảng 1 giây (1.008 ms); stop/start Redis giữ bộ đếm
qua AOF, client tự reconnect và tiếp tục
trả 429 cho cửa sổ đã hết lượt. Đây là kiểm tra tính đúng đắn và phục hồi, chưa
phải benchmark sức tải production hoặc nghiệm thu Geoapify/SMTP/AI thật.

Lint không có lỗi, còn 5 cảnh báo `sort()` không truyền comparator trong test cũ.
`tsc --noEmit` bao gồm cả test vẫn báo 19 lỗi typing ở `auth-otp`, `billing`,
`phase-10`, `service-refunds` (body `unknown`, cookie nullable và mock provider).
Các dòng đó không thay đổi trong lần tích hợp Redis; build source backend vẫn qua.

Tài liệu đối chiếu: [Redis INCR và Lua để tránh race khi đặt TTL](https://redis.io/docs/latest/commands/incr/),
[Node Redis: kết nối và xử lý lỗi trong production](https://redis.io/docs/latest/develop/clients/nodejs/produsage/).
