# Phase 3 — Tin phòng và kiểm duyệt

Triển khai ngày 27/09/2026 theo `backend/room.todo`. Đã hoàn thiện database,
API NestJS và giao diện với dữ liệu PostgreSQL thật.

## Màn hình và thiết kế

| Đường dẫn | Chức năng |
| --- | --- |
| `/tim-phong` | Tìm kiếm, lọc khu vực/giá/tiện ích, sắp xếp và phân trang |
| `/phong/[id]` | Ảnh, chi phí, tiện ích, tiêu chí ở ghép, bản đồ khu vực và lưu tin |
| `/dang-tin` | Wizard 5 bước, lưu nháp và gửi duyệt |
| `/tin-cua-toi` | Tin của tài khoản hiện tại, lọc trạng thái |
| `/tin-cua-toi/[id]/chinh-sua` | Tiếp tục bản nháp, sửa nội dung và ảnh |
| `/da-luu` | Các tin đã lưu còn công khai, mới lưu trước |
| `/admin/tin-dang` | Danh sách kiểm duyệt, duyệt/từ chối kèm lý do và lịch sử |

Bố cục dựa trên sáu mẫu trong `design-reference`: khám phá, chi tiết phòng,
wizard đăng tin, tin của tôi, đã lưu và kiểm duyệt. Màu sắc sử dụng semantic
token cam đỏ/kem của `theme.css` và `docs/ui-theme.md`. Điện thoại có bộ lọc
thu gọn. Các chức năng kết nối, chat, so sánh và điểm tương thích thuộc phase sau.

## Quy tắc dữ liệu và quyền

- Loại tin duy nhất: có phòng, tìm người ở ghép. Tiền thuê và chi phí sinh hoạt
  tính cho một người mỗi tháng; cọc là khoản ban đầu cho một người.
- Tạo tin luôn là `DRAFT`. Cho phép lưu thông tin còn thiếu để tiếp tục sau.
- Gửi duyệt cần tiêu đề từ 10 ký tự, mô tả từ 30 ký tự, giá thuê, diện tích,
  ngày dọn vào, tỉnh/phường hợp lệ, địa chỉ riêng tư, vị trí khu vực và ít nhất một ảnh.
- `DRAFT/REJECTED/CLOSED → PENDING`; admin quyết định `PUBLISHED` hoặc `REJECTED`.
  Từ chối bắt buộc có lý do. Admin không được tự duyệt tin của mình.
- Sửa nội dung, tải ảnh hoặc xóa ảnh đưa tin về `DRAFT` và cần gửi duyệt lại.
  Chủ tin có thể đóng tin. Tin chưa công khai chỉ được chủ tin hoặc admin xem.
- API kiểm tra quyền từ phiên và database, không tin `ownerId`, `role` hoặc
  `status` do trình duyệt gửi. OriginGuard hiện tại vẫn bảo vệ các request ghi dữ liệu.
- Các thao tác sửa, gửi duyệt, đóng, ảnh và quyết định kiểm duyệt cần `version`.
  Khi phiên bản đã thay đổi, trả `409 LISTING_CHANGED` để tránh ghi đè/duyệt nội dung cũ.
  Quyết định kiểm duyệt và lịch sử được ghi trong cùng transaction.
- Ảnh tối đa 8/tin, 5 MB/ảnh; kiểm tra byte thực tế JPG/PNG/WebP, loại ảnh động,
  nén JPEG tối đa 1600×1200 và bỏ EXIF/GPS. Tái sử dụng CloudinaryService hiện có.
  Nếu lưu database thất bại sau upload, thực hiện dọn ảnh vừa tải lên.
- Địa chỉ cụ thể, lý do từ chối, lịch sử kiểm duyệt và Cloudinary public ID
  không có trong phản hồi công khai. Không đưa địa chỉ vào mô tả hoặc ảnh công khai.
  Danh tính cơ bản người đăng tin gồm tên hiển thị và ảnh đại diện.
- Vị trí được làm tròn đến 2 chữ số thập phân trước khi lưu, khoảng 1 km.
  Ghim cố định tại tâm; người đăng kéo bản đồ để chọn vị trí, không nhập tọa độ.
  Có thể lấy vị trí hiện tại rồi kéo bản đồ để chỉnh; cần kiểm tra lại tỉnh/phường.
  Cuộn chuột/chụm hai ngón để zoom quanh tâm, không đổi lựa chọn. Bước 3 và
  xem trước giữ cùng vị trí chính xác trong phiên chỉnh sửa; tải lại dùng
  vị trí đã làm tròn trên máy chủ. Bản công khai vẫn chỉ hiển thị khu vực.
  Bản đồ chọn vị trí và chi tiết dùng Leaflet + Geoapify, cần API key ở frontend.
  Geoapify nhận yêu cầu ảnh bản đồ theo khu vực đang xem, không nhận địa chỉ
  riêng tư; bản đồ công khai chỉ nhận vị trí đã làm tròn.
  Kiểm duyệt nội dung không đồng nghĩa đã xác minh địa chỉ thực tế.
- Lưu tin dùng khóa duy nhất `(userId, listingId)` và `createMany(skipDuplicates)`.
  Tin bị ẩn hoặc đóng không hiện trong danh sách đã lưu; quan hệ lưu vẫn được giữ
  để xuất hiện lại khi công khai. Bỏ lưu là thao tác idempotent.

## Cấu trúc code và tối ưu

Backend: `modules/listings` gồm DTO, controller, service và AdminGuard,
dùng PrismaService hiện tại. Migration bổ sung
`20260927180000_phase_3_listings` thêm role và bảng tin/ảnh/đã lưu/lịch sử,
không xóa hoặc thay đổi dữ liệu tài khoản cũ. Có index cho trạng thái/khu vực/giá,
chủ tin, tiện ích GIN và thời gian lưu tin.

