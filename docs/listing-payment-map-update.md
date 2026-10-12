# Sửa thanh toán tin đăng và trải nghiệm địa điểm — 12/10/2026

## Nguyên nhân và quy tắc thanh toán

Code trước chỉ chống gửi lặp theo `clientId`, `orderId`, chữ ký callback và mã
giao dịch. Một `clientId` mới vẫn tạo đơn khác cho cùng tin; callback của hai đơn
còn nối thêm thời hạn boost. Vì vậy một đơn không bị xử lý hai lần nhưng cùng
tin vẫn trả tiền nhiều lần. Frontend luôn hiện nút mua gói cho tin PUBLISHED.

Đã bổ sung `postingRound` trên Listing và ServiceOrder. Đơn giữ số đợt tại lúc
tạo, không dùng `version` hoặc `publishedAt` vì hai giá trị này đổi khi sửa/duyệt tin.

- Sửa nội dung, đổi loại tin và duyệt lại giữ nguyên đợt. Đóng tin kết thúc đợt,
  hết hạn đơn đang chờ, xóa hiệu lực boost hiện tại và tăng số đợt. Đăng lại được
  thanh toán ở đợt mới. Lịch sử đơn và thời hạn quyền lợi đã mua vẫn giữ nguyên.
- PAID trong cùng tin/đợt chặn tạo đơn mới bằng HTTP 409 `LISTING_ALREADY_PAID`,
  kể cả khi boost hết hạn. PENDING/FAILED không được tính đã thanh toán.
- Retry cùng `clientId` trả lại đơn đã tạo, không tạo giao dịch mới. ClientId khác
  dùng lại đơn PENDING của cùng đợt, kể cả khi thay cổng thanh toán. FAILED/EXPIRED
  cho phép tạo đơn mới; checkout không làm giao dịch thành PAID.
- Transaction khóa user → listing → order. PostgreSQL có partial unique index
  một đơn PENDING theo tin/đợt. Checkout kiểm tra lại trước và sau khi gọi gateway,
  không giữ transaction trong thời gian chờ mạng.
- Webhook lặp không tạo quyền lợi hay hoàn tiền nhiều lần. Nếu link cũ vẫn nhận
  tiền sau một thanh toán khác, ghi nhận PAID để phản ánh số tiền thực nhận và
  tạo yêu cầu đối soát hoàn tiền; chỉ một boost được cấp. Thanh toán thuộc đợt
  đã đóng không cấp boost cho đợt mới. Đây là yêu cầu hoàn tiền, chưa chuyển tiền hoàn tự động.
- `paymentCompleted` chỉ nằm ở dữ liệu tin riêng/danh sách dịch vụ của chủ tin.
  Trang dịch vụ, chi tiết và quản lý tin thể hiện đã trả tiền, chặn nút mua lại.
  Lịch sử quyền lợi hiển thị “Đợt đăng đã kết thúc” khi tin đã đóng đợt cũ.

Migration giữ toàn bộ lịch sử PAID/boost cũ, quy các đơn hiện có về đợt 1 và
đặt tin đã CLOSED sang đợt 2. Không suy đoán các đợt lịch sử chưa được lưu.
Các đơn PENDING dư hoặc thuộc tin đóng được hết hạn, vẫn nhận được callback
đến muộn để đối soát. Không xóa giao dịch hoặc tự ghi nhận hoàn tiền.

## Form và bản đồ

| Loại tin | Form và validation |
| --- | --- |
| Tìm phòng | Nhu cầu, ngân sách, diện tích mong muốn, số người dự kiến, tỉnh/phường và tiêu chí. Không bản đồ, địa chỉ riêng, ngày dọn vào hoặc chi phí phòng cụ thể. Backend chuẩn hóa các trường này khi lưu; đọc dữ liệu cũ cũng không trả tọa độ/ngày/chi phí phòng. |
| Tìm người ghép phòng | Chọn đã có phòng hoặc chưa có phòng muốn xin ở ghép. Cả hai không có ngày dọn vào. Chưa có phòng ẩn diện tích, số người, chi phí phòng, ảnh, địa chỉ riêng và bản đồ; giữ nhu cầu, ngân sách, khu vực và tiêu chí. Xem [hai nhu cầu ở ghép](roommate-options.md). |
| Cho thuê phòng | Giữ thông tin phòng thực tế; yêu cầu diện tích, ngày dọn vào, địa chỉ riêng, tọa độ và ít nhất một ảnh trước khi gửi duyệt. |

