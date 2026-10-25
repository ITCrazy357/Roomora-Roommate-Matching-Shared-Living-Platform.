# Hiển thị Roomora trên Google Search

Google Search tìm và lập chỉ mục website qua SEO. MCP phục vụ ứng dụng AI đã kết
nối, không tự đăng ký Roomora với Google và không bảo đảm xếp hạng.

## Những gì đã có trong mã nguồn

- `/robots.txt` cho phép crawl trang công khai và tránh `/api/`.
- `/sitemap.xml` chứa trang chủ, các trang khám phá và tin PUBLISHED của chủ tin
  đang hoạt động. API `/api/v1/public/listing-sitemap` chỉ trả UUID và updatedAt,
  tối đa 1000/lần bằng cursor; cookie chủ tin không mở rộng kết quả.
- Trang `/phong/:id` tải nội dung công khai từ server mà không chuyển cookie,
  render sẵn nội dung HTML và tạo title, description, canonical/Open Graph riêng.
- Bản nháp/đóng/xóa không có nội dung SSR và được `noindex`. Chủ tin vẫn có thể
  xem bản riêng sau khi browser xác thực; nội dung đó không đi vào HTML SEO.
- Trang tài khoản, tin nhắn, nhà chung, quản trị, xác thực và cấp quyền có header
  `X-Robots-Tag: noindex, nofollow`. Chúng vẫn được bảo vệ bằng kiểm tra quyền thật;
  robots và noindex không thay thế xác thực.

Một sitemap hiện giới hạn 49.000 tin cộng ba trang tĩnh. Khi vượt mức này, cần tách
sitemap/index trước khi mở rộng; không dựa vào một sitemap quá giới hạn giao thức.
Sitemap và dữ liệu SSR không dùng cache nội dung tin giữa các request để tránh
tiếp tục công bố tin sau khi ẩn. API lỗi thì sitemap báo lỗi để crawler thử lại.

## Cấu hình khi build và chạy frontend

```dotenv
SITE_URL=https://your-roomora-domain.example
API_SERVER_BASE_URL=https://your-api-domain.example/api/v1
```

`SITE_URL` là URL chuẩn của website, không phải backend. Không lấy domain từ Host
header. Chưa cấu hình SITE_URL thì không xuất URL sitemap/canonical suy đoán.
`API_SERVER_BASE_URL` dùng ở server; có thể là địa chỉ nội bộ Docker. Nếu bỏ qua,
server dùng NEXT_PUBLIC_API_BASE_URL khi đó là URL tuyệt đối, hoặc kết hợp đường
dẫn tương đối với API_PROXY_TARGET. Không đưa credential/session vào các biến này.

Vercel: thêm SITE_URL và API_SERVER_BASE_URL ở đúng môi trường, sau đó build/deploy
lại. Tài liệu project đang ghi demo `https://roomora-blond.vercel.app`; xác nhận
domain thực sự sử dụng trước khi đặt canonical/Search Console. Compose truyền
SITE_URL vào build/runtime và địa chỉ API nội bộ ở runtime.

## Sau khi deploy

1. Mở `/robots.txt`, `/sitemap.xml` trên domain công khai và kiểm tra URL đúng host.
2. Kiểm tra nguồn HTML một tin công khai: có tiêu đề, nội dung và canonical; không
   có địa chỉ riêng hoặc dữ liệu bản nháp. Tin không công khai phải có noindex.
3. Trong Google Search Console, xác minh quyền sở hữu domain/URL prefix, gửi
   `/sitemap.xml` rồi dùng URL Inspection cho trang chủ và một tin công khai.
4. Theo dõi Page indexing và lỗi crawl. Chờ Google xử lý; không có bảo đảm xuất
   hiện ngay hoặc xếp hạng cụ thể. Với tin từng được index rồi mới ẩn, Google cần
   crawl lại để đọc trạng thái noindex.

Đây là chuẩn bị kỹ thuật ở mã nguồn/local; chưa submit Search Console hoặc có
bằng chứng Google đã lập chỉ mục bản thay đổi.

Chromium local đã kiểm tra sitemap chứa tin công khai và loại bản nháp; tắt
JavaScript vẫn đọc được tiêu đề/nội dung tin và canonical; HTML không có địa chỉ
riêng. Kể cả gửi cookie chủ tin, bản nháp vẫn không xuất hiện trong HTML SSR và có
noindex; sau khi browser xác thực, chủ tin vẫn mở được bản riêng và nút chỉnh sửa.

Nguồn: [JavaScript SEO của Google](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
[sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[URL Inspection](https://support.google.com/webmasters/answer/9012289).
