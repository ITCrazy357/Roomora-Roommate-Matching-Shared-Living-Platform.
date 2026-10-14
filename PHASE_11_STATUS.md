# Phase 11 — AI hỗ trợ đúng nghiệp vụ

Ngày kiểm chứng: 14/10/2026.

## Sửa nhấp nháy khi đang xem AI — 14/10/2026

Tái hiện thêm được trường hợp tải báo cáo nền trả 503: hook xóa dữ liệu đang
hiển thị, tháo khung AI và làm scrollY nhảy từ 799 xuống 544px. Tương tự,
lỗi tải nhà chung có thể tháo cả workspace. Đây là nhánh lỗi khác với lỗi
key `generatedAt` đã sửa trước đó.

Báo cáo và nhà chung giờ giữ dữ liệu đã tải khi gặp lỗi mạng, timeout, 429,
5xx hoặc phản hồi JSON lỗi; cảnh báo dùng dữ liệu cũ có nút tải lại nằm cuối
nội dung để không đẩy khung AI đang đọc. 4xx mất quyền/hết phiên/không tồn tại
vẫn gỡ dữ liệu. Hook chỉ bật giữ dữ liệu cho báo cáo; không dùng dữ liệu của
đường dẫn/tháng khác. Lỗi tải nhà tách riêng khỏi lỗi thao tác của người dùng.
Memo khung tóm tắt tránh vẽ lại theo nhịp đồng hồ/cập nhật báo cáo khi props
nhà và tháng không đổi; state ghi chú và cập nhật số lượt vẫn hoạt động.

Production build/TypeScript, lint các file thay đổi và 8 kiểm thử API frontend
qua. Chromium dùng session/API/PostgreSQL thật; riêng lỗi tải nền và 403/404
được mô phỏng ở fetch để kiểm chứng UI. Trong 9 trạng thái đang xem/lỗi/phục
hồi, DOM khung AI, ghi chú chưa lưu, focus, vùng chọn và scrollY/ vị trí khung
giữ nguyên; gồm idle qua chu kỳ SSE, 503, lỗi mạng, timeout và 503 nhà chung.
UI gỡ dữ liệu khi report trả 403 hoặc house trả 404. Số lượt không đổi,
4 bố cục 320/390/768/1366px không tràn ngang, không lỗi JavaScript. Bằng chứng
local: `.verification/ai-credits/jitter-baseline.json` và `jitter-fixed.json`.
Không gọi OpenAI thật hoặc thực hiện thanh toán trong kiểm chứng này.

## Sửa tóm tắt tự mất và lưu theo tháng — 14/10/2026

Nguyên nhân: `HouseReports` dùng `data.generatedAt` trong key component AI.
Mỗi lần tải lại báo cáo do cập nhật nền/SSE/focus, timestamp đổi và React
mount lại panel, làm mất kết quả cùng ghi chú đang sửa. Key hiện chỉ gồm nhà
và tháng; cập nhật nền không tạo lại panel.

Migration `20261014173000_saved_ai_house_summaries` đã áp dụng PostgreSQL local.
Tóm tắt tự lưu riêng theo tài khoản + nhà + tháng. Xem lại miễn phí qua GET,
kể cả hết lượt; POST tháng đã lưu cũng không gọi AI nếu không yêu cầu tạo lại.
Tháng chưa có bản lưu và `regenerate: true` tốn một lượt. Snapshot có thời điểm
tạo và không tự cập nhật khi khoản chi thay đổi. Tạo lại giữ ghi chú đã lưu;
lỗi giữ bản cũ. Ghi chú có nút lưu riêng miễn phí, version chống ghi đè từ tab
khác. Chỉ thành viên hoạt động có quyền xem bản của mình. Summary và hoàn tất
trừ lượt cùng transaction; lỗi commit không trừ lượt, lease chống tạo trùng
giữa các instance. Các tóm tắt trước bản sửa chưa được lưu, không khôi phục được.

