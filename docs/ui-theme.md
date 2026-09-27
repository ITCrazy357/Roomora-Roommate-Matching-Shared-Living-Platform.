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
- Giữ màu nhận diện của logo bên thứ ba, ví dụ logo Google.

`button-secondary` là nút viền trung tính cho hành động phụ. Tên variant chỉ
thứ bậc hành động; điểm nhấn cam được dùng qua token `--secondary`.
