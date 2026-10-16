# Dữ liệu demo tuyển dụng trên Render

Đã nạp và kiểm chứng qua API production ngày 16/10/2026:

- 10 nhân vật tên Việt: 8 tài khoản hoạt động, 1 bị khóa và 1 đã đóng cho trang quản trị.
- 23 tin: 11 cho thuê phòng, 8 ở ghép, 4 tìm phòng; gồm 15 tin công khai và các
  trạng thái nháp/chờ duyệt/từ chối/đóng.
- Lần bổ sung mới nhất có 4 tin cho thuê, 3 tin ở ghép, sử dụng đủ 7 ảnh trong
  `backend/image`. Ảnh đã upload lên Cloudinary; dữ liệu không phụ thuộc file seed.
- Một nhà, 3 thành viên, 9 khoản chi đủ danh mục, có thanh toán/chứng từ/công nợ,
  việc nhà, chi định kỳ, chat và bình chọn.
- 5 yêu cầu hỗ trợ, 12 đơn dịch vụ, 6 yêu cầu hoàn tiền, 3 báo cáo và nhật ký demo.

## Đăng nhập

Mật khẩu chung **`roomora@123456`**, theo yêu cầu chủ dự án. Chỉ dùng cho tài khoản
demo; tài khoản admin và ba thành viên nhà hiện có giữ nguyên thông tin đăng nhập.

| Tên | Email |
| --- | --- |
| Nguyễn Mai Anh | demo.mai-anh@roomora.example |
| Trần Minh Khang | demo.minh-khang@roomora.example |
| Lê Thu Hà | demo.thu-ha@roomora.example |
| Phạm Quốc Bảo | demo.quoc-bao@roomora.example |
| Hoàng Ngọc Linh | demo.ngoc-linh@roomora.example |
| Võ Tuấn Kiệt | demo.tuan-kiet@roomora.example |
| Đặng Hoài Nam | demo.hoai-nam@roomora.example |
| Đỗ Bảo Trân | demo.bao-tran@roomora.example |

Hai nhân vật còn lại `demo.duc-huy@roomora.example` và
`demo.thao-vy@roomora.example` cùng hash mật khẩu mới nhưng vẫn bị khóa/đóng.
Miền email ví dụ không nhận OTP; dùng đăng nhập trực tiếp, không thử quên mật khẩu.

## Nhà chung và tài khoản thật

Chỉ ba tài khoản sau có quyền vào nhà demo, không cấp quyền này cho user mới:

- `c7e49572-ead7-4b7e-9ec7-6d5726671814` — chủ nhà.
- `d3654261-2ece-46ec-9976-bcdb16d3fdff`.
- `d677d369-f4e9-40d8-940c-bfe688d8de4c`.

Admin hiện có: `68566809-1f22-4d61-adea-07261f5897c5`.
Mật khẩu, role, hồ sơ và khai báo danh tính của các tài khoản thật không bị sửa.
Các khoản tiền, giao dịch, chứng từ và danh tính mới đều là mô phỏng.

## Kiểm chứng và dọn file

Đã kiểm tra cả 7 tin mới và ảnh Cloudinary trả HTTP 200, đăng nhập website bằng
mật khẩu mới, đọc phiên/hồ sơ danh tính/tin của tôi và đăng xuất phiên test.
Đã kiểm tra hash mật khẩu của cả 10 user demo bằng PasswordService thực tế.

Đã xóa entry seed, folder `scripts/demo`, npm scripts seed và các script seed tạm
trong `.verification`. Ảnh người dùng cung cấp trong `backend/image` được giữ.
`phase12-fixture.mjs` và `set-admin.mjs` có trước vẫn giữ vì phục vụ công việc khác.
Không xóa dữ liệu hoặc audit marker trên DB khi dọn file seed.

Xem [những credential đã lộ và cách đổi đồng bộ](credential-rotation.md).
