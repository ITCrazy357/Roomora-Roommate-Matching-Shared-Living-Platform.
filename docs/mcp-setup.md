# MCP cho Roomora

MCP được cài ở công cụ phát triển của người dùng; backend và frontend Roomora
không cần chạy MCP để phục vụ các chức năng hiện có.

## 1. Playwright MCP

Đã cài ngày 22/10/2026:

- `@playwright/mcp@0.0.83` tại `%USERPROFILE%\.codex\tools\playwright-mcp`.
- `@modelcontextprotocol/sdk@1.29.0` là dependency kiểm tra trong cùng thư mục công cụ.
- Server `playwright` được bật trong `%USERPROFILE%\.codex\config.toml`.
- Dùng Node 22.23.2 qua đường dẫn đầy đủ, Chrome đã cài, `--headless` và `--isolated`.
- Artifact mặc định nằm ở `.verification/playwright-mcp` dưới thư mục làm việc.
- Cấu hình trước khi thêm server được sao lưu tại
  `%USERPROFILE%\.codex\backups\config-before-playwright-20261022-232839.toml`.

Đây là cấu hình Codex theo người dùng, áp dụng cho các workspace dùng cùng Codex home.
Không thêm MCP vào `package.json` của ứng dụng. Giữ nguyên cấu hình ECC hiện có.

### Cài trên máy khác

Chạy PowerShell với Node 22 và Chrome đã cài. `codex` phải có trên PATH.
Sao lưu `config.toml` hiện có trước khi thay đổi.

```powershell
$toolingDir = Join-Path $env:USERPROFILE '.codex\tools\playwright-mcp'
npm.cmd install --prefix $toolingDir --save-exact --ignore-scripts @playwright/mcp@0.0.83
npm.cmd install --prefix $toolingDir --save-dev --save-exact --ignore-scripts @modelcontextprotocol/sdk@1.29.0

$nodeExe = (Get-Command node.exe).Source
$mcpCli = Join-Path $toolingDir 'node_modules\@playwright\mcp\cli.js'
codex --no-daemon mcp add playwright -- $nodeExe $mcpCli --browser chrome --headless --isolated --output-dir .verification/playwright-mcp
codex --no-daemon mcp get playwright --json
```

Đường dẫn Node được lưu cố định để không phụ thuộc launcher nvm; nếu gỡ runtime đó,
cần đăng ký lại server với runtime còn tồn tại. Nếu CLI Codex không cần
`--no-daemon`, có thể bỏ cờ này; bản đóng gói trong extension hiện tại cần cờ đó.

### Kiểm tra trên Roomora

Terminal thứ nhất, từ thư mục gốc repository:

```powershell
Set-Location frontend
$env:NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000/api/v1'
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3006
```

Terminal thứ hai, từ thư mục gốc repository:

```powershell
node scripts/check-playwright-mcp.mjs http://127.0.0.1:3006
```

Script đọc cấu hình `playwright` đã đăng ký với Codex, khởi chạy server qua stdio
và dùng MCP SDK để thực hiện `initialize`, `tools/list`, `tools/call`.
Nếu CLI không có trên PATH, đặt `CODEX_CLI` thành đường dẫn `codex.exe`.
Nếu cài thư mục công cụ khác, đặt `ROOMORA_MCP_TOOLS_DIR`.
Script chỉ nhận URL frontend HTTP loopback. Trong sandbox giới hạn process hoặc
cấu hình người dùng, cần chạy bằng terminal thông thường có quyền mở Chrome.

Kiểm tra đã qua:

- Khởi tạo kết nối và nhận danh sách 25 công cụ từ MCP server.
- Mở trang chủ Roomora và đọc accessibility snapshot.
- Bấm đường dẫn đăng nhập, nhập email/mật khẩu giả, bật/tắt hiển thị mật khẩu.
- Trang đăng nhập không tràn ngang ở chiều rộng 1440px và 390px.
- Không có lỗi JavaScript của trang hoặc request ghi API trong luồng kiểm tra.
- Đóng trình duyệt tách biệt và đóng kết nối MCP.
- Codex đã nạp namespace `mcp__playwright` ngay trong phiên làm việc này;
  gọi trực tiếp `browser_navigate`, `browser_click`, `browser_fill_form`,
  `browser_snapshot` và `browser_close` thành công trên frontend local.

Script dùng API fixture khách cho phiên đăng nhập, tin đăng, cấu hình Google và
thông báo hệ thống; chặn mọi request ghi và API ngoài danh sách fixture.
Kết quả này chứng minh MCP chạy được với UI local; chưa kiểm tra đăng nhập thật,
database, provider, nghiệp vụ người dùng đã đăng nhập hoặc production.

Artifact: `.verification/playwright-mcp/report.json`, `home-snapshot.md`,
`ui-result.md`, `home-desktop.png`, `login-1440.png`, `login-390.png`,
`native-codex-login-snapshot.md`.
Thư mục này đã được gitignore.

Phiên bản 0.0.83 công bố `browser_run_code_unsafe`; script cũng hỗ trợ tên
`browser_run_code` nếu phiên bản khác công bố tên đó. Công cụ chạy mã có thể thực thi
mã trong process MCP; chỉ chạy đoạn mã đã kiểm tra. Phiên trình duyệt tách biệt
không thay thế giới hạn quyền của process.

Cấu hình được ghi sau khi cuộc trò chuyện hiện tại bắt đầu; giao diện hiện tại
đã tự nạp công cụ và gọi MCP thành công. Nếu một phiên Codex/VS Code khác chưa
hiện công cụ, mở phiên mới rồi kiểm tra `/mcp` hoặc danh sách công cụ của giao diện.

Tạm tắt server: đặt `enabled = false` trong `[mcp_servers.playwright]`.
Gỡ đăng ký: `codex --no-daemon mcp remove playwright`.
Không chép toàn bộ bản sao lưu đè lên config nếu sau đó đã có cấu hình mới.

Nguồn: [Playwright MCP chính thức](https://github.com/microsoft/playwright-mcp).

## Các mục tiếp theo

| Thứ tự | Mục | Trạng thái |
| --- | --- | --- |
| 1 | Playwright MCP hỗ trợ kiểm tra UI | Đã cài, bật và gọi MCP thật với UI local |
| 2 | GitHub MCP hỗ trợ PR/CI | Chưa cấu hình |
| 3 | PostgreSQL MCP với quyền chỉ đọc | Chưa cấu hình |
| 4 | MCP server riêng cho Roomora | Chưa triển khai; cần giữ kiểm tra quyền nghiệp vụ |
