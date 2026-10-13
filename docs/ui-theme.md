# Roomora UI theme

Bảng màu chung theo ảnh landing người dùng xác nhận: cam đỏ làm màu chủ đạo,
nền kem hồng, chữ đen/xám ấm. Áp dụng cho toàn bộ giao diện và màn hình mới.

| Vai trò | Màu | Cách dùng |
| --- | --- | --- |
| Primary | `#E65036` | Biểu tượng thương hiệu, chữ nhấn lớn, điểm nhấn cam đỏ |
| Primary action | `#D3432B` | CTA và lựa chọn có chữ trắng; cùng tông cam đỏ, đậm hơn để dễ đọc |
| Primary foreground | `#B93722` | Liên kết, chữ nhỏ và trạng thái đang chọn trên nền sáng |
| Secondary | `#F28E6B` | Điểm nhấn cam đào, gạch dưới, icon phụ |
| Tertiary | `#967264` | Icon hỗ trợ và các mảng nâu ấm nhạt |
| Neutral | `#FAF8F5` | Nền trang màu kem |
| Foreground | `#211F1D` | Tiêu đề, chữ thương hiệu và nội dung chính |
| Muted | `#625750` | Nội dung phụ, chú thích |

Nguồn màu duy nhất: `frontend/src/app/theme.css`, được import bởi `globals.css`.
Các màu nền nhạt, hover, selection, overlay và shadow được suy ra từ bảng màu
qua `color-mix()`. Giữ Be Vietnam Pro làm font chung.
Ảnh landing cam đỏ là chuẩn về cách phân bố màu và thứ bậc hành động.
Nền nhấn dùng kem hồng/cam nhạt.

## Quy tắc cho màn hình mới

- Tái sử dụng component trong `frontend/src/components/ui.tsx`.
- Dùng semantic token như `var(--background)`, `var(--surface)`, `var(--primary)`,
  `var(--muted)`, `var(--border)`, `var(--primary-soft)` trong CSS.
- Tailwind dùng `bg-background`, `bg-surface`, `bg-primary-action`, `text-on-primary`,
  `text-primary-foreground`,
  `text-foreground`, `text-muted`, `border-border`, `bg-secondary`,
  `text-secondary-foreground`, `bg-tertiary-soft`; mapping ở `@theme inline`.
- Không khai báo lại màu hex/rgb riêng cho từng trang. Nếu cần thêm vai trò màu,
  bổ sung token vào `theme.css` và mapping Tailwind tương ứng.
- Nút chính: nền `--primary-action`, chữ `--on-primary`, hover `--primary-hover`.
  Chữ nhấn lớn dùng `--primary`; chữ cam nhỏ dùng `--primary-foreground`.
  Chữ trên nền cam đào dùng `--secondary-foreground`. Nội dung phụ dùng `--muted`.
- Thương hiệu: biểu tượng nhà nền cam đỏ, chữ Roomora màu `--foreground`, dấu
  chấm cam đỏ. Nút phụ dùng chữ trung tính và viền `--border-strong`.
- Trạng thái lỗi dùng `--danger`, `--danger-soft`, `--danger-foreground`;
  trạng thái thành công dùng nền nhấn nhạt và chữ cam đậm kèm nội dung/icon rõ ràng.
- Tài chính dùng màu ngữ nghĩa: `--success-*` xanh lá cho tiền cần nhận/đã xác nhận,
  `--danger-*` đỏ cho tiền đang nợ, `--warning-*` vàng cho trạng thái chờ,
  nền trung tính cho công nợ bằng 0. Luôn có nhãn chữ và dấu số đi kèm màu.
  `--info-*` xanh dương dành cho thông tin hỗ trợ; nút thao tác vẫn giữ màu thương hiệu.
- Giữ màu nhận diện của logo bên thứ ba, ví dụ logo Google.

## Giao diện sáng và tối

Nút trên header chuyển `data-theme` của thẻ `html` giữa `light` và `dark`.
Mặc định sáng; lựa chọn lưu tại `roomora-theme` trong localStorage. Token tối
được khai báo chung tại `theme.css`; mọi màn hình tiếp tục dùng semantic token.
`--on-primary` luôn trắng, độc lập với `--surface`. Không dùng `--primary-hover`
làm màu chữ; dùng `--primary-foreground` để chữ rõ trong cả hai chế độ.
Thẻ dashboard nổi bật dùng cặp `--surface-inverse` / `--on-inverse`;
không dùng `--foreground` làm nền của thẻ có chữ trắng.

