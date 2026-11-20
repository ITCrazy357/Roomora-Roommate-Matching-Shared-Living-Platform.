# Test đăng nhập đồng thời bằng k6

Chạy các lệnh dưới đây từ thư mục gốc Roomora. Script chỉ test API đăng nhập bằng
email/mật khẩu, không test Google OAuth hay thao tác trình duyệt.

## 1. Chuẩn bị tài khoản và backend

- Backend local cùng PostgreSQL và Redis (nếu cấu hình) phải hoạt động.
- Dùng database test riêng. Mỗi VU cần một tài khoản khác nhau, có mật khẩu,
  email đã xác minh, tài khoản không bị khóa/đóng. Dùng tài khoản thường để
  tránh các quy tắc truy cập riêng cho ADMIN.
- Không dùng script này để đăng ký hàng loạt hoặc gửi OTP. Các tài khoản trong
  `users.example.json` chỉ minh họa, chưa tồn tại trong database.
- Fixture `backend/scripts/phase12-fixture.mjs` hiện tạo users không có
  `passwordHash`; những users đó không dùng được cho test đăng nhập mật khẩu.

Tạo file cục bộ (thư mục `.verification/` đã được Git ignore):

```powershell
New-Item -ItemType Directory -Force .verification | Out-Null
if (!(Test-Path .verification/k6-users.json)) {
  Copy-Item scripts/k6/users.example.json .verification/k6-users.json
}
```

Sửa `.verification/k6-users.json` bằng editor, thay bằng thông tin các tài khoản
test có thật. Muốn chạy 25 VU cần tối thiểu 25 dòng tài khoản, không lặp email.
Không đưa mật khẩu/cookie vào lệnh terminal, Git, log hay `--http-debug`.

## 2. Cấu hình đích và Origin

```powershell
$env:LOAD_BASE_URL = 'http://127.0.0.1:5000/api/v1'
$env:FRONTEND_ORIGIN = 'http://localhost:3000'
```

URL và Origin trên là ví dụ local. `FRONTEND_ORIGIN` phải khớp CHÍNH XÁC giá trị
backend đang dùng (gồm giao thức, hostname, port; không có dấu `/` ở cuối).
Script gửi header `Origin` ở login và logout để tuân thủ `OriginGuard`.
Production dùng cookie `Secure`, cần đích HTTPS để kiểm tra phiên đúng cách.

Mặc định từ chối host ngoài loopback. Chỉ khi có quyền test server đích:

```powershell
$env:LOAD_ALLOW_REMOTE = 'true'
```

Không cần bật biến này khi test local. Không chạy `k6 cloud run` với file tài
khoản: các lệnh trong hướng dẫn dùng `k6 run` cục bộ.

## 3. Smoke: một người đăng nhập

```powershell
$env:TEST_VUS = '1'
$env:TEST_ME_READS = '1'
k6 run scripts/k6/login.js
```

Mỗi VU thực hiện đúng một lần:

1. Đọc một tài khoản riêng từ file, POST `/auth/login`.
2. Kiểm tra HTTP 200 và danh tính trả về.
3. k6 tự lưu cookie riêng cho VU; GET `/auth/me`, kiểm tra đúng user ID/email.
4. POST `/auth/logout` trong `finally` để thu hồi phiên vừa tạo.

Logout thất bại hoặc tiến trình bị ngắt có thể để lại phiên test còn hiệu lực.
Test tạo bản ghi session và có thể nâng cấp hash mật khẩu cũ theo logic login
hiện tại; logout thu hồi phiên, không xóa bản ghi session. Dùng DB test riêng.

## 4. Burst: nhiều người bắt đầu đăng nhập cùng đợt

Sau khi smoke thành công và đã đủ tài khoản:

```powershell
$env:TEST_VUS = '10'
k6 run scripts/k6/login.js
```

Sau đó:

```powershell
$env:TEST_VUS = '25'
k6 run scripts/k6/login.js
```

`per-vu-iterations`, một iteration/VU, cho một đợt khởi chạy đồng thời; không
đảm bảo mọi request đến server đúng cùng một mili giây. Không dùng `--vus`,
`--iterations`, `--duration` hoặc `--stage` để sửa scenario này. Dùng `TEST_VUS`.

