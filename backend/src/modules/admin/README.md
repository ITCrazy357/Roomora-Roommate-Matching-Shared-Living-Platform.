# Quản trị Roomora

ADMIN phục vụ vận hành: tin chờ duyệt, người dùng, báo cáo vi phạm và thông báo hệ thống. Đăng nhập bằng mật khẩu hoặc Google đi thẳng tới `/admin/tin-dang`, không yêu cầu hoàn thành hồ sơ ở ghép.

## Quyền và dữ liệu

- Dùng lại `AdminGuard`, session cookie, `OriginGuard`, DTO và `ValidationPipe` hiện có. `AuthGuard` dành cho tính năng người dùng từ chối tài khoản ADMIN; `AdminAccountAccess` chỉ mở các API bảo mật tài khoản và SSE phiên đăng nhập.
- ADMIN không xem House, sổ chi phí hoặc hội thoại cá nhân. Danh sách quản trị chỉ trả tên, avatar, email, ngày tham gia/xác minh và thông tin khóa; không trả hồ sơ riêng, mật khẩu hay dữ liệu House.
- Tài khoản quản trị không xuất hiện trong tìm người ở ghép. Không có chức năng tự cấp quyền ADMIN trong giao diện này.

## Khóa tài khoản và báo cáo

Người dùng vẫn báo cáo qua `POST /user-safety/:id/report`. ADMIN xem hàng chờ `/admin/bao-cao`, đối chiếu nội dung, chọn tài khoản cần xử lý rồi khóa nếu có căn cứ. Báo cáo không tự khóa người bị báo cáo. Đóng báo cáo bằng “Đã xử lý vi phạm” hoặc “Không đủ căn cứ”, kèm ghi chú bắt buộc.

Khóa và mở khóa cần lý do ít nhất 5 ký tự. Không được khóa chính mình hoặc ADMIN khác. Khóa thu hồi mọi phiên đăng nhập và chặn cả đăng nhập mật khẩu/Google; mở khóa yêu cầu người dùng đăng nhập lại. Tin và hồ sơ công khai của tài khoản bị khóa bị ẩn, nội dung và trạng thái tin được giữ để đối chiếu. Không duyệt công khai tin của người đang bị khóa. Mở khóa khôi phục khả năng hiển thị các tin vẫn đang `PUBLISHED`.

Khóa dùng row lock `users` chung với việc tạo session. Mọi thay đổi quản trị cần `version`, tăng phiên bản và ghi `AdminAction` trong cùng transaction. Request trùng/cũ trả HTTP 409. Kiểm duyệt tin tiếp tục dùng lịch sử `ListingReview` hiện có.

## Thông báo và banner

Vào `/admin/thong-bao` → “Soạn thông báo” → chọn lịch hiển thị, loại thông báo và nội dung → lưu nháp → đọc bản xem trước → “Phát theo lịch”. Có thể gỡ khỏi banner bất kỳ lúc nào. Muốn sửa thông báo đã phát, gỡ trước rồi sửa nháp và phát lại.

Các ô nhập thời gian dùng giờ Việt Nam UTC+7, API nhận ISO 8601 có timezone và lưu UTC. Với bảo trì, lịch hiển thị phải bao trùm toàn bộ khoảng bảo trì. Banner chỉ hiện khi `published=true` và `displayFrom <= serverTime < displayUntil`. Nháp, lịch chưa đến và thông báo hết hạn không xuất hiện trong API công khai.

Banner chạy trên mọi trang, cả khách chưa đăng nhập; cập nhật sau tối đa một chu kỳ polling 20 giây khi trang đang hiển thị. Có nút dừng/chạy tiếp, dừng khi hover/focus và tôn trọng `prefers-reduced-motion`. Dừng chạy sẽ hiện toàn bộ nội dung để đọc. Khi mất kết nối tạm thời, giữ nội dung chưa hết hạn theo đồng hồ máy chủ đã đồng bộ; hết hạn tự ẩn. Banner chỉ thông báo lịch, không tự bật chế độ bảo trì hoặc dừng dịch vụ.

## API

`GET /admin/summary?month=YYYY-MM` trả thống kê tháng trong một snapshot
`RepeatableRead`, kèm `generatedAt` và `period`. Không truyền tháng thì dùng
tháng hiện tại ở Việt Nam. Tháng hợp lệ từ 2000–2100; khoảng tính từ 00:00 ngày
đầu tháng đến trước 00:00 ngày đầu tháng sau, theo `Asia/Ho_Chi_Minh` (UTC+7).

- `listings.approved` / `listings.rejected`: số tin có lịch sử duyệt / từ chối,
  theo ngày `ListingReview.createdAt` trong tháng; mỗi tin tính một lần trong
  mỗi nhóm, kể cả tin đã đóng. Một tin có thể thuộc
  cả hai nhóm; đây không phải hai phần của một tổng số tin.
- `reports.resolved` / `reports.dismissed`: báo cáo đã xử lý vi phạm / đã bác bỏ;
  theo `handledAt` trong tháng; `openReports` là báo cáo gửi trong tháng và vẫn
  chờ xử lý, theo `createdAt`.
- `refunds`: số yêu cầu ở từng trạng thái hiện tại; `completedAmount` chỉ cộng
  tiền của yêu cầu `COMPLETED` có `completedAt` trong tháng, kể cả yêu cầu gửi
  trước tháng đó. Yêu cầu `REJECTED` theo ngày ghi quyết định từ chối trong
  `ServiceRefundAction`; trạng thái còn lại theo `createdAt` trong tháng.
  `pendingRefunds` gồm `PENDING`, `APPROVED`,
  `PROCESSING` và `FAILED`, vì các trạng thái này vẫn cần xử lý.
