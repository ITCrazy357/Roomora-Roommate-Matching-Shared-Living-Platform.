# Roomora — trạng thái nền tảng

Kiểm tra ngày 19/09/2026. Không tìm thấy kế hoạch phase trong repository;
báo cáo này chỉ xác nhận các hạng mục dưới đây.

## Kết quả

| Hạng mục | Kết quả thực tế |
| --- | --- |
| Liveness | Server hiện có trả `GET /api/v1/health` HTTP 200 |
| Readiness | Server hiện có trả `GET /api/v1/health/ready` HTTP 200; controller chạy `SELECT 1` qua PrismaService |
| Database lỗi | Test HTTP với Prisma mock thất bại trả 503, không lộ lỗi/credentials; không ngắt database đang chạy |
| Prisma config | `prisma generate` và `prisma validate` đều báo `Loaded Prisma config from prisma7.config.ts` |
| Backend | Build, lint, 1 unit test và 4 E2E test đạt |
| Frontend | Build, lint và 7 test fetch đạt |
| Trình duyệt | Chrome headless: 11 nhóm kiểm tra đạt trên server dev hiện có |
| CORS | Request thật từ `http://localhost:3000` đến backend `http://localhost:5000`; cả hai health endpoint trả 200 và `Access-Control-Allow-Origin: http://localhost:3000` |
| Responsive | Không tràn ngang tại 320, 390, 768, 1440px; đã xem ảnh desktop/mobile |
| Menu | Enter/Space mở, Escape đóng và trả focus, Tab/Enter điều hướng và đóng menu |
| API UI | Loading, thành công, HTTP 503, lỗi mạng, timeout 8 giây và thử lại đều đã kiểm tra trong trình duyệt |
| Production | Chạy bản build trên cổng tạm: trang chủ 200; `/dev/health` trả 404, không hiển thị panel kỹ thuật |

Lint backend có warning đã tồn tại tại `environment.validation.ts`: chuyển
`config.PORT` kiểu unknown sang String (`no-base-to-string`). Không đổi logic
validation của người dùng. Test frontend có cảnh báo Node suy luận module type
khi đọc file TypeScript; test vẫn đạt. Vitest báo khuyến nghị về plugin
`vite-tsconfig-paths` hiện có; chưa thay đổi cấu hình test ngoài phạm vi.

## File thay đổi

| File | Mục đích |
| --- | --- |
| `backend/src/modules/health/health.module.ts` | Import PrismaModule hiện có để controller inject PrismaService |
| `backend/test/health.e2e-spec.ts` | Kiểm tra HTTP 200/503, SELECT 1, no-store, không lộ lỗi |
| `backend/.env.example` | Bổ sung NODE_ENV và FRONTEND_ORIGIN |
| `backend/README.md` | Cập nhật URL API và health check |
| `frontend/src/lib/api.ts` | Fetch JSON, lỗi HTTP/mạng/response/config, timeout, hủy request |
| `frontend/src/app/dev/health/page.tsx` | Chặn dev route từ phía server ngoài development |
| `frontend/src/app/dev/health/health-panel.tsx` | Gọi API từ trình duyệt, loading/kết quả/thử lại |
| `frontend/src/components/site-header.tsx` | Thương hiệu, điều hướng desktop/mobile, keyboard/focus |
| `frontend/src/components/ui.tsx` | Button/ButtonLink, Input có label/hint/error, Card, Badge, loading/empty/error |
| `frontend/src/app/layout.tsx` | Metadata Roomora, lang vi, Be Vietnam Pro, header/footer, skip link |
| `frontend/src/app/globals.css` | Design tokens, Tailwind 4, responsive và focus/reduced motion |
| `frontend/src/app/page.tsx` | Trang chủ giới thiệu hai hướng sử dụng |
| `frontend/src/app/tim-phong/page.tsx` | Trang thông báo tính năng tìm phòng đang chuẩn bị |
| `frontend/src/app/tim-nguoi-o-ghep/page.tsx` | Trang thông báo tính năng ở ghép đang chuẩn bị |
| `frontend/src/app/not-found.tsx` | Trang không tìm thấy với link quay về |
| `frontend/public/images/roomora-home.png` | Sao chép ảnh minh họa từ design-reference; có caption, không phải tin đăng thật |
| `frontend/.env.local`, `frontend/.env.example` | Chỉ public API base URL; không chứa secret backend |
| `frontend/.gitignore` | Bỏ qua toàn bộ env, kể cả `.env.example`, theo yêu cầu lưu local |
| `frontend/package.json`, `frontend/test/api.test.mjs` | Lệnh và 7 test lỗi/kết quả/hủy/timeout fetch, không thêm dependency |
| `frontend/README.md` | Hướng dẫn chạy và kiểm tra frontend |
| `.gitignore` | Bỏ qua artifact kiểm tra `.verification/` |
| `FOUNDATION_STATUS.md` | Báo cáo này |

