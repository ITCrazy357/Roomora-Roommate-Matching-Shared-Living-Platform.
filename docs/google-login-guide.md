# Đăng nhập Google trong Roomora

Google xác minh danh tính; Roomora vẫn quản lý đăng nhập bằng `SessionService`
và cookie HttpOnly hiện có. Không lưu access token/refresh token Google vào DB
hay gửi ID token về frontend.

## Cấu hình và chạy

Thêm vào `backend/.env` (chỉ ở local, không commit):

```dotenv
GOOGLE_CLIENT_ID=client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback
FRONTEND_ORIGIN=http://localhost:3000
```

Google Cloud → Google Auth Platform → Clients: tạo client loại **Web application**,
đăng ký chính xác callback trên. Cấu hình Branding, Audience và thêm tài khoản thử
trong Test users. Chỉ cần scope `openid email profile`; không cần Gmail hoặc Drive.
Ở production, callback phải dùng HTTPS. Frontend và API cần cùng site để cookie
`SameSite=Lax` hoạt động (ví dụ `roomora.vn` và `api.roomora.vn`).

Trong thư mục `backend`:

```sh
npm install
npm run prisma:migrate:deploy
npm run start:dev
```

Migration `20260926140000_google_login` thêm hai bảng Google và cho phép tài khoản
không có mật khẩu. Không sửa migration cũ, không reset DB.
Nếu thiếu cả ba biến Google, đăng nhập email vẫn hoạt động và nút Google được ẩn.
Nếu chỉ có một phần cấu hình, backend báo lỗi khi khởi động.

## Đọc code theo thứ tự

| File trong `backend/src/modules/auth/` | Vai trò |
| --- | --- |
| `google-auth.controller.ts` | Nhận request, trả config, redirect và gọi service |
| `google-client.service.ts` | Tạo URL Google, đổi code, xác minh ID token bằng thư viện Google |
| `google-auth.service.ts` | Quản lý state, tìm/tạo tài khoản, liên kết và tạo session Roomora |
| `google-auth.error.ts` | Các mã lỗi cố định, không để lỗi chứa token/secret lọt ra ngoài |

Frontend dùng `GoogleSignIn` ở cả đăng nhập và đăng ký; `GoogleAccountCard` nằm
trong cài đặt. `GoogleAuthNotice` đọc mã kết quả trong URL và hiển thị tiếng Việt.

## Luồng đăng nhập

1. Nút Google mở `GET /api/v1/auth/google` bằng điều hướng trình duyệt.
2. Backend tạo state, nonce và PKCE verifier; lưu bản ghi có hạn 10 phút vào DB.
   State được hash; một cookie HttpOnly riêng ràng buộc lượt đăng nhập với trình duyệt.
3. Google trả về `/api/v1/auth/google/callback`. Backend kiểm tra cookie, state và
   hạn dùng, rồi xóa state bằng thao tác nguyên tử để chỉ một callback dùng được.
4. Thư viện Google đổi code và kiểm tra chữ ký, issuer, audience, thời hạn ID token.
   Roomora kiểm tra thêm nonce và email đã xác minh.
5. Tìm người dùng bằng Google `sub`. Nếu chưa có, tạo User/Profile/GoogleAccount
   trong một thao tác Prisma lồng nhau. Tài khoản Google mới không có mật khẩu.
6. Tạo session Roomora, redirect đến `/onboarding` hoặc `/tai-khoan/ho-so`.

`sub` là định danh ổn định. Nếu Google đổi email, tài khoản đã liên kết vẫn được
nhận diện bằng `sub`; email Roomora không tự đổi theo. Tên và avatar đã chỉnh ở
Roomora cũng không bị ghi đè mỗi lần đăng nhập Google.

## Tài khoản email/mật khẩu đã tồn tại

Không tự gộp tài khoản chỉ vì trùng email. Người dùng đăng nhập bằng mật khẩu,
mở **Cài đặt tài khoản → Tài khoản Google**, xác nhận mật khẩu và chọn Google
có cùng email. `POST /auth/google/link` yêu cầu session và Origin hợp lệ.
Callback liên kết kiểm tra lại đúng session đã bắt đầu thao tác; đăng xuất hoặc
thu hồi phiên trong khi chờ Google sẽ làm liên kết thất bại.

Sau khi liên kết, cả mật khẩu và Google đều đăng nhập cùng tài khoản. Mỗi tài khoản
Roomora liên kết tối đa một Google; mỗi Google chỉ thuộc một tài khoản Roomora.
Chưa có chức năng gỡ/đổi liên kết hoặc đặt mật khẩu cho tài khoản chỉ dùng Google.

## Kiểm thử và giới hạn xác nhận

```sh
npm test
npm run test:e2e
npm run lint
npm run build
```

Unit test dùng token ký RSA thật với khóa kiểm thử để xác minh chữ ký và các claim.
E2E dùng PostgreSQL thật, giả lập riêng phản hồi Google để kiểm tra callback,
cookie, replay đồng thời, tài khoản trùng email và liên kết. Các test không gửi mail
thật và tự dọn tài khoản kiểm thử.

Kiểm tra thực tế: nhấn Google trên trình duyệt, đăng nhập tài khoản Test user, chấp
thuận rồi xác nhận quay về Roomora. Bước này mới xác nhận cả client secret và token
exchange với Google. Test tự động không thay thế lượt đăng nhập Google thật.

Nguồn: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect),
[Google Auth Library cho Node.js](https://github.com/googleapis/google-auth-library-nodejs).
