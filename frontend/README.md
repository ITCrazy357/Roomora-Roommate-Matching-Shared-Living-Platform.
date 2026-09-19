# Roomora frontend

Next.js 16.3.5 App Router (`src/app/`), React 19, Tailwind CSS 4.
Thiết kế theo `design-reference/`, dùng Be Vietnam Pro có hỗ trợ tiếng Việt.

## Chạy local

Tạo `.env.local` từ `.env.example` nếu chưa có. Không đưa secret backend vào frontend.

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1
```

```powershell
npm ci
npm run dev
```

Mở http://localhost:3000. Backend cần chạy ở cổng 5000 với
`FRONTEND_ORIGIN=http://localhost:3000`. Nếu đổi origin, cập nhật cả backend và
frontend rồi khởi động lại. NEXT_PUBLIC được đóng vào bundle tại thời điểm build.

## Các trang

- `/`: giới thiệu Roomora, hai hướng tìm phòng và tìm người ở ghép.
- `/tim-phong`, `/tim-nguoi-o-ghep`: thông báo tính năng đang chuẩn bị.
- `/dev/health`: chỉ có trong development; gọi API trực tiếp từ trình duyệt,
  có loading, thành công, lỗi và thử lại. Production trả 404.

`src/lib/api.ts` cung cấp fetch JSON, timeout mặc định 8 giây, hủy request và
phân loại lỗi HTTP/mạng/phản hồi. `src/components/ui.tsx` chứa các component dùng chung.

## Kiểm tra

```powershell
npm run lint
npm run test:api
npm run build
npm run start
```

Test API dùng Node.js 22.23+ và test runner tích hợp; không cần thêm dependency.
Build cần mạng để next/font tải Be Vietnam Pro, sau đó font được phục vụ từ ứng dụng.

Danh sách file thay đổi, kết quả HTTP/trình duyệt và giới hạn hiện tại:
[FOUNDATION_STATUS.md](../FOUNDATION_STATUS.md).