Giữ Leaflet/Geoapify và cơ chế lưu tọa độ hai chữ số thập phân. Có vùng bản đồ
mở rộng, nút zoom cho thao tác chạm, tìm địa điểm, định vị sau khi bấm/cấp quyền,
ghim tại tâm, chọn bằng bấm/kéo bản đồ và nhập tọa độ thủ công. Từ chối định vị,
không có kết quả hoặc provider lỗi đều có thông báo và cách chọn thủ công.

Tìm kiếm chỉ lấy kết quả tại Việt Nam, không tự sửa tỉnh/phường hoặc địa chỉ riêng.
Ghim chính xác giữ trong phiên editor sau khi lưu; database và bản đồ công khai
dùng tọa độ làm tròn. API tìm kiếm/tile chạy qua backend; khóa không có trong
URL tile hoặc mã frontend. Xem [cấu hình bản đồ](maps-setup.md).

## Khu vực mong muốn

`SearchableSelect` thay native select và ô lọc phường riêng trong hồ sơ.
Bấm/focus mở danh sách, gõ lọc chữ hoa/thường và không dấu, có trạng thái không
kết quả. Arrow Up/Down, Enter, Escape và Tab được hỗ trợ. Typing/thoát dropdown
không đổi lựa chọn đã xác nhận. Giữ quan hệ tỉnh/phường, lựa chọn toàn tỉnh,
giới hạn năm khu vực, chống trùng, dữ liệu đã lưu và payload API hiện tại.

## File thay đổi trong lần sửa này

| File | Vai trò |
| --- | --- |
| `backend/prisma/schema.prisma` | Số đợt trên tin/đơn và index tra trạng thái thanh toán. |
| `backend/prisma/migrations/20261012100000_listing_posting_round/migration.sql` | Thêm trường, backfill, xử lý PENDING dư và partial unique index. |
| `backend/prisma/migrations/20261012101000_closed_listing_round/migration.sql` | Kết thúc boost/đơn chờ của tin CLOSED đã có. |
| `backend/src/modules/billing/service-orders.service.ts` | Kiểm tra PAID, tái sử dụng đơn chờ và checkout dưới khóa. |
| `backend/src/modules/billing/service-payments.service.ts` | Một quyền lợi mỗi đợt, xử lý tiền đến muộn/trùng và yêu cầu hoàn tiền. |
| `backend/src/modules/billing/billing-types.ts` | Thông tin đợt hiện tại trong lịch sử đơn để hiển thị quyền lợi chính xác. |
| `backend/src/modules/listings/listing-management.service.ts` | Đóng đợt và hết hạn đơn chờ trong transaction. |
| `backend/src/modules/listings/listing-rules.service.ts` | Validation/chuẩn hóa theo loại tin và trạng thái đã trả tiền ở view riêng. |
| `backend/src/modules/listings/listing-views.ts` | Chọn số đợt của đơn PAID, không lấy dữ liệu thanh toán nhạy cảm. |
| `backend/src/modules/locations/location-maps.service.ts` | Geoapify server proxy, lọc kết quả, timeout và cache tile giới hạn. |
| `backend/src/modules/locations/location-maps.controller.ts` | API config/search/tile, DTO và kiểm tra tham số. |
| `backend/src/modules/locations/locations.module.ts` | Đăng ký controller/service bản đồ. |
| `backend/src/config/environment.validation.ts` | Biến khóa bản đồ ở server. |
| `backend/.env`, `backend/.env.example` | Cấu hình GEOAPIFY_API_KEY; khóa chỉ ở file local bị Git bỏ qua. |
| `frontend/.env.local`, `frontend/.env.example` | Bỏ biến khóa bản đồ công khai đã dùng trước đây. |
| `frontend/src/lib/listing-form.ts` | Payload theo loại tin, không gửi dữ liệu phòng thừa cho Tìm phòng. |
| `frontend/src/lib/listings.ts` | Kiểu dữ liệu số đợt/trạng thái trả tiền. |
| `frontend/src/lib/billing.ts` | Lỗi thanh toán trùng, trạng thái listing và nhãn đợt kết thúc. |
| `frontend/src/lib/maps.ts` | URL tile của Roomora, không chứa khóa provider. |
| `frontend/src/components/listings/listing-editor-fields.tsx` | Trường/nhãn động theo ba loại tin. |
| `frontend/src/components/listings/listing-editor.tsx` | Giữ ghim đúng loại tin sau khi lưu, bỏ định vị ở ngoài bản đồ. |
| `frontend/src/components/listings/room-map.tsx` | Mở rộng, tìm kiếm, định vị, ghim và nhập tọa độ; keyboard/focus. |
| `frontend/src/components/listings/listing-content.tsx` | Preview/chi tiết Tìm phòng không có map/ngày/ảnh phòng. |
| `frontend/src/components/listings/listing-card.tsx` | Không hiện ngày dọn vào cho Tìm phòng; chặn mua lại ở tin của tôi. |
| `frontend/src/components/listings/listing-detail.tsx` | Trạng thái đã thanh toán và hành động mua gói ở chi tiết. |
| `frontend/src/components/billing/services.tsx` | Chọn tin đã trả tiền bị khóa, FAQ đúng nghiệp vụ mới. |
| `frontend/src/components/billing/service-order-card.tsx` | Mô tả đóng đợt đúng với quyền lợi/lịch sử. |
| `frontend/src/components/searchable-select.tsx` | Combobox dùng chung có ARIA, tìm không dấu và bàn phím. |
| `frontend/src/components/location-picker.tsx` | Hai combobox theo tỉnh/phường, giữ cách thêm/xóa khu vực. |
| `frontend/src/app/listings.css` | Layout bản đồ mở rộng/điều khiển/tìm kiếm, theo theme chung. |
| `frontend/src/app/profile-editor.css` | Dropdown, mục chọn và trạng thái combobox, theo theme chung. |
| `backend/test/billing.e2e-spec.ts` | HTTP/PostgreSQL cho thanh toán lặp, đồng thời, thất bại, đóng/đăng lại và race checkout. |
| `backend/test/listings.e2e-spec.ts` | Ba loại tin, đổi loại, dữ liệu cũ, tạo/sửa/đọc và duyệt. |
| `backend/test/location-maps.e2e-spec.ts` | Validation/proxy tìm kiếm và PNG qua HTTP. |
| `backend/src/modules/locations/location-maps.service.spec.ts` | Provider lọc/sanitize, cache, lỗi an toàn và tọa độ tile. |
| `backend/src/modules/billing/README.md`, `backend/room.todo`, `PHASE_9_STATUS.md` | Quy tắc hiện tại và bằng chứng kiểm chứng. |
| `docs/maps-setup.md`, tài liệu này | Cấu hình, hành vi, danh sách file và giới hạn kiểm thử. |

