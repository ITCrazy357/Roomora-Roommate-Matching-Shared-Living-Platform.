# Phase 6 — Nhà chung và mở rộng tin đăng

Ngày triển khai: 28/09/2026.
Cập nhật: 29/09/2026.

## Đã triển khai

- Nhà chung dùng dữ liệu PostgreSQL: tạo nhà trực tiếp, xem danh sách/tổng quan, cập nhật tên, địa chỉ riêng, giới thiệu và nội quy.
- Mỗi tài khoản chỉ tham gia một nhà đang hoạt động. Khi đã vào nhà, giao diện ẩn form tạo nhà và khóa nút nhận lời mời khác; API và ràng buộc cơ sở dữ liệu cũng chặn tạo hoặc nhận nhà thứ hai. Phải rời nhà hiện tại trước khi tạo hoặc vào nhà mới.
- Trưởng nhà chọn người đã kết nối để mời; backend lấy email đăng ký của người đó, tạo thông báo và xếp email vào hàng đợi gửi ngay. Email đăng ký không được trả về trong danh sách chọn hoặc chi tiết lời mời mới. Tài khoản được mời xem và chấp nhận lời mời trong ứng dụng. Lời mời hết hạn sau 7 ngày. Người chưa kết nối hoặc đã là thành viên không thể được mời.
- Quyền theo từng nhà: chỉ thành viên đang tham gia đọc nội dung; trưởng nhà quản lý thông tin, lời mời, thông báo ghim và chuyển quyền. Thành viên có thể đăng thông báo, xóa thông báo của mình và rời nhà. Trưởng nhà phải chuyển quyền trước khi rời nếu còn thành viên khác. Nếu là người cuối cùng, trưởng nhà có thể rời; nhà được lưu trữ và lời mời đang chờ bị thu hồi.
- Lịch sử tạo nhà, mời, tham gia, rời nhà và chuyển quyền được lưu riêng. Thành viên đã rời không còn truy cập dữ liệu nhà.
- Tin đăng có ba loại: tìm người ở ghép, tìm phòng, cho thuê phòng. Trang chủ chia tin công khai theo loại; bộ lọc tìm tin cũng có loại tin. Tin tìm phòng dùng ngân sách/khu vực và không bắt buộc ảnh hay địa chỉ phòng. Tin có phòng vẫn cần ảnh, diện tích và ghim khu vực để gửi duyệt.
- Tin tìm người ở ghép hiển thị số người đang ở so với tổng chỗ. Chủ tin có thể đánh dấu “Đã đủ” hoặc mở lại mà không phải gửi kiểm duyệt lại.
- Tin chi tiết hiển thị diện tích, tiện ích, chi phí và bản đồ khu vực theo dữ liệu đã chia sẻ; địa chỉ cụ thể vẫn chỉ trả cho chủ tin và admin.
- Hồ sơ đã kết nối được loại khỏi tìm kiếm công khai của người đang xem. Mục “Đã kết nối” trong menu dẫn tới danh sách kết nối đã chấp nhận. Hội thoại hiển thị avatar đã tải của người kia, kể cả khi họ đặt hồ sơ riêng tư, vì hai bên đã chấp nhận kết nối; khách và người ngoài hội thoại vẫn không truy cập được.

## Migration và kiểm chứng

- `20260928210000_phase_6_houses_listings`, `20260929010000_one_active_house_per_user` và `20260929020000_archive_empty_houses` đã áp dụng bằng `prisma migrate deploy` trên PostgreSQL local `127.0.0.1:5433`, không reset dữ liệu. Trước khi thêm ràng buộc, dữ liệu không có tài khoản tham gia nhiều nhà đang hoạt động hoặc trưởng nhà thiếu tư cách thành viên.
- Backend và frontend build/lint qua. Frontend API client: 8 test qua. Backend unit: 56 test qua.
- E2E dùng PostgreSQL/HTTP thật: toàn bộ 59 test qua ở lần triển khai Phase 6 đầu; sau thay đổi quy tắc một nhà, bộ Phase 6 gồm 4 test đã chạy lại và qua. Các ca này kiểm tra tạo/nhận nhà thứ hai bị từ chối, lời mời vẫn còn khi nhận thất bại, trưởng nhà ở một mình được rời và lưu trữ nhà, lời mời nhà lưu trữ bị thu hồi, cũng như hai yêu cầu tạo nhà đồng thời chỉ một yêu cầu thành công. Những ca Phase 6 trước đó còn kiểm tra quyền của người ngoài, lấy đúng email đăng ký, hàng đợi email, chỉ trưởng nhà sửa thông tin, chuyển quyền và tin đăng liên quan. Bốn unit test về gửi thư từ hàng đợi đã qua ở lần kiểm chứng trước.
- Edge thật ở 1440px và 390px: danh sách người đã kết nối hiện trong mục mời; người đã tham gia nhà không thấy form tạo nhà, trưởng nhà ở một mình thấy nút rời và lưu trữ. Không tràn ngang hoặc có ngoại lệ JavaScript. Trưởng nhà thấy form sửa, thành viên chỉ thấy thông tin. Tài khoản và nhà thử đã được xóa; ảnh kiểm tra nằm trong `.verification/phase6-*.png` và bị Git bỏ qua.
- Đã sửa form chỉnh sửa nhà để chỉ gửi bốn trường cho phép. Thử lưu trên Edge với đúng nội dung trong ảnh người dùng: PostgreSQL cập nhật đủ bốn trường, giao diện báo thành công, không có lỗi JavaScript; tài khoản và nhà thử đã được xóa. TypeScript và lint của file sửa đã qua. Bản build thử lại trên máy này bị chặn bởi Node shim của NVM khi dùng Turbopack; chế độ webpack cần tải Google Font nhưng mạng kiểm chứng đang chặn kết nối. Bản build frontend trước thay đổi này đã qua.

## Giới hạn hiện tại

- Hàng đợi email dùng SMTP đã cấu hình, gửi thử ngay và tự thử lại khi lỗi. Chưa xác minh thư đến hộp thư thật; khi chưa cấu hình SMTP, lời mời vẫn hiện trong ứng dụng nhưng email chưa được gửi.
- Số người đang ở và trạng thái “Đã đủ” do chủ tin cập nhật. Việc gia nhập một nhà chưa tự động sửa số người trong tin đăng vì một nhà có thể không gắn với tin nào.
- Các khối chi phí, công nợ, quyết toán và việc nhà trong ảnh mẫu thuộc Phase 7–8; Phase 6 chưa thêm dữ liệu giả cho các khối đó.