Kiểm chứng bổ sung: 44 HTTP/PostgreSQL AI/credits (22 AI, 22 credits) và 34 unit
AI qua; compile backend, build frontend và lint được kiểm tra. Bộ credits
đã chạy lại tuần tự sau một timeout khi chạy đồng thời với build trên máy local.
Chromium dùng session/API/PostgreSQL thật, OpenAI mô phỏng: cập nhật nền và chờ
hơn 5 giây giữ nguyên DOM panel, kết quả và ghi chú đang nhập; reload xem lại
miễn phí; chuyển tháng không lẫn bản; tạo tháng khác/tạo lại trừ đúng một lượt;
lỗi giữ snapshot và trả lượt; hết lượt vẫn xem/lưu ghi chú. Không lỗi JavaScript,
12 bố cục 320/390/768/1366px gồm sáng/tối không tràn ngang. Bằng chứng local tại
`.verification/ai-credits/summary-browser-results.json` và ảnh `summary-*`.
Dữ liệu thử được dọn; không gọi OpenAI bằng khóa thật trong kiểm chứng này.
Tổng tháng lưu BIGINT qua migration `20261014180000_ai_summary_total_bigint`;
kiểm thử 3.000.000.000đ chứng minh tổng nhiều khoản chi không bị giới hạn INTEGER
của một khoản chi. API vẫn trả số như báo cáo hiện có.

## Chính sách hiện hành — 5 lượt đầu và gói 59.000đ

- 5 lượt đầu miễn phí một lần cho mỗi tài khoản, dùng chung năm công cụ AI.
  FAQ hỗ trợ Roomora vẫn miễn phí với giới hạn riêng.
- Gói 59.000đ cộng 50 lượt không hết hạn, không tự gia hạn; được mua tiếp.
  Lượt miễn phí dùng trước rồi đến gói mua cũ nhất. Số lượt lưu PostgreSQL.
- Lỗi provider/timeout/refusal/output nghiệp vụ sai trả lại lượt; giữ lượt và
  chống vượt dùng khóa user. Hồi phục lượt giữ dở sau 2 phút nếu process chết.
- Migration `20261014160000_ai_credit_packages` đã áp dụng local, chuyển lượt
  cũ thành miễn phí đã dùng (tối đa 5), không đặt lại số lượt. `AI_MONTHLY_LIMIT`
  không còn được dùng. Bảng `ai_usage` cũ giữ lịch sử.
- Mua qua billing PayOS/MoMo hiện có. Xác nhận thanh toán hợp lệ mới cấp pack;
  redirect không cấp lượt, webhook lặp không cộng thêm. PDF/lịch sử/thông báo
  hỗ trợ đơn không có tin đăng. Tài khoản khóa/đóng nhận tiền tạo yêu cầu hoàn.
- Gói chưa dùng được yêu cầu hoàn toàn bộ trong 24 giờ, giữ lượt khi xét;
  từ chối mở lại gói, hoàn thành thu hồi đúng gói đó. Gói đã dùng không hoàn toàn bộ.
- AI dùng header gradient cam đỏ/tím mận, biểu tượng vàng, badge số lượt và
  liên kết mua gói; token tập trung tại theme.css, hỗ trợ sáng/tối.

Kiểm chứng chính sách mới: 150/150 unit test backend và 159/159 HTTP/PostgreSQL
trong bốn bộ AI, AI credits, billing và refunds qua (22 trường hợp AI credits).
Frontend production build, lint và TypeScript; backend compile, lint, Prisma
validate/migration status được kiểm tra. Các warning test cũ không thuộc thay đổi.
Chromium dùng session/API/PostgreSQL thật và provider/gateway mô phỏng: lỗi AI
giữ 5 lượt; năm công cụ dùng hết 5; manual form vẫn dùng được; checkout chưa
xác nhận không cộng lượt; webhook có chữ ký cấp đúng 50 dù gửi lặp; dùng một
lượt còn 49 sau reload và trong lịch sử. 52 bố cục ở 320/390/768/1366px (13 trạng
thái, có sáng/tối) không tràn ngang, không lỗi JavaScript. Bằng chứng local:
`.verification/ai-credits/browser-results.json` và ảnh chụp cùng thư mục.
Chưa thực hiện giao dịch ngân hàng 59.000đ thật. Dữ liệu kiểm thử được dọn.

