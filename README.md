<div align="center">

# Roomora

### Tìm đúng người ở ghép. Cùng nhau quản lý cuộc sống chung.

Nền tảng tìm phòng, kết nối bạn cùng nhà và quản lý chi tiêu chung dành cho người dùng Việt Nam.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Next.js 16](https://img.shields.io/badge/Next.js-16-171717?style=flat-square&logo=nextdotjs&logoColor=white)
![NestJS 12](https://img.shields.io/badge/NestJS-12-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)

[Khám phá tính năng](#tính-năng-chính) · [Chạy local](#chạy-local) · [Kiến trúc](#kiến-trúc) · [Tài liệu](#tài-liệu)

<img src="frontend/public/images/roomora-home.png" alt="Không gian sống với ánh sáng tự nhiên và ban công — hình minh họa của Roomora" width="720" />

<sub>Hình minh họa dùng trong ứng dụng.</sub>

</div>

## Vì sao có Roomora?

Tìm được phòng mới chỉ là bước đầu. Người ở ghép còn cần hiểu thói quen của nhau, thống nhất lịch gặp và biết rõ ai đã trả tiền, ai còn cần đóng góp.

Roomora kết nối các công việc đó trong một luồng: **tìm phòng hoặc người ở ghép → kết nối → trò chuyện, hẹn gặp → lập nhà chung → quản lý sinh hoạt và chi phí**. Thông tin tin đăng, trao đổi và sổ chi tiêu được tổ chức theo từng nghiệp vụ, với quyền truy cập theo tài khoản và nhà chung.

## Tính năng chính

| Nhóm | Người dùng có thể làm gì? |
| --- | --- |
| **Phòng & tin đăng** | Đăng tin cho thuê, tìm phòng hoặc tìm người ở ghép; lưu nháp, tải ảnh, tìm kiếm theo khu vực, ngân sách và tiện ích; lưu tin yêu thích. Tin công khai đi qua kiểm duyệt. |
| **Kết nối ở ghép** | Tìm hồ sơ theo nhu cầu và thói quen; xem mức độ phù hợp kèm lý do; gửi và quản lý lời mời kết nối, chặn hoặc báo cáo người dùng. |
| **Trò chuyện & lịch hẹn** | Nhắn tin, gửi ảnh và ghi âm; hẹn xem phòng hoặc gặp mặt; nhận thông báo và cập nhật qua Server-Sent Events (SSE). |
| **Nhà chung** | Tạo nhà, mời thành viên, phân quyền trưởng nhà, quản lý nội quy, thông báo, trò chuyện nhóm và bình chọn. |
| **Chi phí & sinh hoạt** | Ghi nhận khoản chi, chia phần đóng góp, theo dõi công nợ và xác nhận thanh toán; quản lý chi phí định kỳ, xem báo cáo tháng và xuất PDF. |
| **Trợ lý AI** | Soạn mô tả tin, đọc ảnh hóa đơn thành bản nháp, chuyển câu tìm kiếm thành bộ lọc, giải thích độ phù hợp và tóm tắt chi tiêu. Có xem trước và chỉnh sửa khi nhập liệu. |
| **Dịch vụ & quản trị** | Gói đẩy tin và lượt AI; tích hợp MoMo sandbox/PayOS, lịch sử thanh toán và quy trình hoàn tiền; kiểm duyệt, hỗ trợ, nhật ký quản trị và thống kê chi phí AI ước tính. |

### Một số nguyên tắc nghiệp vụ

- **Đối chiếu có giải thích:** điểm phù hợp dựa trên quy tắc và dữ liệu hồ sơ; AI hỗ trợ diễn giải các tiêu chí đã có.
- **Người dùng quyết định:** AI không tự tạo khoản chi, sửa công nợ hoặc xác nhận thanh toán. Các form vẫn có cách nhập thủ công.
- **Tách bạch tiền dịch vụ và tiền nhà:** billing xử lý gói dịch vụ Roomora; sổ chi phí nhà chung quản lý nghĩa vụ giữa các thành viên.
- **Ghi rõ phạm vi danh tính:** hồ sơ danh tính hiện là khai báo demo, chưa phải xác minh chính thức qua RAR/VNeID.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Giao diện | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| API | NestJS 12, TypeScript, Prisma ORM 7 |
| Dữ liệu | PostgreSQL 17; Redis cho rate limit và cache tile bản đồ |
| Cập nhật thời gian thực | SSE; tín hiệu cập nhật giữa các API instance qua PostgreSQL |
| Tích hợp | Cloudinary, Geoapify/Leaflet, SMTP, Google OAuth, OpenAI, MoMo sandbox, PayOS |
| Kiểm thử & triển khai | Vitest, Supertest, ESLint, Oxlint, Docker Compose, GitHub Actions, GHCR |

## Kiến trúc

```mermaid
flowchart LR
    Web["Next.js · React"] -->|"HTTP / cookie phiên"| API["NestJS API"]
    API --> DB[("PostgreSQL · Prisma")]
    API --> Redis[("Redis")]
    API --> Providers["Ảnh · Bản đồ · Email · AI · Thanh toán"]
    API -->|"SSE · thông báo và cập nhật"| Web
```

PostgreSQL lưu dữ liệu nghiệp vụ, phiên đăng nhập, công nợ, giao dịch và hàng đợi email. Redis phục vụ giới hạn tần suất dùng chung và cache bản đồ. Backend tổ chức theo module nghiệp vụ; các luồng lớn đi theo `Controller → service chính → service chuyên trách → Prisma / service dùng chung`.

```text
Roomora/
├── backend/             # NestJS API, Prisma schema, migrations và tests
├── frontend/            # Next.js App Router, giao diện và tài nguyên tĩnh
├── docs/                # Hướng dẫn tích hợp, nghiệp vụ và vận hành
├── deploy/              # Cấu hình môi trường triển khai và Caddy
├── scripts/             # Backup, kiểm tra phục hồi và đo tải
├── .github/workflows/   # CI và phát hành Docker images
├── compose.yml          # PostgreSQL + Redis cho local
└── compose.deploy.yml   # Bộ dịch vụ triển khai bằng Docker
```

Xem [cấu trúc service](backend/src/modules/README.md) để đi sâu vào từng nhóm nghiệp vụ.

## Chạy local

**Yêu cầu:** Node.js 22.23.2 trở lên thuộc nhánh 22 LTS, npm và Docker Compose. Các lệnh bên dưới dùng PowerShell, bắt đầu tại thư mục gốc repository.

### 1. Chuẩn bị cấu hình

Tạo các file dưới đây nếu chưa có. Nếu đã có cấu hình đang dùng, đối chiếu và cập nhật các giá trị cần thiết.

**`.env` tại thư mục gốc** — dùng cho PostgreSQL trong Docker:

```dotenv
POSTGRES_PASSWORD=replace_with_local_password
```

**`backend/.env`** — cấu hình tối thiểu cho API local:

```dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL="postgresql://roomora:replace_with_local_password@127.0.0.1:5433/roomora?schema=public"
FRONTEND_ORIGIN=http://localhost:3000
REDIS_URL=redis://127.0.0.1:6379/0
AUTH_DEV_EXPOSE_LINKS=true
AUTH_OTP_SECRET=
IDENTITY_ENCRYPTION_KEY=
IDENTITY_DECLARATION_REQUIRED=true
```

Thay `replace_with_local_password` bằng cùng một mật khẩu trong hai file; percent-encode ký tự đặc biệt khi đưa vào `DATABASE_URL`. Backend chạy trên máy host nên PostgreSQL dùng cổng **5433**.

Chạy lệnh sau **hai lần** để tạo hai khóa riêng, lần lượt điền vào `AUTH_OTP_SECRET` và `IDENTITY_ENCRYPTION_KEY`. Giữ ổn định khóa mã hóa danh tính khi database đã có dữ liệu.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**`frontend/.env.local`** — địa chỉ API:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1
```

Khi chưa cấu hình SMTP, `AUTH_DEV_EXPOSE_LINKS=true` cho phép giao diện development nhận OTP từ API với request loopback. Cờ này chỉ dùng ở development.

### 2. Khởi động dữ liệu và API

```powershell
docker compose up -d postgres redis
docker compose ps

Set-Location backend
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
```

Lệnh migrate áp dụng các migration có sẵn để chuẩn bị schema cho database local.

### 3. Khởi động giao diện

Mở terminal thứ hai tại thư mục gốc:

```powershell
Set-Location frontend
npm ci
npm run dev
```

| Địa chỉ local | Mục đích |
| --- | --- |
| [localhost:3000](http://localhost:3000) | Giao diện Roomora |
| [localhost:5000/api/v1](http://localhost:5000/api/v1) | Địa chỉ gốc API |
| [localhost:5000/api/v1/health](http://localhost:5000/api/v1/health) | Kiểm tra ứng dụng đang chạy |
| [localhost:5000/api/v1/health/ready](http://localhost:5000/api/v1/health/ready) | Kiểm tra PostgreSQL và Redis đã cấu hình |

### 4. Bật các tích hợp cần dùng

Các tính năng sau cần cấu hình thêm ở backend:

| Tính năng | Biến môi trường / hướng dẫn |
| --- | --- |
| Upload ảnh | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — [backend](backend/README.md#avatar-và-địa-chỉ-hồ-sơ) |
| Bản đồ | `GEOAPIFY_API_KEY` — [cấu hình bản đồ](docs/maps-setup.md) |
| Email thật | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `MAIL_FROM` và thông tin đăng nhập nếu cần — [OTP và email](docs/auth-otp.md) |
| Đăng nhập Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — [hướng dẫn Google](docs/google-login-guide.md) |
| Trợ lý AI & chatbot | `OPENAI_API_KEY`, `AI_MODEL`, `CHATBOT_MODEL` — [AI nghiệp vụ](backend/src/modules/ai/README.md), [chatbot hỗ trợ](docs/chat-widget.md) |
| Thanh toán dịch vụ | Chọn provider và cấu hình bộ khóa tương ứng — [billing](backend/src/modules/billing/README.md) |

PayOS sử dụng chuyển khoản thật; MoMo trong dự án dùng sandbox. Secret của các tích hợp chỉ đặt ở backend.

## Kiểm tra chất lượng

Chạy trong `backend/`:

```powershell
npm run prisma:validate
npm run lint
npm test
npm run build
```

Chạy trong `frontend/`:

```powershell
npm run lint
npm run test:api
npm run test:avatar
npm run build
```

Kiểm thử HTTP/E2E backend dùng PostgreSQL thật. Chuẩn bị **database kiểm thử riêng**, áp dụng migration và truyền cấu hình test qua biến môi trường trước khi chạy `npm run test:e2e`; `NODE_ENV=test` bỏ qua `backend/.env`. Xem cấu hình mẫu trong [workflow CI](.github/workflows/ci.yml).

## Triển khai

Repository có Docker image cho API, frontend và migration; Compose triển khai kèm Caddy, PostgreSQL và Redis. Workflow CI kiểm tra mã nguồn, migrations, tests và build images. Workflow phát hành xuất images lên GHCR theo commit SHA sau khi CI của lần push lên `main` thành công.

- [Hướng dẫn vận hành](docs/operations.md): cấu hình, triển khai, healthcheck, log và backup/restore.
- [Redis](docs/redis.md): rate limit dùng chung, cache và hành vi khi mất kết nối.
- [Frontend](frontend/README.md): cấu hình frontend, bao gồm phương án proxy Vercel → Render.

## Tài liệu

| Bạn muốn tìm hiểu | Bắt đầu từ |
| --- | --- |
| Cài đặt và API backend | [Backend README](backend/README.md) |
| Giao diện và cấu hình frontend | [Frontend README](frontend/README.md) |
| Cách chia module và service | [Cấu trúc service](backend/src/modules/README.md) |
| Lộ trình phát triển theo phase | [room.todo](backend/room.todo) |
| Quy tắc khoản chi và công nợ | [Expenses](backend/src/modules/expenses/README.md) |
| Thanh toán và hoàn tiền dịch vụ | [Billing](backend/src/modules/billing/README.md) |
| AI, lượt sử dụng và chi phí ước tính | [AI](backend/src/modules/ai/README.md) · [AI usage](backend/src/modules/ai-usage/README.md) |
| Khai báo danh tính demo | [Danh tính](docs/identity-verification.md) |
| Hệ thống giao diện | [Theme](docs/ui-theme.md) |
| MCP hỗ trợ phát triển và kiểm tra UI | [Cài đặt và kiểm chứng MCP](docs/mcp-setup.md) |

---

<div align="center">
  <sub>Roomora · Từ tìm người ở ghép đến quản lý cuộc sống chung.</sub>
</div>
