# Roomora backend

NestJS 12, Prisma ORM 7.10, PostgreSQL 17, Node.js 22.23+ (Node 22 LTS).

## Cài đặt local (PowerShell)

Tại thư mục gốc Roomora, tạo `.env` từ `.env.example` nếu chưa có và đặt
`POSTGRES_PASSWORD`. Không ghi đè `.env` đang dùng. Khởi động PostgreSQL:

```powershell
docker compose up -d postgres
docker compose ps
cd backend
```

Tạo `backend/.env` từ `backend/.env.example` nếu chưa có. `DATABASE_URL` phải dùng
cùng mật khẩu với `POSTGRES_PASSWORD`; percent-encode ký tự đặc biệt trong mật khẩu
khi đưa vào URL. Backend chạy trên máy host nên dùng `127.0.0.1:5433`.
Nếu sau này chạy backend trong cùng mạng Compose, dùng `postgres:5432`.

```powershell
npm ci
npm run prisma:validate
npm run prisma:generate
npm run start:dev
```

API mặc định ở `http://localhost:5000/api/v1`. Đặt `FRONTEND_ORIGIN=http://localhost:3000`
trong `.env` để cho phép frontend local gọi API. Khi khởi động, `PrismaService` kết nối và
chạy `SELECT 1`; log `PostgreSQL connected` xác nhận truy vấn thành công.

Các request thay đổi dữ liệu phải có `Origin` đúng bằng `FRONTEND_ORIGIN`. Frontend gửi
cookie phiên với `credentials: include`; CORS chỉ cho phép origin đã cấu hình và bật
credentials. Không dùng wildcard origin cho API này.

`GET /api/v1/health` kiểm tra ứng dụng. `GET /api/v1/health/ready` chạy `SELECT 1`
qua PrismaService, trả 200 khi database hoạt động và 503 khi truy vấn lỗi.
Xem kết quả kiểm tra trong `../FOUNDATION_STATUS.md`.

## Cấu trúc Prisma

- `prisma7.config.ts`: nạp `.env`, cấu hình URL database và đường dẫn schema/migrations.
  Đây là tên config được CLI Prisma 7.10 đang cài nhận diện tự động.
- `prisma/schema.prisma`: tài khoản, hồ sơ, session và token dùng một lần.
- `src/generated/prisma/`: Prisma Client được generate, không sửa tay hoặc commit.
- `src/database/prisma.module.ts`: cung cấp và export `PrismaService`.
  Module nghiệp vụ cần database thì import `PrismaModule`.
- `src/database/prisma.service.ts`: khởi tạo adapter PostgreSQL, kiểm tra kết nối và
  đóng kết nối khi Nest shutdown.

Các lệnh `build`, `start`, `start:dev`, `start:debug` tự generate client trước khi
chạy. Sau khi sửa schema trong lúc watch đang chạy, chạy lại `npm run prisma:generate`.

## Schema và migrations

Phase 2 có migration tạo tài khoản và `20260924170000_remove_google_auth` gỡ Google.
Migration gỡ Google chỉ chạy khi hai bảng OAuth rỗng và mọi tài khoản có mật khẩu;
nếu không thỏa điều kiện, transaction dừng trước khi xóa bảng. Không sửa migration cũ.
Kiểm tra trạng thái
và áp dụng migration đã duyệt bằng lệnh an toàn sau:

```powershell
npm run prisma:migrate:status
npm run prisma:migrate:deploy
```

Không dùng `migrate reset` hoặc `db push` với database đang chứa dữ liệu. Khi tạo
migration mới, kiểm tra SQL và commit `prisma/migrations/` cùng schema.

```powershell
npm run prisma:migrate:status
npm run prisma:studio
```

## Tài khoản và email

Các API chính nằm dưới `/api/v1/auth` và `/api/v1/profiles`: đăng ký/đăng nhập,
xác minh email, quên/đặt lại mật khẩu, phiên đăng nhập, hồ sơ riêng
và hồ sơ công khai. Mật khẩu dùng scrypt; cookie phiên là `HttpOnly`, `SameSite=Lax`
và `Secure` ở production; token phiên/xác minh/reset chỉ lưu dạng SHA-256 trong DB.

Local có thể đặt `AUTH_DEV_EXPOSE_LINKS=true` để response đăng ký/quên mật khẩu trả
liên kết hành động cho UI development. Link chỉ được trả cho request từ loopback;
validator cấm bật cờ này ở production.

Để gửi email thật, cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `MAIL_FROM` và
nếu cần `SMTP_USER` + `SMTP_PASSWORD`. Nếu chưa có SMTP, API báo `emailSent: false`;
không ghi token vào log.

Google đã được gỡ theo phạm vi học tập. Thêm biến môi trường sẽ không bật lại tính năng.
Xem [bài hướng dẫn tự triển khai](../docs/google-login-guide.md).

## Kiểm tra và chạy bản build

```powershell
npm run build
npm run lint
npm test
npm run test:e2e
npm run start:prod
```

E2E hiện dùng PostgreSQL thật từ `DATABASE_URL`; cần database hoạt động.
`start:prod` chạy `dist/main.js` đã được tạo bởi `npm run build`.
