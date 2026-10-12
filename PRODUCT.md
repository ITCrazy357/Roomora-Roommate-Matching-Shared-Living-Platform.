# Roomora

Roomora giúp người dùng tìm phòng, tìm người ở ghép và quản lý sinh hoạt trong nhà chung. Nội dung và giao diện chính dùng tiếng Việt.

## Người dùng và công việc

- Khách xem tin công khai, hồ sơ công khai và tìm kiếm theo khu vực, ngân sách, thói quen.
- Người dùng đăng và lưu tin, gửi kết nối, nhắn tin, hẹn gặp, quản lý hồ sơ và quyền riêng tư.
- Thành viên nhà chung xem thông tin nhà, trao đổi, chia việc và theo dõi chi phí, công nợ.
- ADMIN xử lý tin chờ duyệt, báo cáo, người dùng, thông báo hệ thống và hoàn tiền. Quyền ADMIN độc lập với vai trò trưởng nhà.

## Sự thật cần giữ

- `ROOM_RENTAL` là phòng cho thuê. `ROOMMATE` phân biệt đã có phòng và chưa có phòng. `ROOM_WANTED` là nhu cầu tìm phòng.
- Giá, trạng thái, số thành viên và số liệu dashboard lấy từ API. Không tạo số liệu hoặc lời chứng thực để trang đẹp hơn.
- Địa chỉ riêng, dữ liệu nhạy cảm và chức năng cần đăng nhập tuân theo quyền hiện có.
- Trạng thái đang tải, trống, lỗi, hết phiên và thao tác đang xử lý cần rõ ràng.

## Ràng buộc thiết kế

Giữ bảng màu cam đỏ/kem trong `frontend/src/app/theme.css`, font Be Vietnam Pro và component dùng chung. UI phải đọc và thao tác được từ màn hình 320px, bằng bàn phím và khi giảm chuyển động.

Nguồn nội bộ: `backend/room.todo`, `docs/ui-theme.md`, các DTO/service và frontend hiện hành. Tài liệu này ghi context sản phẩm để các lần chỉnh UI sau tiếp tục đúng phạm vi.
