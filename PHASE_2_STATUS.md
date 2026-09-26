# Roomora — kiểm tra lại Phase 2

Ngày 24/09/2026. Phạm vi hiện tại: tài khoản email/mật khẩu và hồ sơ cá nhân.
Google đã được gỡ theo yêu cầu để người học tự triển khai sau.

## Cấu trúc và cách đọc

Cấu trúc phù hợp với ứng dụng hiện tại; chưa cần thêm tầng repository, microservice
hoặc thư viện quản lý form. Giữ một PrismaModule/PrismaService dùng chung.

| Vị trí | Trách nhiệm |
| --- | --- |
| backend/src/database/ | Kết nối PostgreSQL qua Prisma |
| backend/src/common/ | Origin guard và kiểu request đăng nhập |
| modules/auth/auth.controller.ts | Nhận request, gọi service |
| modules/auth/auth.service.ts | Đăng ký, đăng nhập, xác minh, đặt lại mật khẩu |
| modules/auth/session.service.ts | Tạo, kiểm tra và thu hồi phiên |
| modules/auth/password.service.ts | Hash/kiểm tra mật khẩu scrypt |
| modules/auth/mail.service.ts | Gửi email |
| modules/auth/dto/ | Kiểm tra dữ liệu đầu vào |
| modules/profile/ | Đọc/sửa hồ sơ và lọc quyền riêng tư |
| frontend/src/app/dang-nhap/, dang-ky/ | Page và form riêng cho mỗi luồng |
| frontend/src/components/auth-card.tsx | Khung giao diện auth dùng chung |
| frontend/src/components/auth-provider.tsx | Trạng thái người dùng hiện tại |
| frontend/src/components/ui.tsx | Input, Button, Card, ErrorState |
| frontend/src/lib/api.ts | Request, cookie, timeout và lỗi |

Các đường dẫn modules/ thuộc backend/src/. Hai form giữ riêng vì dữ liệu và kết quả
khác nhau. Dùng FormData, useState và component có sẵn, không tạo bộ cấu hình form tổng quát.

Tên biến: giữ user, email, password, profile, sessions, error, pending khi đã rõ nghĩa.
Đổi passwordConfirmation thành confirmPassword, valid thành passwordMatches,
consumeRate thành checkRateLimit. Không rút passwordHash thành pwd hoặc đổi trường
API/database chỉ để ít ký tự.

## Những thay đổi của lần kiểm tra này

- Gỡ service Google, provider trong module, cookie state, route /auth/config,
  /auth/google, /auth/google/callback, UI và cấu hình GOOGLE_*.
- Gỡ model OAuth và yêu cầu passwordHash có giá trị. Migration mới
  20260924170000_remove_google_auth đã được áp dụng bằng prisma migrate deploy.
  Trước khi chạy đã xác nhận hai bảng OAuth rỗng và không có tài khoản thiếu mật khẩu.
  SQL khóa bảng, kiểm tra lại điều kiện và rollback nếu có dữ liệu; giữ nguyên
  migration gốc, không reset database.
- Hồ sơ từ chối null cho tên, visibility, danh sách khu vực và các cờ boolean
  bằng HTTP 400. Các trường cho phép xóa như bio/ngân sách vẫn nhận null.
- URL ảnh đại diện yêu cầu HTTPS, khớp hướng dẫn trên giao diện.
- Rate limit dọn mục hết hạn cả khi nhận key mới; thêm hạn mức theo IP để đổi
  email liên tục không vượt qua toàn bộ giới hạn đăng nhập/gửi email.
- Đăng nhập và xác minh dùng ngay user API trả về, bỏ request /auth/me thừa.
  Đăng xuất lỗi mạng giữ trạng thái hiện tại và báo lỗi; thành công về /dang-nhap,
  thống nhất với điều hướng của trang yêu cầu đăng nhập.
- Đăng nhập/đăng ký dùng nền kem #F8F7F4, thẻ trắng, xanh #0F766E, nền xanh nhạt
  #E1F8F6 và điểm nhấn đào #FDE6D2. Dùng Be Vietnam Pro và ảnh có sẵn;
  màn nhỏ ẩn ảnh, xếp một cột. Form có label, autocomplete, focus và alert lỗi.

