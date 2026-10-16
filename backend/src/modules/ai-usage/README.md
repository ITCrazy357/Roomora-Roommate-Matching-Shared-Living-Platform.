# Chi phí AI cho ADMIN

`GET /admin/ai-costs?month=YYYY-MM` chỉ cho ADMIN, dùng DTO tháng của dashboard.
Mặc định tháng hiện tại, UTC+7, tính theo thời điểm bắt đầu gọi. Tổng, phân bổ
chức năng/model và ngày lấy trong snapshot RepeatableRead. Tiền là chuỗi
decimal USD; không tự quy đổi VNĐ hoặc trừ chi phí khỏi doanh thu dịch vụ.

`AiUsageService` ghi một `AiRequest` trước khi gửi Responses API cho cả năm
chức năng AI và FAQ hỗ trợ. Chỉ lưu chức năng/model/trạng thái/token/response ID
và giá, không lưu prompt, câu hỏi, ảnh, nội dung phản hồi, API key hoặc tài khoản.
Không có khóa/hết lượt hoặc FAQ trả lời nội bộ không gọi OpenAI thì không tạo
lượt gọi giả. Thiếu dữ liệu không được coi là miễn phí.

Token lấy từ `usage.input_tokens`, `input_tokens_details.cached_tokens` và
`output_tokens` theo [OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/beta/subresources/responses/methods/create).
Giá chuẩn của `gpt-4o-mini` và snapshot `gpt-4o-mini-2024-07-18` xác nhận ngày
16/10/2026 từ [OpenAI Docs](https://developers.openai.com/api/docs/models/gpt-4o-mini):
0,15 USD/triệu input thường, 0,075 USD/triệu input cache, 0,60 USD/triệu output.

```
USD = ((input - cached) × inputRate + cached × cachedRate + output × outputRate) / 1.000.000
```

Cache đã nằm trong input, không cộng lại vào tổng token. Dùng Prisma.Decimal,
lưu 12 số thập phân USD cùng đơn giá và phiên bản giá của lần gọi. Thay bảng
giá không tính lại lịch sử. Model chưa có giá, tier khác `default`, thiếu hoặc
sai token/metadata để `costUsd=null`; không đoán giá. Khi đổi model/giá, cập
nhật `ai-pricing.ts` theo nguồn chính thức và đổi phiên bản giá.

Chi phí gọi nhà cung cấp độc lập với credit: kết quả không hợp lệ/lỗi lưu vẫn
có thể tốn token dù được trả lại lượt AI. `COMPLETED` là phản hồi OpenAI hoàn
tất, không có nghĩa người dùng đã lưu bản nháp. `FAILED` vẫn cộng phí nếu có
token và đơn giá. Timeout thiếu usage báo chưa đủ dữ liệu. Không ghi được bản
ghi đầu thì không gọi OpenAI; lỗi ghi cuối để lại bản ghi chưa xác định, log
thông báo tổng quát và không làm mất câu trả lời hợp lệ.

Đây là **ước tính phần chi phí đã ghi nhận**, không phải hóa đơn OpenAI; không
gồm thuế/điều chỉnh thanh toán/lượt ngoài Roomora. Không suy ngược dữ liệu cũ
từ credit vì không có token thực tế. Biểu đồ chỉ cộng phần có đủ token và giá;
giao diện nêu số lượt chưa tính được. Khi không có log, hiển thị chưa có dữ liệu.

Migration `20261016010000_ai_request_costs` chỉ thêm bảng/enum/index/CHECK,
không sửa số lượt hoặc dữ liệu nghiệp vụ. Không thêm dependency/SDK.
Kiểm thử ở `ai-usage.service.spec.ts` và `test/admin.e2e-spec.ts`, kèm chạy lại
AI/credits/FAQ với PostgreSQL và provider mô phỏng, không gọi API trả phí.