Các ghi nhận bên dưới mô tả triển khai/kiểm chứng trước khi đổi chính sách
hạn mức; chính sách ở trên thay thế 50 lượt mỗi tháng.

Đã triển khai đủ năm luồng từ `backend/room.todo`: gợi ý mô tả tin,
bản nháp từ ảnh biên nhận, câu tìm kiếm thành bộ lọc, giải thích độ phù hợp
và tóm tắt chi tiêu. Giao diện tích hợp vào các màn hình hiện có, giữ theme
cam đỏ/kem, Be Vietnam Pro và component chung; tham khảo tương tác trong
`design-reference/.../t_ng_t_c_ai_theo_nghi_p_v_roomora/code.html`.

## Thay đổi

- `backend/src/modules/ai`: provider và service nhỏ theo cấu trúc module hiện
  có. Controller dùng session USER, OriginGuard và DTO; tái sử dụng quyền
  House/People, danh mục khu vực và báo cáo tài chính.
- Prisma: bảng `ai_usage`, migration `20261014100000_ai_assistance` đã áp dụng
  trên PostgreSQL local `127.0.0.1:5433`; hạn mức mặc định 50 lượt/user/tháng
  UTC+7, giữ nguyên sau khởi động lại và nguyên tử trên nhiều instance.
- `frontend/src/components/ai`: xem/sửa/xác nhận gợi ý, trạng thái lỗi/bận/hết
  lượt. Tích hợp vào đăng tin, tìm tin, form khoản chi, hồ sơ và báo cáo tháng.
- Matching giữ điểm/tiêu chí quy tắc. Summary giữ tổng/danh mục do hệ thống
  tính; AI chỉ chọn điểm cần chú ý. Description/OCR/search vẫn cần người dùng
  đối chiếu ngữ nghĩa. Không tự lưu dữ liệu nghiệp vụ hoặc xác nhận đã trả.
- Dùng nháp biên nhận đặt tình trạng chưa trả với số đã thanh toán 0, để
  người dùng tự kiểm tra trước khi lưu. Ảnh đọc không tự đính kèm vào khoản
  chi; chọn ảnh ở trường biên nhận của form nếu muốn lưu bằng nghiệp vụ cũ.

## Bằng chứng

- 33 unit test qua: lỗi provider/refusal/output sai/timeout, hạn mức và
  đồng thời, tháng UTC+7, ba loại tin và loại bỏ dữ liệu riêng, số tiền/ngày
  không hợp lệ, quyền đọc trước OCR, điểm và tổng gốc.
- HTTP/PostgreSQL: 79 kiểm thử qua trong bộ AI ban đầu (13), listings, people
  và household. Bộ AI sau bổ sung có 14/14 kiểm thử qua, gồm hạn mức nguyên tử
  khi sáu service instance cùng gọi; tổng 80 kiểm thử thuộc các bộ đã kiểm tra.
- Build backend/frontend, TypeScript, Prisma validate và lint qua. Backend
  giữ 5 warning sort trong test cũ ngoài Phase 11.
- 8 kiểm thử thư viện API frontend qua, gồm timeout, hủy request và xử lý
  lỗi mà không hiển thị nội dung server.
