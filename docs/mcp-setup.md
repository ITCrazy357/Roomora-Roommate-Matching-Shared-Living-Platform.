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
Script tự tìm CLI trên PATH, sau đó trong extension Codex của VS Code/Insiders
trên Windows. Có thể đặt `CODEX_CLI` để chọn một executable cụ thể.
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

## 2. GitHub MCP

Đã cài ngày 22/10/2026:

- Binary chính thức `github/github-mcp-server` phiên bản `2.0.3`, Windows x86_64,
  tại `%USERPROFILE%\.codex\tools\github-mcp\v2.0.3`.
- SHA-256 của archive được đối chiếu với metadata release trước khi giải nén:
  `f0e1b9880a1b88730d1250d1c25cfee39617ec3e800a7a252f2279cd0c8394e0`.
- Server `github` được bật trong Codex; bản sao config trước khi thêm server:
  `%USERPROFILE%\.codex\backups\config-before-github-20261022-234848.toml`.
- Launcher người dùng là `%USERPROFILE%\.codex\tools\github-mcp\start-github-mcp.mjs`,
  được sao chép từ [scripts/start-github-mcp.mjs](../scripts/start-github-mcp.mjs).
- Dùng `--read-only`, các toolset `repos,pull_requests,actions` và công cụ `get_me`.
  Có 20 công cụ; danh sách thực tế không chứa thao tác ghi, merge hoặc kích hoạt workflow.

Launcher lấy thông tin đăng nhập cho `github.com` và tài khoản cấu hình từ Git
Credential Manager, tắt đăng nhập tương tác rồi truyền token qua environment của
process server. Không lưu token trong source, config, command line hoặc báo cáo.
Không tạo thêm PAT. Thiếu credential thì launcher dừng với lỗi tổng quát, không
in nội dung credential hoặc tự mở màn hình đăng nhập.

Đây là cấu hình Codex theo người dùng. Quyền đọc dựa trên credential GitHub đã có,
không bị giới hạn riêng cho repository Roomora. Chế độ chỉ đọc của MCP không thu
hẹp quyền gốc của credential được dùng cho các công cụ Git khác.

### Cài trên máy Windows khác

Yêu cầu Node 22, Git và Git Credential Manager đã đăng nhập GitHub. Thư mục SDK
kiểm tra từ mục Playwright MCP được tái sử dụng; không thêm dependency ứng dụng.
Sao lưu `%USERPROFILE%\.codex\config.toml` trước khi đăng ký.

Từ thư mục gốc repository, tải và kiểm tra binary:

```powershell
$toolingDir = Join-Path $env:USERPROFILE '.codex\tools\github-mcp'
$versionDir = Join-Path $toolingDir 'v2.0.3'
New-Item -ItemType Directory -Path $versionDir -Force | Out-Null
$archive = Join-Path $versionDir 'github-mcp-server_Windows_x86_64.zip'
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/github/github-mcp-server/releases/download/v2.0.3/github-mcp-server_Windows_x86_64.zip' -OutFile $archive
$expected = 'f0e1b9880a1b88730d1250d1c25cfee39617ec3e800a7a252f2279cd0c8394e0'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Checksum mismatch; do not extract or run this archive.'
}
Expand-Archive -LiteralPath $archive -DestinationPath $versionDir -Force
Copy-Item -LiteralPath scripts/start-github-mcp.mjs -Destination $toolingDir
```

Đăng ký bằng tài khoản của người sử dụng máy đó:

```powershell
$githubUser = 'YOUR_GITHUB_LOGIN'
$nodeExe = (Get-Command node.exe).Source
$launcher = Join-Path $toolingDir 'start-github-mcp.mjs'
$serverExe = Join-Path $versionDir 'github-mcp-server.exe'
codex --no-daemon mcp add github --env "GITHUB_MCP_BINARY=$serverExe" --env "GITHUB_MCP_USERNAME=$githubUser" -- $nodeExe $launcher
codex --no-daemon mcp get github --json
```

Tài khoản đã kiểm chứng trên máy hiện tại là `ITCrazy357`. Sau khi cập nhật source
launcher, sao chép lại vào thư mục công cụ người dùng để bản Codex chạy được cập nhật.
Không cần cài Docker hoặc khởi chạy backend/frontend Roomora để dùng GitHub MCP.

### Kiểm chứng kết nối thật

Từ thư mục gốc repository:

```powershell
node scripts/check-github-mcp.mjs
```

Script đọc server `github` đã đăng ký, kết nối qua MCP SDK và lấy tên repository
từ `git remote get-url origin`, giữ nguyên dấu chấm cuối tên repository Roomora.
Script tự tìm CLI trên PATH, sau đó trong extension Codex của VS Code/Insiders
trên Windows; không cần thêm đường dẫn extension vào Git Bash. Có thể đặt
`CODEX_CLI` để chọn executable cụ thể hoặc `ROOMORA_MCP_TOOLS_DIR` nếu SDK
được cài ở vị trí khác. Chạy bằng terminal người dùng có quyền đọc Windows
Credential Manager và truy cập GitHub; sandbox có thể không đọc được credential.

Với Git Bash trên máy hiện tại:

```bash
cd /f/VSCode/Projects/Roomora
export PATH="/c/Users/HP/AppData/Local/Author Software/nvm/installs/v22.23.2:$PATH"
node scripts/check-github-mcp.mjs
```

Nếu từng đặt `CODEX_CLI` sai, chạy `unset CODEX_CLI` rồi thử lại để dùng cơ chế tự tìm.

Kiểm tra đã qua với API GitHub thật:

- Khởi tạo MCP và nhận danh sách 20 công cụ đều có `readOnlyHint: true`.
- `get_me` trả tài khoản đã cấu hình.
- Đọc `.github/workflows/ci.yml` từ repository remote.
- Liệt kê PR; tại thời điểm kiểm tra repository chưa có PR.
- Liệt kê các lần chạy Actions gần nhất và đọc log một job CI đã hoàn thành;
  chỉ giữ metadata, không lưu nội dung log vào artifact.

Báo cáo tại `.verification/github-mcp/report.json`; schema công cụ tại
`.verification/github-mcp/capabilities.json`. Đây là bằng chứng gọi MCP thật qua
SDK với GitHub thật; việc namespace được nạp trong một cửa sổ Codex cụ thể cần
kiểm tra danh sách công cụ hoặc `/mcp` ở cửa sổ đó. Nếu chưa thấy `github`, mở phiên mới.

Không có thay đổi PR, issue, workflow, repository hoặc secret GitHub trong bước này.
Tạm tắt: đặt `enabled = false` trong `[mcp_servers.github]`.
Gỡ đăng ký: `codex --no-daemon mcp remove github`.

Nguồn: [GitHub MCP chính thức](https://github.com/github/github-mcp-server),
[cấu hình chế độ chỉ đọc](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md).

## Các mục tiếp theo

| Thứ tự | Mục | Trạng thái |
| --- | --- | --- |
| 1 | Playwright MCP hỗ trợ kiểm tra UI | Đã cài, bật và gọi MCP thật với UI local |
| 2 | GitHub MCP hỗ trợ PR/CI | Đã cài, bật và gọi MCP thật đọc repo/PR/CI/log; chỉ đọc |
| 3 | PostgreSQL MCP với quyền chỉ đọc | Chưa cấu hình |
| 4 | MCP server riêng cho Roomora | Chưa triển khai; cần giữ kiểm tra quyền nghiệp vụ |
