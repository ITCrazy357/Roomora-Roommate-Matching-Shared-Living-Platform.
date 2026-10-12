# Hai nhu cầu ở ghép — 12/10/2026

`ROOMMATE` lưu thêm `hasRoom` để phân biệt hai lựa chọn trong bước Loại tin.

| Thông tin | Đã có phòng, tìm thêm người | Chưa có phòng, muốn xin ở ghép |
| --- | --- | --- |
| Tiêu đề, nhu cầu, nếp sinh hoạt | Có | Có |
| Diện tích, số người đang ở, số người muốn tìm thêm | Có | Không |
| Ngày có thể dọn vào | Không | Không |
| Chi phí, cọc, địa chỉ riêng, ghim bản đồ, ảnh phòng | Có | Không |
| Ngân sách và khu vực mong muốn | Không | Có |
| Tiện ích | Đang có | Mong muốn |
| Hẹn xem phòng trong chat | Có thể chọn tin | Không thể chọn tin này làm phòng để xem |

Ngày dọn vào được trao đổi giữa các bên. Không thêm quy trình chủ phòng chấp nhận
trên ứng dụng; lịch hẹn gặp trong chat vẫn dùng được khi không chọn tin phòng.
Loại `ROOM_RENTAL` giữ ngày phòng sẵn sàng; `ROOM_WANTED` giữ diện tích mong muốn
và số người dự kiến ở, vì đó là nhu cầu tìm phòng riêng.

Backend chuẩn hóa dữ liệu khi tạo/sửa: tin chưa có phòng không giữ diện tích,
số người, các chi phí phòng, ngày dọn vào, địa chỉ riêng hoặc tọa độ. API trả
số chỗ mặc định 1 và số người đang ở 0 để giữ hợp đồng hiện có; giao diện không
hiển thị các giá trị này khi `hasRoom=false`. Ảnh phòng cũ được giữ trong database
khi đổi lựa chọn, nhưng không hiện trên tin xin ở ghép. Chuyển lại có phòng sẽ
hiện ảnh cũ; thông tin phòng đã bỏ cần nhập lại. Đổi lựa chọn đặt lại `isFull`.

Form, tóm tắt, xem trước, thẻ tin và trang chi tiết cùng dùng `hasRoom`.
Tin chưa có phòng có trạng thái “Đang tìm chỗ ở ghép”; người đăng có thể đánh dấu
“Đã tìm được chỗ ở” và mở lại. Danh sách phòng trong chat và API tạo/đổi lịch hẹn
đều loại tin chưa có phòng. Hồ sơ công khai không trả tọa độ phòng cho tin này.

Migration `20261012140000_roommate_room_status` đã áp dụng trên PostgreSQL local.
Tin `ROOMMATE` cũ mặc định có phòng để giữ thông tin hiện có; người đăng có thể
đổi sang chưa có phòng. Không suy đoán tình trạng phòng từ tiêu đề hay diện tích.

Đã kiểm tra 38 E2E HTTP/PostgreSQL về tin đăng và chat; build và lint backend,
frontend qua. Edge kiểm tra lưu/tải lại, gửi duyệt, đổi lựa chọn, xem trước,
thẻ tin, chi tiết và danh sách phòng trong chat; không lỗi JavaScript. Các màn
chọn nhu cầu, thông tin và chi tiết không tràn ngang tại
320/390/430/768/820/1024/1366/1920 px. Đây là mô phỏng kích thước bằng Edge,
chưa kiểm tra Safari/iOS thật. Minh chứng nằm ở
`.verification/roommate-options-report.json` và `roommate-*.png`.
