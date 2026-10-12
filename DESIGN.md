# Roomora — hướng thiết kế giao diện

## Bản sắc

Cam đỏ dành cho thương hiệu, hành động chính và lựa chọn đang hoạt động. Nền kem, chữ trung tính ấm, hình ảnh không gian sống và font Be Vietnam Pro tạo cảm giác gần gũi. Dùng một nguồn màu: `frontend/src/app/theme.css`.

## Cấu trúc và thứ bậc

- Trang chủ dẫn vào tin đăng, tìm người và đăng nhu cầu. Ảnh lớn có chú thích minh họa; ba lối đi nằm trên các dòng liên kết, dùng một minh họa chuyển động chung. Các loại tin có mục riêng, không bị nhập nhằng.
- Màn hình tìm kiếm, editor, nhà chung và admin ưu tiên hoàn thành công việc: tiêu đề rõ, bộ lọc gần kết quả, số liệu dễ đọc, hành động chính nổi bật.
- Không dùng nhãn quảng bá in hoa phía trên mỗi tiêu đề. Nhãn loại tin, trạng thái, dịch vụ, vai trò và tiến độ có ý nghĩa nghiệp vụ được giữ.
- Dùng khoảng cách và đường phân cách để chia vùng. Khung chỉ dùng khi gom nội dung cần đọc/thao tác cùng nhau. Không thêm khung trang trí quanh các khối giới thiệu.
- Footer trang chủ chứa thông tin và đường dẫn. Footer các màn hình thao tác gọn, tránh lặp lại lời mời quảng bá.

## Chữ, hình và điều khiển

Tiêu đề màn hình thao tác dùng thang rem ổn định; chữ lớn linh hoạt chỉ dành cho hero. Khoảng cách chữ không nhỏ hơn -0.04em. Dành đủ chiều cao dòng cho dấu tiếng Việt. Giá và số liệu cần so sánh dùng số dạng bảng.

`--radius-control`, `--radius-panel`, `--radius-media` định nghĩa góc bo chung. Nút chính là cam đỏ, nút phụ có viền. Các khung tĩnh dùng viền mảnh, không có bóng màu phủ quanh. Dùng SVG của hệ icon chung thay ký tự làm biểu tượng.

Màu tài chính và trạng thái giữ ngữ nghĩa xanh/đỏ/vàng và luôn có chữ đi kèm. Biểu đồ chỉ hiển thị dữ liệu thật; không xóa biểu đồ có ích vì một quy tắc thẩm mỹ chung.

## Tương tác

Hover thay đổi màu/viền nhẹ. Nhấn nút có phản hồi ngắn; mở panel giữ focus và scroll theo cơ chế dùng chung. Không nâng toàn bộ thẻ khi hover. Trình chiếu có điều khiển trước/sau và tạm dừng. Minh họa lazy load; chế độ giảm chuyển động dừng autoplay. Mọi hành động có nhãn và focus bàn phím rõ ràng.

## Nguồn phương pháp

Áp dụng hướng dẫn `polish`, `distill`, `operate` và `craft-floor` của [Impeccable](https://github.com/pbakaus/impeccable), bản đã đọc tại commit `245ad82` ngày 13/10/2026. Ràng buộc và sự thật của Roomora ưu tiên hơn các quy tắc chung của công cụ. Đây là hướng dẫn thiết kế, không phải dependency chạy trong sản phẩm.

Báo cáo phạm vi thay đổi và kiểm chứng: `docs/ui-refinement.md`.