- `payments`: số đơn thanh toán ở từng trạng thái; `paidAmount` là tổng tiền
  đơn `PAID` theo `paidAt` trong tháng, kể cả đơn được tạo trước tháng đó và
  đơn đã được hoàn tiền. Trạng thái khác tính theo `createdAt` trong tháng.
- `revenue.receivedAmount`: tiền dịch vụ đã nhận trong tháng;
  `revenue.refundAmount`: tiền hoàn tất trong tháng mang dấu âm;
  `revenue.netAmount = receivedAmount + refundAmount`. Tháng hoàn tiền có thể
  khác tháng thu và doanh thu sau hoàn tiền có thể âm; không ép về 0.
- `pendingListings`: tin đang chờ, có `submittedAt` trong tháng.
- `lockedUsers`: số tài khoản có thao tác `USER_LOCKED` trong tháng, mỗi tài
  khoản tính một lần, kể cả sau đó đã mở khóa. `activeAnnouncements`: thông báo
  còn được phát theo lịch có khoảng hiển thị giao với tháng được chọn.
- `currentQueues`: toàn bộ tin/báo cáo/hoàn tiền hiện vẫn cần xử lý, không giới
  hạn tháng; dùng cho thanh hàng chờ trên các trang vận hành.
- `processed`: số mục đã có kết quả trong tháng. `listings` đếm mỗi tin có
  review duyệt/từ chối một lần, kể cả có cả hai kết quả hoặc được duyệt lặp.
  `reports` gồm báo cáo đã xử lý vi phạm/không đủ căn cứ theo `handledAt`.
  `refunds` gồm khoản hoàn tất theo `completedAt` và yêu cầu đã từ chối theo
  ngày ghi quyết định trong `ServiceRefundAction`, kể cả yêu cầu gửi tháng trước.
  `total` là tổng ba nhóm; không cộng mục chờ, đang thực hiện hoặc lỗi cần thử lại.

Dashboard admin hiển thị doanh thu dịch vụ sau hoàn tiền và tổng tiền đã hoàn
bằng dấu âm trong hai ô riêng. Bộ chọn tháng áp dụng cho toàn bộ dashboard.
Ô thứ ba là "Đã xử lý trong tháng", kèm số tin, báo cáo và yêu cầu hoàn tiền
đã có kết quả; liên kết mở phần thống kê kết quả ngay bên dưới.
Thống kê là số đơn/yêu cầu, không phải số lần thử giao dịch; các nhóm chưa hoàn
tất phản ánh trạng thái hiện tại của dữ liệu phát sinh trong tháng.

| API                                                                | Chức năng                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `GET /admin/summary?month=YYYY-MM`                                  | Doanh thu sau hoàn tiền, hoàn tiền và kết quả vận hành trong tháng                       |
| `GET /admin/users?search=&status=ACTIVE\|LOCKED&page=&limit=`      | Tìm và phân trang người dùng                                                               |
| `GET /admin/users/:id/history`                                     | Thông tin tài khoản và 50 thao tác khóa/mở khóa gần nhất                                   |
| `PATCH /admin/users/:id/lock`                                      | `{ locked, reason, version }`                                                              |
| `GET /admin/reports?status=OPEN\|RESOLVED\|DISMISSED&page=&limit=` | Báo cáo, cũ trước mới sau                                                                  |
| `PATCH /admin/reports/:id`                                         | `{ status: RESOLVED\|DISMISSED, note, version }`                                           |
| `GET /admin/reports/:id/history`                                   | Lịch sử xử lý báo cáo                                                                      |
| `GET /admin/announcements?page=&limit=`                            | Danh sách thông báo, kể cả nháp/đã gỡ                                                      |
| `POST /admin/announcements`                                        | Tạo nháp với `title`, `message`, `kind`, `displayFrom`, `displayUntil`, giờ bảo trì nếu có |
| `PATCH /admin/announcements/:id`                                   | Sửa nháp, cùng các trường tạo và `version`                                                 |
| `POST /admin/announcements/:id/publish`                            | `{ version }`, phát theo lịch, từ chối bản nháp hết hạn                                    |
| `POST /admin/announcements/:id/withdraw`                           | `{ version }`, gỡ khỏi banner                                                              |
| `GET /admin/announcements/:id/history`                             | Lịch sử tạo, sửa, phát, gỡ                                                                 |
| `GET /system/announcements`                                        | Công khai, `no-store`; chỉ nội dung/lịch đang hiển thị và đồng hồ máy chủ                  |

## Phạm vi và kiểm tra

Migration `20261011120000_admin_operations` thêm trạng thái khóa vào User, kết quả xử lý vào UserReport và hai bảng SystemAnnouncement/AdminAction; không xóa dữ liệu. SQL có CHECK lịch bảo trì hợp lệ và khóa phải có lý do.

`test/admin.e2e-spec.ts` kiểm tra với PostgreSQL thật: quyền ADMIN/USER, giới hạn dữ liệu riêng tư, khóa/đăng nhập đồng thời, thu hồi phiên, ẩn/khôi phục nội dung công khai, xử lý báo cáo đồng thời, thời gian/timezone, vòng đời nháp/phát/gỡ và lịch sử.

Đây là phần quản trị được triển khai trước theo yêu cầu. Chưa bao gồm tiếp nhận báo cáo từng tin đăng, ticket hỗ trợ, xử lý thanh toán hay cấp quyền quản trị.