Roomora giới hạn **50 lần login/IP/15 phút**, **10 lần/IP + email/15 phút**.
Chuỗi 1 + 10 + 25 dùng 36 lần/IP nếu không có các lần login khác. Chạy tiếp
có thể nhận 429. Lượt lỗi cũng có thể tiêu thụ hạn mức; logout không reset nó.
Script giới hạn tối đa 50 VU/lần, không bỏ qua rate limiter, không giả IP.
Nếu gặp 429, chờ cửa sổ 15 phút hết hạn; không tắt bảo vệ production.

Muốn đo trên 50 lượt login từ cùng IP trong cửa sổ này cần kế hoạch riêng cho
staging/máy phát tải. Tăng TEST_VUS đơn thuần sẽ không đo được sức tải login.

## 5. Đọc API khi các phiên đang đăng nhập

```powershell
$env:TEST_VUS = '10'
$env:TEST_ME_READS = '30'
k6 run scripts/k6/login.js
```

Mỗi VU login một lần, gọi `/auth/me` 30 lần, nghỉ một giây giữa các lần đọc rồi
logout. Đây là tải đọc phiên sau đăng nhập, không phải login lặp liên tục.
`TEST_ME_READS` nhận 1–60. Mỗi lần chạy lệnh vẫn tiêu thụ thêm lượt login.

## 6. Đọc và lưu kết quả

| Metric                          | Ý nghĩa                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `login_success`                 | Tỷ lệ HTTP 200 kèm đúng tài khoản                                       |
| `session_success`               | Tỷ lệ kiểm tra cookie/danh tính thành công; login lỗi ghi một mẫu false |
| `journey_success`               | Tỷ lệ hoàn tất login, tất cả lần đọc và logout thành công               |
| `login_rate_limited`            | Tỷ lệ login bị 429, phải tách khỏi lỗi quá tải                          |
| `completed_journeys`            | Số hành trình đã kết thúc; phải bằng TEST_VUS                           |
| `http_req_duration{step:login}` | Độ trễ login, gồm cả response lỗi nếu có                                |
| `http_req_duration{step:me}`    | Độ trễ API đọc phiên                                                    |
| `http_req_failed`               | Lỗi HTTP/network trên login, me và logout                               |

Ngưỡng mẫu: tất cả checks/hành trình thành công, không có lỗi HTTP/network,
không có 429, login p95 < 2000 ms và me p95 < 1000 ms. Đây là mục tiêu khởi đầu
để điều chỉnh, không phải SLA đã được chứng minh của Roomora. Một mẫu smoke
hoặc 25 lần login chưa đủ để kết luận p99 ổn định hay sức tải production.

```powershell
$env:LOGIN_P95_MS = '3000'
$env:ME_P95_MS = '1000'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
k6 run --summary-export ".verification/k6-login-$stamp.json" scripts/k6/login.js
$LASTEXITCODE
```

Exit code khác 0 nghĩa là cần kiểm tra lỗi chạy/ngưỡng. Đừng chỉ nhìn thời gian
phản hồi: response 429 nhanh vẫn làm test thất bại. Khi đo, theo dõi thêm CPU,
RAM, PostgreSQL connection pool và log backend; nếu k6 và backend cùng máy,
chúng chia sẻ tài nguyên và kết quả không đại diện trực tiếp cho server thật.

| Triệu chứng       | Kiểm tra                                                                           |
| ----------------- | ---------------------------------------------------------------------------------- |
| 401 ở login       | Email/mật khẩu và tài khoản có passwordHash                                        |
| 403 ở login       | Origin đúng cấu hình, email đã xác minh, tài khoản không bị khóa/đóng              |
| 401 ở me          | Cookie từ login, HTTPS với cookie Secure, dùng nhất quán hostname                  |
| 429               | Rate limit IP/email; chờ cửa sổ hết hạn                                            |
| 503               | Readiness, Redis và log backend, có thể limiter không khả dụng                     |
| HTTP 0 / timeout  | Backend, địa chỉ/cổng, mạng hoặc TLS                                               |
| Không tìm thấy k6 | Mở terminal mới hoặc dùng `& 'C:\Program Files\k6\k6.exe' run scripts/k6/login.js` |

Script không in email, mật khẩu, cookie hay response body. Có lỗi chỉ ghi bước,
VU và HTTP status. Nếu đã login thành công, luôn thử logout khi kết thúc; không
retry login tự động để tránh tạo thêm tải và làm sai số liệu.

Tài liệu k6: [per-VU iterations](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/per-vu-iterations/),
[cookies](https://grafana.com/docs/k6/latest/using-k6/cookies/),
[thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/).
