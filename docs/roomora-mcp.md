# MCP tra cứu tin Roomora

Phạm vi: USER đang hoạt động, email đã xác minh; chỉ tìm và xem tin PUBLISHED của
chủ tin đang hoạt động. Không trả địa chỉ riêng, tọa độ, thông tin chủ tài khoản,
phiên đăng nhập hoặc nội dung kiểm duyệt. Kể cả chủ tin cũng không lấy được bản
nháp qua công cụ trợ lý. Đây là xác thực tài khoản/phiên, không phải eKYC.

## Luồng sử dụng

```text
ChatGPT → metadata OAuth → đăng ký client → PKCE authorize
  → trang Roomora /mcp/uy-quyen → đăng nhập → người dùng đồng ý/từ chối
  → callback ứng dụng → đổi code lấy token → MCP → kiểm tra quyền → tin công khai
```

Trang duyệt quyền mở đăng nhập trong tab mới. Đăng nhập bằng email hoặc Google
(nếu Google đã được cấu hình), quay lại tab duyệt quyền và chọn **Đã đăng nhập ·
Kiểm tra lại**, rồi quyết định. Không tự động đồng ý. Tên ứng dụng do client tự
khai báo; trang hiển thị cả origin nhận callback để người dùng đối chiếu.

Trong Roomora, mở **Hỏi Roomora → Tìm tin**. Ví dụ: `Tìm phòng tại Hà Nội dưới 4 triệu`
hoặc `Tìm ở ghép tại Đà Nẵng`. Bộ nhận diện có phạm vi hẹp; yêu cầu khác dẫn sang
bộ lọc, không tự bỏ tiêu chí và không gọi mô hình/trừ lượt AI. FAQ và yêu cầu hỗ
trợ hiện có vẫn giữ luồng riêng. Chatbot gọi service nội bộ qua session, không
cần vòng HTTP/OAuth về chính backend.

## Cấu hình

Backend, đặt trong môi trường triển khai:

```dotenv
MCP_ENABLED=true
MCP_PUBLIC_ORIGIN=https://api.example.com
MCP_ALLOWED_ORIGINS=https://chatgpt.com
FRONTEND_ORIGIN=https://roomora.example.com
```

Thay domain bằng địa chỉ thật. `MCP_PUBLIC_ORIGIN` chỉ có protocol/host/port,
không có dấu `/` cuối hoặc `/api/v1`; đó là issuer chuẩn, không lấy từ Host header.
HTTPS bắt buộc khi bật ở production. Dev/test mặc định bật và dùng
`http://localhost:5000`; production mặc định tắt cho đến khi cấu hình rõ.
`MCP_ALLOWED_ORIGINS` là danh sách origin browser, phân cách dấu phẩy; frontend
luôn được phép. Client chạy ở server có thể không gửi Origin nhưng vẫn phải có
bearer token. Cookie Roomora không dùng được thay bearer trên MCP.

| Chức năng | Đường dẫn backend |
| --- | --- |
| MCP Streamable HTTP, POST | `/api/v1/mcp` |
| OAuth protected resource metadata | `/.well-known/oauth-protected-resource/api/v1/mcp` |
| OAuth authorization server metadata | `/.well-known/oauth-authorization-server` |
| Đăng ký client | `/api/v1/mcp/oauth/register` |
| Authorize / token / revoke | `/api/v1/mcp/oauth/authorize`, `/token`, `/revoke` cùng prefix OAuth |
| Xem/duyệt yêu cầu, session cookie | `/api/v1/mcp/authorizations/:id`, GET/POST |
| Danh sách/thu hồi kết nối, session cookie | `/api/v1/mcp/connections`, GET; `/:id`, DELETE |

Chạy migration `20261023000000_roomora_mcp_oauth` trước khi khởi động phiên bản mới.
Migration chỉ thêm bốn bảng OAuth. Sao lưu DB trước khi migrate database đang dùng.
Không cấp quyền đọc các bảng này cho PostgreSQL MCP chẩn đoán ở mục 3.

Máy hiện tại đã migrate PostgreSQL local `127.0.0.1:5433/roomora` sau full backup:
`.verification/roomora-mcp/backups/roomora-20261023-013159-ca84ef21c5d4414b95703e83fa429e2a.dump`
và checksum SHA256 đi kèm. Backup có dữ liệu ứng dụng, được gitignore; không upload.

Public client dùng `token_endpoint_auth_method=none`, PKCE S256 và scope duy nhất
`listings:read`. Không triển khai client secret, CIMD, OIDC hoặc client_credentials.
`resource` phải là URL MCP đầy đủ trong cả authorize và đổi/gia hạn token.
Callback HTTPS hoặc HTTP loopback; URI khác phải khớp chính xác, loopback cho phép
đổi port theo SDK. Không tải URL metadata tùy ý từ client.

