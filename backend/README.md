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

`GET /api/v1/health` kiểm tra ứng dụng. `GET /api/v1/health/ready` chạy `SELECT 1`
qua PrismaService, trả 200 khi database hoạt động và 503 khi truy vấn lỗi.
Xem kết quả kiểm tra trong `../FOUNDATION_STATUS.md`.

## Cấu trúc Prisma

- `prisma7.config.ts`: nạp `.env`, cấu hình URL database và đường dẫn schema/migrations.
  Đây là tên config được CLI Prisma 7.10 đang cài nhận diện tự động.
- `prisma/schema.prisma`: khai báo PostgreSQL và generator ESM. Chưa có model nghiệp vụ.
- `src/generated/prisma/`: Prisma Client được generate, không sửa tay hoặc commit.
- `src/prisma/prisma.module.ts`: cung cấp và export `PrismaService`.
  Module nghiệp vụ cần database thì import `PrismaModule`.
- `src/prisma/prisma.service.ts`: khởi tạo adapter PostgreSQL, kiểm tra kết nối và
  đóng kết nối khi Nest shutdown.

Các lệnh `build`, `start`, `start:dev`, `start:debug` tự generate client trước khi
chạy. Sau khi sửa schema trong lúc watch đang chạy, chạy lại `npm run prisma:generate`.

## Schema và migrations

Hiện chưa có model hoặc migration. Không cần tạo bảng mẫu để khởi động backend.
Sau khi thêm model nghiệp vụ, tạo migration trên database phát triển:

```powershell
npm run prisma:format
npm run prisma:validate
npm run prisma:migrate:dev -- --name init
npm run prisma:generate
```

Kiểm tra SQL và commit `prisma/migrations/` cùng schema. Trên môi trường triển khai,
áp dụng các migration đã được duyệt bằng `npm run prisma:migrate:deploy`.
Không dùng `migrate reset` hoặc `db push` để sửa database đang chứa dữ liệu.

```powershell
npm run prisma:migrate:status
npm run prisma:studio
```

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