Frontend: `components/listings` tách trình duyệt tin, thẻ tin, chi tiết,
wizard và kiểm duyệt. Dữ liệu form được chuyển đổi ở `lib/listing-form.ts`;
nhãn, kiểu dữ liệu và lỗi ở `lib/listings.ts`. Dùng component UI và apiFetch có sẵn.

Truy vấn phân trang có giới hạn tối đa 24 tin, sắp xếp ổn định bằng ID, lấy tổng
và danh sách trong cùng snapshot. Trạng thái đã lưu được đọc theo lô thay vì
mỗi thẻ một truy vấn. Hủy request cũ khi đổi bộ lọc hoặc rời trang.

## Chạy và cấp quyền admin

Giữ môi trường đang dùng, không ghi đè `.env`:

```powershell
docker compose up -d postgres
cd backend
npm run prisma:migrate:deploy
npm run prisma:generate
npm run start:dev
```

Frontend chạy `npm run dev` trong `frontend`; mặc định API là
`http://localhost:5000/api/v1`, frontend là `http://localhost:3000`.

Để bật bản đồ và chọn vị trí, thêm `NEXT_PUBLIC_GEOAPIFY_MAPS_API_KEY` vào
`frontend/.env.local` rồi khởi động lại frontend. Xem hướng dẫn tạo khóa,
giới hạn website và hạn mức tại [docs/maps-setup.md](docs/maps-setup.md).

Mọi tài khoản hiện có và đăng ký mới mặc định là `USER`. Sau khi tạo và xác minh
một tài khoản admin do bạn chọn, quản trị viên vận hành có thể chạy trong `backend`:

```powershell
node scripts/set-admin.mjs admin@example.com
```

Thay email ví dụ bằng tài khoản cần cấp quyền. Script dùng DATABASE_URL hiện tại
và chỉ cập nhật tài khoản đã xác minh. Không tự cấp admin cho tài khoản sẵn có
trong quá trình triển khai. Đăng nhập/tải lại để menu kiểm duyệt xuất hiện.

## Kiểm chứng

- Prisma validate/generate, migration deploy/status và Nest build.
- Backend lint; 44 unit test và 26 E2E test PostgreSQL, gồm 9 test phase 3.
- Frontend lint, TypeScript, 8 API client test và production build.
- Chrome kiểm tra sửa wizard: cuộn chuột zoom vào/ra, pinch trên mobile,
  ghim bước 3/bước 5 trùng nhau sau lưu nháp. Gửi thiếu thông tin trả lỗi
  cạnh nút; gửi tin đủ dữ liệu bằng API thật chuyển thành `PENDING` trong
  PostgreSQL, hiển thị thông báo thành công và chặn gửi trùng. Ảnh cho lần
  kiểm tra này là fixture local, không kiểm tra upload. Xem trước/phản hồi
  vừa màn hình 1440/768/320px; tải lại giữ trạng thái chờ duyệt.
- Chrome kiểm tra cả frontend development và production, dùng API thật và PostgreSQL thật: tạo nháp bằng wizard, upload ảnh
  qua Cloudinary thật, gửi duyệt, admin từ chối, chủ tin sửa/gửi lại, admin duyệt,
  tìm/lọc phòng, lưu và tải lại, kiểm tra địa chỉ riêng tư, đóng và ẩn tin.
- Bản đồ Leaflet + Geoapify: Chrome tải ảnh bản đồ thật bằng khóa local,
  có ghi nguồn Geoapify/OpenStreetMap. Ghim cố định tại tâm khi kéo bản đồ
  bằng chuột/cảm ứng; vị trí tự cập nhật khi di chuyển bằng phím mũi tên.
  Kiểm tra chọn tâm ban đầu, lấy vị trí với quyền trình duyệt, lưu nháp và
  tải lại bằng API/PostgreSQL thật, đổi tỉnh xóa lựa chọn, đổi bước không
  tạo map trùng. Tải lại/lưu/đổi kích thước không đánh dấu tin là có thay đổi.
  Chi tiết công khai có map thật với ghim cố định, không lộ địa chỉ riêng tư.
  Kích thước 1440/768/320px không tràn ngang, không có lỗi JavaScript.
  Trạng thái từ chối tải ảnh được kiểm tra bằng phản hồi `403` mô phỏng;
  các thao tác thành công dùng dịch vụ Geoapify thật.
- 9 màn hình/trạng thái kiểm tra ở 1440/768/320px, không tràn ngang; bộ lọc
  điện thoại đóng/mở được; không có lỗi JavaScript trình duyệt hoặc cảnh báo bố cục ảnh Next.js trong bản cuối.
- Tài khoản, tin, quan hệ lưu và ảnh Cloudinary kiểm thử được dọn sau khi chạy.
  Screenshot/report giữ trong `.verification`, không đưa lên Git.

Kiểm thử luồng Phase 3 ban đầu dùng API riêng ở port 5100 để không ảnh hưởng
dịch vụ đang chiếm port 5000. Bản đồ Geoapify được kiểm tra với frontend 3000
và API 5000 hiện có; không thay đổi cấu hình port trong `.env`.

Tài liệu dịch vụ ảnh: [Cloudinary Node upload](https://cloudinary.com/documentation/node_image_and_video_upload).
Tài liệu bản đồ: [Geoapify Map Tiles](https://apidocs.geoapify.com/docs/maps/map-tiles/),
[Leaflet](https://leafletjs.com/reference.html).
