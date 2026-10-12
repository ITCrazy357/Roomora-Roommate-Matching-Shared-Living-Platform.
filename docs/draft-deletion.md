# Xóa bản nháp — 12/10/2026

Chủ tin có nút **Xóa bản nháp** ở Tin của tôi, trang chi tiết và editor.
Nút chỉ hiện với tin DRAFT đã lưu, có xác nhận và trạng thái đang xóa.
Hủy xác nhận không gửi yêu cầu. Xóa tại danh sách cập nhật số tin và thông báo;
xóa từ chi tiết/editor trở về Tin của tôi. Tin ở trạng thái khác dùng luồng
đóng tin hiện có.

`DELETE /api/v1/listings/:id` nhận `{ version }`. Backend kiểm tra chủ tin,
trạng thái DRAFT và phiên bản dưới khóa user → listing trong transaction.
Thêm `deletedAt`, đóng/kết thúc đợt đăng, bỏ boost, hết hiệu lực đơn chờ và
xóa bản ghi ảnh. Ảnh Cloudinary được dọn sau commit; dùng cơ chế hiện có ghi
log khi provider không dọn được ảnh. Không xóa lịch sử thanh toán, hoàn tiền,
đẩy tin hay kiểm duyệt của tin từng công khai rồi được sửa về bản nháp.

Tin đã xóa không hiện trong danh sách công khai/của tôi/đã lưu/kiểm duyệt,
kể cả bộ lọc CLOSED. API đọc, sửa, gửi duyệt và tải ảnh không cho truy cập lại.
Giao dịch đến muộn vẫn được ghi nhận và tạo yêu cầu hoàn tiền theo quy tắc
hiện có, không cấp boost cho tin đã xóa. Hóa đơn cũ vẫn tải được.

Migration `20261012150000_delete_listing_drafts` đã áp dụng trên PostgreSQL local.
95 E2E HTTP/PostgreSQL về tin đăng/thanh toán đã qua, gồm xóa đồng thời với
gửi duyệt, quyền/trạng thái/phiên bản, ảnh và bảo toàn giao dịch/hóa đơn.
Build/lint backend/frontend qua. Edge kiểm tra hủy/xác nhận ở ba màn hình,
cập nhật/tải lại danh sách và ẩn nút ở tin công khai. Không lỗi JavaScript hoặc
tràn ngang ở 320/390/430/768/820/1024/1366/1920 px; chưa kiểm tra Safari/iOS thật.
Minh chứng: `.verification/delete-draft-report.json` và `delete-draft-*.png`.
