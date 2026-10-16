# Roomora frontend

Next.js 16.3.5 App Router (`src/app/`), React 19, Tailwind CSS 4.
Thiết kế theo `design-reference/`, dùng Be Vietnam Pro có hỗ trợ tiếng Việt.
Theme chung theo ảnh landing: cam đỏ `#E65036`, cam đào `#F28E6B`, nền kem
`#FAF8F5`, chữ đen/xám ấm. Quy tắc cho giao diện hiện tại và mới:
[UI theme](../docs/ui-theme.md).

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

## Deploy frontend trên Vercel, backend trên Render

Chọn Framework Preset `Next.js`, Root Directory `frontend` và khai báo trên Vercel:

```dotenv
NEXT_PUBLIC_API_BASE_URL=/api/v1
API_PROXY_TARGET=https://roomora-api-qxjb.onrender.com
```

`API_PROXY_TARGET` là origin backend, không thêm `/api/v1`. `next.config.ts` dùng
biến này để proxy `/api/v1/*` tới Render; trình duyệt gọi API cùng origin với
frontend để giữ cookie đăng nhập. Cần build/deploy lại khi đổi hai biến trên.
Nếu không đặt `API_PROXY_TARGET`, frontend không tạo rewrite; cấu hình local gọi
trực tiếp backend ở trên vẫn dùng được.

Trên backend Render, đặt `FRONTEND_ORIGIN=https://roomora-blond.vercel.app`.
Nếu bật Google OAuth, đặt `GOOGLE_REDIRECT_URI` và Authorized redirect URI trong
Google Cloud cùng là
`https://roomora-blond.vercel.app/api/v1/auth/google/callback`, để callback đi qua
proxy và dùng cùng cookie với frontend. Các secret Google, SMTP và database chỉ
đặt trên backend.

Sau deploy, kiểm tra `/api/v1/auth/config` trên domain Vercel trả JSON và
`/api/v1/health/ready` báo PostgreSQL/Redis hoạt động. Tiếp tục kiểm tra đăng nhập,
cookie phiên, Google OAuth và SSE trên trình duyệt; health/config thành công
chưa chứng minh các luồng này hoạt động đầy đủ. Render Free có thời gian đánh thức
backend có thể vượt timeout API mặc định 8 giây của frontend.

## Các trang

- `/`: giới thiệu Roomora, hai hướng tìm phòng và tìm người ở ghép.
- `/tim-phong`: tìm/lọc/phân trang tin phòng đã được duyệt.
- `/phong/[id]`, `/dang-tin`, `/tin-cua-toi`, `/da-luu`: chi tiết, đăng/quản lý và lưu tin.
- `/admin/tin-dang`: kiểm duyệt tin, chỉ dành cho admin.
- `/tim-nguoi-o-ghep`: tìm theo khu vực/ngân sách/thói quen, xem đối chiếu và gửi lời kết nối.
- `/ket-noi`: lời mời nhận/gửi, kết nối đã chấp nhận và danh sách đã chặn.
- `/dev/health`: chỉ có trong development; gọi API trực tiếp từ trình duyệt,
  có loading, thành công, lỗi và thử lại. Production trả 404.
- `/dang-ky`, `/dang-nhap`: đăng ký và đăng nhập bằng email/mật khẩu.
- `/xac-minh-email`, `/gui-lai-xac-minh`: xác minh email bằng token dùng một lần.
- `/quen-mat-khau`, `/dat-lai-mat-khau`: khôi phục mật khẩu; đổi mật khẩu thu hồi
  toàn bộ phiên cũ.
- `/onboarding`: hồ sơ ngắn; chỉ tên hiển thị là bắt buộc.
- `/tai-khoan/ho-so`: tải/cắt/xoay ảnh đại diện, giới thiệu, ngân sách, khu vực và thói quen.
- `/tai-khoan/cai-dat`: quyền riêng tư và danh sách/thu hồi phiên đăng nhập.
- `/ho-so/[id]`: hồ sơ công khai, đối chiếu nếp sống, kết nối, chặn và báo cáo;
  không trả email và tuân theo lựa chọn riêng tư.

`src/lib/api.ts` cung cấp fetch JSON có cookie, timeout mặc định 8 giây, hủy request
và phân loại lỗi HTTP/mạng/phản hồi. `src/components/ui.tsx` chứa các component dùng chung.

## Kiểm tra

```powershell
npm run lint
npm run test:api
npm run test:avatar
npm run build
npm run start
```

Test API dùng Node.js 22.23+ và test runner tích hợp; không cần thêm dependency.
Build cần mạng để next/font tải Be Vietnam Pro, sau đó font được phục vụ từ ứng dụng.

Ảnh đại diện mở trình chỉnh trước khi tải lên: kéo hoặc dùng phím mũi tên để căn,
thu phóng 100–400%, xoay từng 90°, đặt lại hoặc hủy. Chỉ **Lưu ảnh** mới gửi ảnh
JPEG vuông 640 × 640 tới API; nếu tải lên lỗi, giữ phần chỉnh để thử lại.
Ảnh nguồn hỗ trợ JPG/PNG/WebP, tối đa 5 MB và 25 triệu điểm ảnh. Khung tròn cho
biết phần hiển thị trên hồ sơ; bản đã lưu không chứa phần ảnh nằm ngoài khung vuông.
Backend tiếp tục kiểm tra và mã hóa lại ảnh trước khi lưu trên Cloudinary.

Danh sách file thay đổi, kết quả HTTP/trình duyệt và giới hạn hiện tại:
[FOUNDATION_STATUS.md](../FOUNDATION_STATUS.md).

Phase 2: [cấu trúc, cấu hình và kết quả kiểm tra](../PHASE_2_STATUS.md).
Hai trang đăng nhập/đăng ký dùng chung `AuthCard`, nền kem hồng, cam đỏ và cam đào
theo bộ mẫu. Form giữ riêng từng trang để dễ đọc; không thêm thư viện form.

Phase 3: [tin phòng, bản đồ và kiểm duyệt](../PHASE_3_STATUS.md).
Phase 4: [tìm người ở ghép, kết nối và quy tắc đối chiếu](../PHASE_4_STATUS.md).

Trang chủ dùng `HomeSlideshow`: 4 ảnh minh họa từ bộ thiết kế, tự trượt từ phải sang trái
mỗi 6 giây, lặp liền mạch từ ảnh cuối về ảnh đầu,
có hai nút ảnh trước/sau ở hai bên và luôn tự chuyển khi tab đang hiển thị.
Rê chuột, focus hay chạm các nút không dừng banner. Tùy chọn giảm chuyển động
chỉ bỏ hiệu ứng trượt, ảnh vẫn tự đổi. Ảnh WebP được lưu
local tại `public/images`, tải trực tiếp vì đã nén sẵn; nguồn ảnh ghi trong
[README ảnh](public/images/README.md).
`SiteFooter` dùng chung trên các trang, gồm giới thiệu Roomora và các liên kết khám phá/tài khoản.