Code sống 60 giây, dùng một lần. Access token sống tối đa 15 phút; refresh tối đa
14 ngày và không vượt hạn phiên Roomora. Refresh xoay token, phát hiện dùng lại sẽ
thu hồi toàn bộ kết nối. Token/code chỉ lưu dạng hash. Đăng xuất hoặc thu hồi phiên,
khóa/đóng tài khoản hoặc mất trạng thái xác minh làm token không còn sử dụng được.
Origin guard vẫn bảo vệ các API dùng cookie; rate limit Redis dùng chung khi được
cấu hình, production không tự chuyển sang giới hạn theo process nếu Redis lỗi.

Nếu API qua reverse proxy, phải chuyển tiếp cả hai `/.well-known/...` tới backend.
`deploy/Caddyfile` đã có matcher này. Next cũng chuyển tiếp hai URL discovery khi
cấu hình API_PROXY_TARGET; rewrite `/api/v1/*` đơn thuần chưa đủ trên proxy khác.

## Kiểm thử Git Bash

Từ thư mục gốc, Docker PostgreSQL local đang chạy và `backend/.env` trỏ đúng local:

```bash
export PATH="/c/Users/HP/AppData/Local/Author Software/nvm/installs/v22.23.2:$PATH"
cd backend
npm ci
npm run prisma:generate
npm run test:mcp
```

Script tạo DB có tên ngẫu nhiên `roomora_mcp_test_*`, áp dụng migrations, chạy HTTP/
PostgreSQL/MCP SDK cùng hồi quy support rồi xóa DB đó. Không reset database nghiệp
vụ. Có thể dùng `MCP_TEST_DATABASE_URL` để chọn kết nối admin PostgreSQL local khác;
role cần CREATE DATABASE. Không dùng database production hoặc token thật trong test.

Để thử giao diện local, mở hai terminal Git Bash sau khi cài dependencies và migrate:

```bash
# Terminal 1, từ thư mục gốc
cd backend
npm run start:dev
```

```bash
# Terminal 2, từ thư mục gốc
cd frontend
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1 SITE_URL=http://localhost:3000 npm run dev
```

Mở `http://localhost:3000`, đăng nhập bằng USER và chọn Hỏi Roomora → Tìm tin.
Giữ PORT/FRONTEND_ORIGIN khớp cấu hình nếu thay cổng. Giá trị SITE_URL local chỉ để
kiểm tra HTML/sitemap; Google không truy cập được localhost này.

Đã kiểm chứng local: **20 test HTTP/PostgreSQL/SDK** (13 MCP/SEO và 7 support),
**201 unit test qua, 5 bỏ qua theo cấu hình hiện có**; 35 test validation môi trường
nằm trong số unit đó. Browser Chromium đã đi qua đăng nhập fixture, đồng ý/từ chối,
đổi code tại callback, thu hồi trong Cài đặt và tra cứu chat/bộ lọc. Fixture dùng DB
riêng, không gọi Google hoặc OpenAI thật. Chưa chứng minh tương thích bằng phiên
ChatGPT trực tiếp hoặc xác thực Google thật trong lần kiểm tra này.

## Kết nối ChatGPT sau khi triển khai HTTPS

1. Mở tính năng thêm MCP tùy chỉnh trong ChatGPT (Apps/Plugins tùy giao diện và
   quyền tài khoản/workspace). Nhập URL `https://api.example.com/api/v1/mcp`.
2. Chọn OAuth và Dynamic Client Registration; server quảng bá public client `none`
   cùng PKCE S256. Không nhập mật khẩu Roomora hoặc cookie vào ô client secret.
3. Làm theo trang đăng nhập/duyệt quyền Roomora, rồi kiểm tra có đúng hai tool chỉ đọc.
4. Thử tìm tin, xem chi tiết, rồi thu hồi tại Cài đặt Roomora và xác nhận truy cập bị từ chối.

Không thể trỏ ChatGPT cloud trực tiếp vào `localhost` trên máy này. Cần endpoint
HTTPS có thể truy cập, hoặc cơ chế tunnel được nền tảng hỗ trợ; chưa tự mở tunnel
hay publish trong phiên này. Hai tool dùng tên miền nghiệp vụ; không yêu cầu công
cụ ghi dữ liệu để kết nối.

Nguồn: [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
[OpenAI OAuth cho MCP](https://developers.openai.com/plugins/build/auth),
[thêm MCP trong ChatGPT](https://developers.openai.com/api/docs/guides/custom-mcp-server).
