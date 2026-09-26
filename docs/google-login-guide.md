# Tự làm đăng nhập Google cho Roomora

Phần Google đã được gỡ. Đây là bài thực hành để bạn tự viết lại sau khi hiểu luồng
email/mật khẩu; không có code OAuth chạy sẵn hoặc nút chờ bật cấu hình.

## 1. Hiểu luồng trước

Trong Roomora, đăng nhập thành công kết thúc bằng `SessionService.create()`.
Google chỉ thay bước kiểm tra mật khẩu bằng bước xác minh danh tính do Google cấp.

```text
Nút Google → backend /auth/google → Google
          → backend /auth/google/callback
          → xác minh danh tính → tìm/tạo User
          → SessionService.create() → frontend /onboarding hoặc /tai-khoan/ho-so
```

`code` là mã tạm để backend đổi token. `id_token` chứa danh tính đã được ký.
`state` nối callback với trình duyệt đã bắt đầu đăng nhập; `nonce` chống phát lại
ID token. `sub` là mã tài khoản Google ổn định. OAuth cấp quyền; OpenID Connect
bổ sung xác thực danh tính. Xem [luồng OpenID Connect chính thức](https://developers.google.com/identity/openid-connect/openid-connect).

## 2. Tạo thông tin ứng dụng

Trong Google Cloud, tạo project, cấu hình consent/branding, đối tượng sử dụng và
test users khi ứng dụng ở chế độ thử nghiệm. Tạo OAuth client loại Web application.
Đăng ký chính xác callback `http://localhost:5000/api/v1/auth/google/callback`.
Xem [thiết lập ứng dụng web](https://developers.google.com/identity/protocols/oauth2/web-server).

Sau này thêm vào **backend/.env**:

```dotenv
GOOGLE_CLIENT_ID=client_id_cua_ban
GOOGLE_CLIENT_SECRET=client_secret_cua_ban
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback
```

Giữ `FRONTEND_ORIGIN=http://localhost:3000`. Client secret chỉ ở backend; không
đặt trong biến `NEXT_PUBLIC_*`. Hiện tại bạn chưa cần thêm ba biến Google.

## 3. Viết từng phần nhỏ

1. **Schema:** thêm bảng liên kết có `userId`, `googleId` duy nhất. Cho phép
   `passwordHash` rỗng với tài khoản chỉ dùng Google; sửa login để tài khoản đó
   luôn bị từ chối ở luồng mật khẩu. Tạo migration mới, không sửa migration cũ.
2. **Service:** tạo `google-auth.service.ts` trong `AuthModule`; dùng thư viện
   Google để đổi code và xác minh token, tránh tự viết kiểm tra chữ ký/JWKS.
3. **Route bắt đầu:** sinh `state`, `nonce` ngẫu nhiên, có hạn và dùng một lần.
   Lưu phía server, gắn với cookie `HttpOnly` của trình duyệt. Redirect sang Google
   với `response_type=code`, scope `openid email profile` và callback đã đăng ký.
4. **Callback:** kiểm tra người dùng hủy, `state`, hạn dùng, cookie và chỉ dùng
   trạng thái một lần. Backend đổi code; kiểm tra chữ ký, issuer, audience, expiry,
   nonce và yêu cầu email đã xác minh. Không chỉ decode JWT rồi tin payload.
5. **Tài khoản:** tìm bằng `googleId = sub`. Nếu email trùng tài khoản mật khẩu,
   yêu cầu đăng nhập tài khoản đó trước khi liên kết; không tự gộp chỉ vì trùng email.
6. **Session:** dùng lại `SessionService.create()`, redirect về một trong hai
   đường dẫn cố định của Roomora. Nút frontend chỉ mở `/auth/google`.

Các bước xác minh dựa trên [hướng dẫn OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
Phần schema và chính sách liên kết là gợi ý riêng cho Roomora. Hãy hoàn thành
từng bước và kiểm tra trước khi thêm bước tiếp theo.

## 4. Tự kiểm tra

- Lần đầu tạo đúng một tài khoản; lần sau vào đúng tài khoản cũ.
- Hủy consent, state sai/hết hạn/dùng lại, token sai audience đều không tạo session.
- Không liên kết tài khoản mật khẩu khi người dùng chưa chứng minh quyền sở hữu.
- Đăng xuất thu hồi được session vừa tạo; không có secret/token trong URL frontend hay log.
- Chạy callback thật bằng tài khoản test Google, rồi mới coi tích hợp hoàn tất.