Các checkbox, switch, search input và loader thích nghi với theme và giảm
chuyển động. Nguồn Uiverse, vị trí tích hợp và kiểm chứng tại `ui-uiverse.md`.

`button-secondary` là nút viền trung tính cho hành động phụ. Tên variant chỉ
thứ bậc hành động; điểm nhấn cam được dùng qua token `--secondary`.

## Chuyển động và minh họa tương tác

- Dùng `RoomoraFigure` với `@lucasmarkes/hairline` phiên bản `0.5.0`.
  Hình tải khi cách viewport tối đa 120px, giữ tỷ lệ 5:4 để tránh đổi bố cục.
  Màu Hairline dùng token chung trong `frontend/src/app/motion.css`.
- Elevator minh họa nơi ở, Hub minh họa kết nối, Loupe minh họa tìm kiếm,
  Drawer minh họa trạng thái trống. Hình trang trí không thêm điểm dừng bàn phím;
  tiêu đề và nút luôn cung cấp đủ thông tin.
- Trang chủ có minh họa tự chạy và nút tạm dừng. Footer và trạng thái trống chỉ
  phản ứng với con trỏ. Admin giữ footer gọn, không thêm hình vào bảng hay số tiền.
- Nút phản hồi khi nhấn; thẻ tin và hồ sơ nâng nhẹ khi hover bằng chuột.
  Panel mới mở hiện nhẹ một lần; cập nhật dữ liệu không khởi động lại hiệu ứng.
- Với `prefers-reduced-motion: reduce`, tắt tự chạy, tương tác chuyển động của
  hình và hiệu ứng CSS. Slideshow cũng ngừng tự đổi ảnh; nút trước/sau vẫn dùng
  được. Slideshow có nút tạm dừng riêng; hover tạm ngưng và focus vào nút trước/sau
  dừng tự chạy.
- Hiệu ứng chưa chứng minh mức độ hài lòng hay giữ chân người dùng. Đánh giá
  hiệu quả qua khả năng hoàn tất tìm phòng/kết nối và phản hồi thực tế.

Kiểm chứng local ngày 13/10/2026: production build, lint, TypeScript và 8 kiểm thử
API frontend qua. Edge xác nhận lazy mount, phản ứng với con trỏ, nút dừng tự chạy
và chế độ giảm chuyển động. Trang chủ không tràn ngang ở 320/390/430/768/820/1024/
1366/1920px; 20 đường dẫn khách (gồm chuyển hướng có sẵn) qua 320/768/1440px.
UI đăng tin `ROOM_WANTED`, trạng thái chưa có nhà chung và sáu trang admin dùng
response fixture trong trình duyệt; đây là kiểm chứng UI, không chứng minh nghiệp
vụ của phiên đăng nhập thật. Không ghi dữ liệu kiểm thử vào database.
Ảnh và báo cáo lưu local trong `.verification/hairline-results/`.

## Tinh chỉnh theo Impeccable — 13/10/2026

Hướng dẫn giao diện hiện hành bổ sung tại `../DESIGN.md`; phạm vi và kiểm chứng
tại `ui-refinement.md`. Giữ bảng màu và Be Vietnam Pro. Dùng token góc bo
`--radius-control`, `--radius-panel`, `--radius-media`; khung tĩnh dùng viền,
menu nổi dùng `--shadow-popup`. Trang chủ dùng một minh họa và ba lối đi dạng dòng;
footer các màn hình thao tác được thu gọn. Không dùng glow nền, nhãn quảng bá in hoa
trên mỗi tiêu đề hoặc hiệu ứng nâng thẻ khi hover. Trình chiếu, focus panel và
`prefers-reduced-motion` vẫn hoạt động. Điều khiển minh họa chỉ xuất hiện khi vùng
minh họa hiển thị. Các ghi nhận kiểm chứng Hairline ở trên là của bố cục trước đợt này.