Giữ nguyên HealthController với `ready()` do người dùng viết, PrismaService,
PrismaModule, AppModule, config và bootstrap hiện có. Không thêm DatabaseModule,
không sửa tay generated client, không thay đổi lockfile/dependency/database.

## Thiết kế

Đã đọc `design-reference/stitch_roomora_co_living_platform/stitch_roomora_co_living_platform/warm_community_modern/DESIGN.md`,
HTML và screen.png của `kh_m_ph_ph_ng`. Dùng bảng màu nền ngà trong phần mô tả
Colors của DESIGN.md (phần YAML đầu tài liệu dùng màu nền khác), font Be Vietnam
Pro có subset tiếng Việt, nội dung tối đa 1280px, card 16px và nút tối thiểu 44px.
Điều hướng chỉ gồm trang chủ, tìm phòng, tìm người ở ghép.

Chưa triển khai đăng nhập/đăng ký, tìm kiếm, tin đăng hoặc kết nối người ở ghép.
Các trang nghiệp vụ hiện là thông báo chuẩn bị tính năng, không dùng dữ liệu người
dùng giả. Không có health check trong điều hướng/giao diện chính.

## Tự chạy

Tái sử dụng server hiện có ở cổng 3000/5000; chỉ chạy các lệnh sau khi cần khởi động
lại. Trong hai terminal riêng, từ thư mục gốc:

```powershell
cd backend
npm run start:dev
```

```powershell
cd frontend
npm run dev
```

- Trang chủ: http://localhost:3000
- Tìm phòng: http://localhost:3000/tim-phong
- Ở ghép: http://localhost:3000/tim-nguoi-o-ghep
- Kiểm tra API development: http://localhost:3000/dev/health
- Liveness: http://localhost:5000/api/v1/health
- Readiness: http://localhost:5000/api/v1/health/ready

Backend `.env` dùng `FRONTEND_ORIGIN=http://localhost:3000`.
Frontend `.env.local` dùng `NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1`.
Nếu đổi origin/port, chỉnh cả hai nơi tương ứng và khởi động lại server.
Biến NEXT_PUBLIC được đóng vào bundle khi build; cần build lại khi đổi URL triển khai.

```powershell
cd backend
npm run build
npm run lint
npm test
npm run test:e2e
npm run prisma:validate
```

```powershell
cd frontend
npm run build
npm run lint
npm run test:api
```

Build tải Be Vietnam Pro bằng next/font; font được phục vụ từ ứng dụng sau build.
E2E app hiện có dùng PostgreSQL thật; riêng test hợp đồng health dùng Prisma mock.

## Artifact local

Ảnh và script kiểm tra nằm trong `.verification/` (không commit): `desktop.png`,
`mobile.png`, `health-success.png`, `health-error.png`, `browser-check.mjs`.
Playwright chỉ được cài vào thư mục tạm, không thêm vào dependencies dự án.
Chạy lại kiểm tra trình duyệt trên máy này từ thư mục gốc:

```powershell
npm install --prefix "$env:TEMP\roomora-browser-check" --no-package-lock --no-save playwright
node .verification/browser-check.mjs
```

Script dùng Chrome đã cài. Mô phỏng lỗi bằng interception trong trình duyệt;
không dừng PostgreSQL hoặc sửa dữ liệu. Tiến trình production tạm đã được đóng.
