# Rà soát và chỉnh giao diện Roomora — 13/10/2026

## Phương pháp

Đọc [Impeccable](https://github.com/pbakaus/impeccable) tại commit `245ad82`, các hướng dẫn `polish`, `distill`, `operate`, `craft-floor`; đối chiếu `backend/room.todo`, thiết kế tham khảo, theme và component hiện có. Bộ nạp `impeccable context` không chạy vì không ghi được cache engine ngoài workspace; hướng dẫn được đọc trực tiếp. Không thêm dependency frontend hoặc hook tự chạy.

## Vấn đề và thay đổi

| Quan sát | Thay đổi |
| --- | --- |
| Glow nền và bóng màu khiến nhiều vùng cùng nổi bật | Nền kem phẳng, viền mảnh cho khung; bóng trung tính chỉ cho menu nổi |
| Nhãn quảng bá in hoa lặp trên tiêu đề | Bỏ nhãn trang trí; giữ nhãn loại tin, trạng thái, vai trò và bước có ý nghĩa |
| Nút, khung, tiêu đề thiếu một thang thống nhất | Bổ sung token góc bo; chỉnh thang chữ và khoảng cách chữ tiếng Việt |
| Ba thẻ giới thiệu cùng một công thức | Một minh họa chung, ba dòng liên kết dẫn vào tác vụ |
| Ba nhóm tin trang chủ kéo dài khi ít dữ liệu | Ba cột trên desktop, chuyển cấu trúc trên tablet/mobile; từng loại tin vẫn độc lập |
| Footer quảng bá lớn lặp ở màn hình thao tác | Footer thông tin trên trang chủ, footer gọn trên các màn hình còn lại |
| Thanh kết quả và bộ lọc bị đóng thành nhiều khung | Kết quả dùng đường phân cách, bộ lọc desktop nằm trên nền trang |
| Ký tự Unicode dùng làm icon lưu tin và ảnh trống | SVG dùng chung, trạng thái lưu có nhãn và `aria-pressed` |
| Thẻ nâng và đổ bóng khi hover | Phản hồi bằng màu/viền; giữ phản hồi nhấn nút, focus panel và giảm chuyển động |
| Kết quả gồm nhiều loại tin nhưng gọi chung là phòng | Nhãn kết quả và trạng thái trống dùng từ “tin” |

Giữ màu cam đỏ/kem, font Be Vietnam Pro, các loại tin, API, quyền riêng tư và các thao tác hiện có. Giữ biểu đồ có dữ liệu, màu tài chính có ngữ nghĩa và cơ chế focus/scroll chung. Các thay đổi backend và phần mở rộng thống kê admin đang có trong workspace không thuộc đợt sửa giao diện này.

## Kiểm chứng

- Production build frontend, TypeScript, ESLint và 8 kiểm thử API frontend qua.
- Edge trên bản production local riêng: trang chủ có dữ liệu/trống, tìm và lọc tin, chi tiết ba loại tin và hai trạng thái ở ghép, hồ sơ, xác thực, onboarding/cài đặt, editor năm bước, tin của tôi/đã lưu, kết nối, thông báo, lịch hẹn, tin nhắn, nhà chung/công nợ, dịch vụ và sáu màn hình admin.
- Kiểm tra bố cục ở 320, 390, 430, 768, 820, 1024, 1366, 1920px; không tràn ngang trong các trường hợp đã chạy.
- Kiểm tra menu bằng bàn phím, tạm dừng/đổi ảnh, tạm dừng minh họa, giảm chuyển động, lỗi/tải lại danh sách, icon lưu tin, chuyển bước editor, chọn biểu đồ, đổi tháng, số âm do điều chỉnh và lỗi/tải lại báo cáo. Không phát hiện lỗi JavaScript trong các lượt hoàn tất.
- Ảnh và báo cáo local: `.verification/impeccable-results/`; script kiểm chứng và bản nguồn công cụ nằm trong `.verification/`, được Git ignore.

Response API được giả lập trong trình duyệt, không ghi database. Đây là bằng chứng hiển thị/tương tác UI, không xác nhận nghiệp vụ với tài khoản thật. Mức độ có gu cần đánh giá qua trải nghiệm và phản hồi người dùng; một bộ quy tắc không tự chứng minh chất lượng thẩm mỹ.

## Duy trì

`PRODUCT.md` giữ context sản phẩm. `DESIGN.md` ghi quyết định thiết kế. `docs/ui-theme.md` tiếp tục là nguồn hướng dẫn màu và chuyển động; các quy tắc của đợt chỉnh này được bổ sung ở cuối tài liệu đó.
