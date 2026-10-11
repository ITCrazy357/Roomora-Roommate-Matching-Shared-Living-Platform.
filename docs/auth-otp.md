# Xác thực email bằng OTP

Đăng ký và quên mật khẩu sử dụng OTP **6 chữ số**, bao gồm số 0 ở đầu.
Mã dùng một lần, có hiệu lực 5 phút. Gửi lại sau 60 giây; tối đa 5 mã trong
một giờ cho mỗi email và mục đích. Mỗi mã cho phép tối đa 5 lần nhập sai.
Gửi lại thay thế mã cũ; xác minh email và khôi phục mật khẩu có mã riêng.

## Luồng và API

Tất cả đường dẫn dưới `/api/v1/auth`; POST cần Origin hợp lệ như API hiện có.

| API | Body | Kết quả |
| --- | --- | --- |
| `POST /register` | `email`, `password`, `displayName` | Tạo tài khoản chưa xác minh, cấp challenge OTP; thêm `emailSent` |
| `POST /email-verification/resend` | `email` | Challenge mới và thông báo chung |
| `POST /email-verification/confirm` | `challengeId`, `code` (chuỗi 6 số) | Xác minh email, tạo session HttpOnly, trả `user` |
| `POST /password/forgot` | `email` | Challenge mới và thông báo chung |
| `POST /password/verify` | `challengeId`, `code` | Trả `token`, `expiresAt` để đặt lại mật khẩu |
| `POST /password/reset` | `token`, `newPassword` | Đổi mật khẩu và thu hồi mọi phiên cũ |

Challenge gồm `challengeId`, `expiresAt`, `resendAt`, `serverTime` và
`developmentOtp` nếu bật chế độ local trên request loopback. UI dùng thời gian
server cho bộ đếm OTP. Token sau xác nhận OTP chỉ giữ trong React state,
không lưu URL/localStorage. Tải lại trang cần bắt đầu luồng khôi phục mới.

`user.hasPassword` cho biết tài khoản có mật khẩu Roomora. Tài khoản chỉ dùng
Google không có nút đổi/đặt lại mật khẩu và không nhận OTP khôi phục. Tài khoản
dùng mật khẩu rồi liên kết Google vẫn đổi mật khẩu được. Tài khoản bị khóa
không xác minh hoặc đặt lại mật khẩu được; khóa tài khoản hủy mã và quyền reset
đã cấp để chúng không có hiệu lực lại sau khi mở khóa.

## Database và bảo vệ

`AuthOtp` lưu một challenge hiện hành cho mỗi email/mục đích, HMAC-SHA256 của mã,
số lần nhập sai, thời hạn và bộ đếm gửi. Email không tồn tại/không đủ điều kiện
cũng nhận challenge giả và cùng giới hạn gửi để phản hồi không phân biệt tài khoản.
Chúng không được gửi email và không được cấp quyền xác thực. Rate limit IP bổ sung
vẫn dùng cơ chế trong tiến trình hiện có; giới hạn email và số lần thử mã nằm trong DB.

Transaction khóa user trước rồi advisory lock email/mục đích; request đồng thời
không ghi đè bộ đếm hay sử dụng mã hai lần. Nhập sai vẫn commit số lần thử.
Xác nhận OTP khôi phục cấp AuthToken loại `PASSWORD_RESET_GRANT`, ngẫu nhiên
32 byte và chỉ dùng một lần trong 5 phút; không tự đăng nhập sau đổi mật khẩu.
Xác nhận OTP mới hủy quyền reset trước đó. Backend kiểm tra lại tài khoản, khóa,
thời hạn và trạng thái sử dụng trong transaction lúc đổi mật khẩu.

Migration `20261011140000_auth_otp` thêm model và vô hiệu các link xác thực/reset
cũ. Link reset cũ chuyển về `/quen-mat-khau`; `/xac-minh-email` mở luồng nhập OTP.
Các tài khoản, mật khẩu, session và liên kết Google hiện có được giữ lại.

## Cấu hình

- `AUTH_OTP_SECRET`: khóa ngẫu nhiên ít nhất 32 ký tự, bắt buộc production;
  mọi instance phải cùng khóa. Tạo bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `AUTH_DEV_EXPOSE_LINKS`: tên biến cũ, nay trả OTP local; phải tắt production.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `MAIL_FROM`, tùy máy chủ có
  `SMTP_USER`/`SMTP_PASSWORD`: gửi email chứa mã OTP. Không có SMTP thì chỉ thử local.

Migration dùng `prisma migrate deploy`, không dùng reset/db push trên dữ liệu thật.
Kiểm thử E2E OTP sử dụng PostgreSQL và mock SMTP để không gửi thư thật.