- Chromium dùng session/API/PostgreSQL thật, Responses API mô phỏng:
  sửa mô tả rồi xác nhận/lưu vào DB; chỉnh preview bộ lọc và áp dụng đồng bộ
  form; đối chiếu điểm hồ sơ; sửa nháp OCR và lưu khoản chi với paidAmount=0;
  tóm tắt đúng tổng báo cáo đã lưu; tìm thủ công khi provider lỗi; thông báo
  hết lượt. Không có lỗi JavaScript. 28 bố cục trên 320/390/768/1366px không
  tràn ngang (7 trạng thái). Ảnh/báo cáo local trong `.verification/phase11/`.
  Bản build cuối kiểm tra thêm ảnh preview và xóa gợi ý cũ khi đổi câu tìm kiếm.
  Dữ liệu thử tạo riêng đã được dọn sau kiểm chứng.

## Kiểm chứng OpenAI thật — 14/10/2026

Sau khi người dùng cấu hình khóa, đã gọi Responses API thật bằng `gpt-4o-mini`
qua session USER/API/PostgreSQL với dữ liệu thử riêng. Không đưa khóa vào
output hoặc báo cáo. Backend đang chạy tại cổng 5000 đã xác nhận có cấu hình
khóa và hạn mức 50 lượt/tháng qua session thử.

- Mô tả: tạo từ giá 3.000.000đ/phòng/tháng, diện tích 25m², khu vực Đà Nẵng,
  Wi-Fi và bếp; không tự lưu tin hoặc đưa địa chỉ riêng vào kết quả. Sau
  phản hồi đầu có thêm tính từ ngoài dữ liệu, đã siết prompt và kiểm tra lại
  đầu ra plain text, không còn các câu sạch sẽ/thoáng mát/sinh viên ban đầu.
- Search: đúng ROOM_RENTAL, tỉnh 48, tối đa 3.000.000đ, WIFI/KITCHEN;
  yêu cầu gần biển nằm trong điều kiện chưa áp dụng.
- OCR: ảnh biên nhận tổng hợp rõ chữ đọc đúng 300.000đ, GROCERIES và ngày
  2026-10-14. Phản hồi đầu trả tên hàng trong spentOn và được backend từ chối
  an toàn. Đã thêm mô tả trường, pattern ngày, giới hạn số tiền/độ dài vào
  schema; gọi lại thành công. Vẫn kiểm tra ngày tồn tại tại backend.
- Matching: giữ điểm 100% do hai tiêu chí gốc đối chiếu được; tiêu chí chưa
  có thông tin không bị model bịa thêm.
- Summary: đúng 300.000đ từ báo cáo PostgreSQL, không sửa khoản chi/thanh toán.
- FAQ: chọn bài đăng tin bằng OpenAI thật rồi trả câu trả lời đã duyệt.

Metadata HTTP 200, trạng thái completed, token và request ID được ghi tại
`.verification/phase11/live-results.json`; ảnh OCR tổng hợp tại
`.verification/phase11/live-receipt.png`. Dữ liệu thử, phiên và quota của
người dùng thử đã dọn. Kiểm tra bổ sung sau sửa: 59 unit test AI/FAQ, 21
HTTP/PostgreSQL AI/support qua, TypeScript build riêng và lint qua; giữ các
warning test cũ. Test chế độ không có AI dùng khóa rỗng tường minh để không
vô tình gọi provider bằng khóa thật trong môi trường.

## Phần chưa nghiệm thu

Chưa đánh giá chất lượng trên tập biên nhận thực tế (mờ, nghiêng, ngoại tệ),
độ đúng ngữ nghĩa trên nhiều câu tìm kiếm/mô tả, tải đồng thời hoặc chi phí
trong vận hành. Schema bảo đảm định dạng, không bảo đảm mọi nhận định của
AI đúng; người dùng vẫn phải đối chiếu trước khi lưu. Kiểm tra kết nối thật
ở trên không thay thế đánh giá chất lượng toàn bộ chức năng.

Cấu hình, endpoint, hạn mức và các giới hạn tại
`backend/src/modules/ai/README.md`. Khởi động lại backend sau khi thêm khóa.
Đã xác nhận kết nối và các trường hợp thử OpenAI thật; chưa đánh dấu nghiệm
thu chất lượng AI trên toàn bộ dữ liệu thực tế.