## Luồng chạy

Đăng ký → kiểm tra DTO → hash mật khẩu → tạo User/Profile → tạo token xác minh
→ gửi email hoặc trả link development cho loopback.

Xác minh → kiểm tra token một lần → cập nhật email đã xác minh → tạo session
PostgreSQL và cookie HttpOnly → frontend nhận user → mở trang thiết lập hồ sơ.

Đăng nhập → kiểm tra mật khẩu/email đã xác minh → tạo session → frontend nhận user
→ mở hồ sơ nếu đã onboarding, nếu chưa thì mở /onboarding.

Request hồ sơ qua AuthGuard; ProfileService lọc dữ liệu theo chủ sở hữu và quyền
riêng tư. Reset mật khẩu thu hồi mọi session cũ.

## Biến môi trường

.env, kể cả .env.example, và design-reference/ tiếp tục chỉ ở local. Lần này chỉ sửa
mẫu backend/.env.example, không thay credential .env đang dùng.

| File | Biến | Giá trị hoặc mục đích |
| --- | --- | --- |
| .env ở gốc | POSTGRES_PASSWORD | Mật khẩu PostgreSQL local |
| backend/.env | DATABASE_URL | URL PostgreSQL, mật khẩu khớp file gốc; host local 127.0.0.1:5433 |
| backend/.env | PORT | 5000 |
| backend/.env | NODE_ENV | development |
| backend/.env | FRONTEND_ORIGIN | http://localhost:3000 |
| backend/.env | AUTH_DEV_EXPOSE_LINKS | true khi học local; false ở production |
| frontend/.env.local | NEXT_PUBLIC_API_BASE_URL | http://localhost:5000/api/v1 |

Đã kiểm tra các tên biến backend và frontend trên đều có trong file local.
Để gửi email thật, bổ sung SMTP_HOST, SMTP_PORT, SMTP_SECURE, MAIL_FROM vào
backend/.env; thêm cặp SMTP_USER và SMTP_PASSWORD nếu máy chủ yêu cầu đăng nhập.
Giá trị phải theo nhà cung cấp SMTP. Có mẫu trong backend/.env.example.

Không cần JWT_SECRET vì hệ thống dùng token session ngẫu nhiên, không dùng JWT.
Hiện không cần biến Google. Khi tự làm lại, đọc [hướng dẫn Google](docs/google-login-guide.md).

## Kiểm tra lần này

- Prisma format/validate/generate, migration deploy: đạt.
- Backend build/lint: đạt. Unit: 3 file, 6 test. E2E: 3 file, 6 test với PostgreSQL thật.
  Đã thêm kiểm tra route Google trả 404, null bị từ chối, HTTPS avatar, token không
  dùng lại được, rate limit theo IP và mở lại sau khi hết thời hạn.
- Frontend lint, TypeScript, production build: đạt. API tests: 8/8.
- Chrome headless với API/database thật: 8 nhóm kiểm tra đăng ký, xác minh,
  onboarding, hồ sơ, privacy và session đạt. Email chạy bằng link development.
- Chrome headless bổ sung: 16 nhóm kiểm tra đạt. Hai trang auth ở 320/390/768/1440px
  không tràn ngang; focus bàn phím và nút tối thiểu 44px hoạt động. Kiểm tra mật khẩu
  không khớp, sai mật khẩu, lỗi mạng login, login không gọi lại /auth/me, logout
  lỗi mạng vẫn giữ session và logout thành công thu hồi session đều đạt.
  Không còn request OAuth/config hoặc lỗi JavaScript chưa được xử lý.
- Đã xóa các tài khoản kiểm thử trình duyệt; script và ảnh kiểm tra nằm trong
  .verification/ (được gitignore). E2E tự dọn tài khoản riêng của nó.

## Giới hạn

Chưa kiểm chứng gửi SMTP thật vì chưa có cấu hình nhà cung cấp. Chế độ development
trả link không chứng minh email đã gửi. Rate limit vẫn theo một tiến trình; khi chạy
nhiều backend cần kho đếm chung. Avatar hiện nhận URL, chưa có upload file.
Đây là kết quả local, chưa phải xác nhận sẵn sàng production.
