# UI Uiverse trong Roomora

Ngày tích hợp: 13/10/2026.

Đã duyệt các nhóm checkbox, button, input, switch, loader và card trên
[Uiverse](https://uiverse.io/). Mã nguồn được đối chiếu với kho chính thức
[Uiverse Galaxy](https://github.com/uiverse-io/galaxy).

## Thành phần đang dùng

| Thành phần | Vị trí | Hành vi |
| --- | --- | --- |
| Button có mũi tên | CTA “Khám phá tin đăng” ở trang chủ | Phản hồi hover ngắn; giữ liên kết và nhãn hiện tại |
| Checkbox có tick | Bộ lọc tiện ích và editor tin đăng | Chọn bằng nhãn hoặc phím Space; giữ giá trị form và state của editor |
| Search input | Tìm kiếm tin đăng | Icon kính lúp, focus rõ, `type="search"`; giữ truy vấn tìm kiếm/bộ lọc |
| Công tắc bật/tắt | Cài đặt quyền riêng tư | Ba lựa chọn hiển thị; gửi boolean qua nút “Lưu cài đặt” như trước |
| Sáng/tối | Header, cả khách và tài khoản đăng nhập | Mặc định sáng; lưu `roomora-theme`; khôi phục trước khi body hiển thị và đồng bộ giữa các tab |
| Loader SVG | `LoadingState` dùng chung | Vòng tải có nhãn `role="status"`; chuyển thành vòng tĩnh khi giảm chuyển động |

Giữ màu cam đỏ/kem và Be Vietnam Pro. Màu tối nằm trong `theme.css`, dùng
`data-theme="dark"`; chữ trên CTA luôn trắng, các trạng thái tài chính/lỗi
vẫn có token riêng. Biểu đồ ECharts cập nhật màu khi đổi theme, không cần tải
lại. Theme vẫn đổi được nếu trình duyệt chặn localStorage.

Các mẫu card đã xem có hiệu ứng lớn hoặc bố cục khác nhu cầu so sánh tin phòng.
Giữ card hiện tại, bổ sung viền cam khi focus bằng bàn phím; không nâng cả card
hoặc giấu giá/nội dung trong hover.

CSS mới nằm tại `frontend/src/app/uiverse.css`, component dùng chung tại
`frontend/src/components/ui.tsx`, công tắc theme tại `theme-toggle.tsx`.
Không thêm package hoặc tài nguyên tải từ Uiverse khi chạy ứng dụng.

## Nguồn và giấy phép

Danh sách sáu mẫu, tác giả và thông báo MIT tại
[UI-LICENSES.md](../frontend/src/components/UI-LICENSES.md).
Thông báo giấy phép có trong bản build qua `/licenses/uiverse.txt`.

## Kiểm chứng

Production build, ESLint, TypeScript và tám kiểm thử API frontend qua.
Edge kiểm tra theme, bàn phím, checkbox, công tắc, truy vấn tìm kiếm, loader,
giảm chuyển động, forced colors và màu biểu đồ.

Các màn hình được kiểm tra gồm trang chủ, tìm tin, tìm người, đăng nhập,
đăng ký, chi tiết phòng/nhu cầu, cài đặt, editor và tổng quan admin.
Kiểm tra ở 320/390/430/768/820/1024/1366/1920 px, có cả giao diện sáng và tối
trên các màn hình đại diện. Không tràn ngang ở các lượt kiểm tra hoàn tất.

API trong browser được thay bằng fixture để kiểm tra render, thao tác và payload;
kết quả không chứng minh lưu database hay nghiệp vụ của phiên đăng nhập thật.
Ảnh và báo cáo local tại `.verification/uiverse-results/`.