Các thay đổi Phase 9 có sẵn trước yêu cầu này được giữ nguyên, không sửa Git history.

## Kiểm chứng thực tế

- Hai migration mới đã deploy vào PostgreSQL local; Prisma generate thành công.
- 80 unit test backend qua. Tám test API helper frontend qua.
- Bộ E2E toàn bộ cuối: **277/277 qua** (20 file, chạy tuần tự).
  Bộ billing/listings cuối: 85/85 qua, gồm 68 billing và 17 listings.
- Backend TypeScript build qua với output riêng để không ảnh hưởng backend đang chạy.
  Production build frontend qua, giữ Be Vietnam Pro. ESLint frontend và lint các
  file backend thay đổi không lỗi. Lint backend toàn bộ còn năm warning sort test cũ.
- Edge production frontend cổng 3109 + Nest API riêng 5109 + PostgreSQL thật:
  tám nhóm kiểm tra tạo/sửa/đọc, đổi loại, bản đồ, combobox, chặn mua lại và
  lịch sử đóng đợt đều qua. Không có lỗi JavaScript; không tràn ngang ở
  320/390/768/1366 px. Fixture được dọn sau khi chạy.
- Geoapify **thật** đã trả ảnh bản đồ và kết quả Cầu Giấy, Hà Nội. Kiểm tra định vị
  với vị trí được cấp quyền, từ chối quyền, không kết quả và provider mất cấu hình;
  tọa độ thủ công vẫn lưu được. Các trường hợp lỗi được điều khiển trong bài test.
- Callback PayOS được **giả lập và ký HMAC** với khóa test riêng, API/database thật.
  Không tạo link thanh toán merchant hoặc chuyển tiền thật trong lần kiểm tra này.
- Backend đang chạy ở 5000 trả health HTTP 200 và cấu hình bản đồ `available: true`.
- Kiểm tra 40 chunk JavaScript production: không chunk nào chứa khóa Geoapify local.
  Catalog API đang chạy xác nhận PayOS sẵn sàng và giá 49.000đ/7 ngày.

Artifact local: `.verification/listing-payment-map-browser-report.json` và
`.verification/request-*.png`. Chúng chỉ chứa fixture kiểm thử, không có khóa merchant.

## Phạm vi chưa nghiệm thu

Giao dịch thu/hoàn tiền PayOS thật không được tự thực hiện. Quy trình hoàn tiền
vẫn ở trạng thái yêu cầu chờ đối soát, chưa tích hợp chuyển tiền hoàn tự động.
MoMo vẫn cần merchant sandbox. Giá gói giữ nguyên **49.000đ/7 ngày**.
Máy khác cần `GEOAPIFY_API_KEY` ở backend; máy local hiện tại đã được chuyển khóa.
