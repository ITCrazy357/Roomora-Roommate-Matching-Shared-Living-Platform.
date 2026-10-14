# Phase 11 — Trợ lý theo nghiệp vụ

Module `ai` gồm controller mỏng, provider dùng chung và ba service nghiệp vụ.
Tái sử dụng `PeopleDiscoveryService`, `HouseReportsService`, `HouseAccessService`
và danh mục khu vực. Không tạo một hệ thống điểm phù hợp hoặc sổ chi phí khác.

| API                               | Dữ liệu gửi tới provider                          | Kết quả                                                             |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /ai/usage`                   | Không gọi provider                                | Lượt miễn phí, lượt đã mua, tổng còn lại và gói mua                  |
| `POST /ai/listing-description`    | Trường công khai từ form, chuẩn hóa theo loại tin | Mô tả có thể sửa, chưa lưu                                          |
| `POST /ai/receipt-draft`          | Ảnh JPG/PNG/WebP và danh mục chi phí              | Tên, tổng VNĐ, ngày, danh mục; trường không đọc được là null        |
| `POST /ai/search-filters`         | Câu tìm kiếm và danh mục tỉnh/thành phố           | Loại tin, tỉnh/thành phố, mức tiền, tiện ích, điều kiện chưa hỗ trợ |
| `POST /ai/people/:id/explanation` | Giải thích đối chiếu được phép đọc                | Điểm gốc, tiêu chí gốc và các điểm cần chú ý                        |
| `POST /ai/houses/:id/summary`     | Tổng và danh mục báo cáo tháng từ DB              | Số liệu gốc và các điểm cần chú ý                                   |
| `GET /ai/houses/:id/summary?month=YYYY-MM` | Không gọi provider | `{ summary }` riêng theo tài khoản/nhà/tháng; null nếu chưa tạo |
| `PATCH /ai/houses/:id/summary/notes` | Không gọi provider | Lưu ghi chú cá nhân, không trừ lượt |

Các POST trả 200. API yêu cầu session USER, OriginGuard và ValidationPipe.
Receipt dùng multipart với `houseId` và `receipt`, tối đa 5 MB, kiểm tra bytes
thật bằng Sharp, giới hạn 25 triệu pixel, một khung hình, xóa metadata bằng
việc mã hóa lại JPEG tối đa 1600px. Không nhận URL ảnh do client cung cấp.
Quyền thành viên còn hoạt động được kiểm tra trước khi đọc ảnh hoặc gọi AI.
Hồ sơ riêng tư/bị chặn/không còn khả dụng dùng cùng quy tắc với API People.

## Cấu hình

Trong `backend/.env` (không commit khóa):

```dotenv
OPENAI_API_KEY=
AI_MODEL=gpt-4o-mini
```

Khóa dùng chung với FAQ chatbot; `CHATBOT_MODEL` vẫn là cấu hình riêng.
Không có khóa: trả `AI_UNAVAILABLE`, không tiêu lượt. Không cần SDK mới;
provider dùng Responses API hiện có, `store: false`, Structured Outputs,
không có tools. Cấu trúc theo [OpenAI Docs về Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
và [image input](https://developers.openai.com/api/docs/guides/images-vision).
`store: false` không đồng nghĩa bên cung cấp không có bất kỳ chính sách lưu dữ liệu nào.

Migration `20261014160000_ai_credit_packages` thay hạn mức tháng bằng:

- 5 lượt miễn phí một lần cho mỗi tài khoản, dùng chung cả năm chức năng.
- Gói `AI_50_CREDITS`: 59.000đ cộng 50 lượt, không hết hạn, không tự gia hạn.
  Có thể mua tiếp; lượt miễn phí dùng trước, sau đó dùng gói mua cũ nhất.
- Chỉ trừ lượt khi provider trả kết quả được service nghiệp vụ kiểm tra hợp lệ.
  Lỗi mạng, timeout, refusal hoặc output sai trả lại lượt. Lượt giữ dở được
  hồi phục sau 2 phút nếu process chết; request cũ không thể hoàn tất lần nữa.
- Row lock theo user giữ số lượt nguyên tử giữa các instance và sau restart.
  Gói đang xét hoàn tiền bị giữ; gói hoàn thành hoàn tiền bị thu hồi.

Migration chuyển tổng lượt cũ trong `ai_usage` thành số lượt miễn phí đã dùng,
tối đa 5; không cấp lại lượt cho tài khoản từng dùng AI. Bảng cũ giữ lịch sử,
không ghi thêm. `AI_MONTHLY_LIMIT` không còn được dùng.
Giới hạn đồng thời: 4 lượt/instance, 1 lượt/user/instance. Timeout provider 20s;
frontend chờ tối đa 30s. Không tự retry. Giới hạn đồng thời chưa dùng chung
trên nhiều instance; số lượt đã dùng chung qua DB. FAQ chatbot hỗ trợ Roomora
vẫn miễn phí, giữ giới hạn riêng tại `docs/chat-widget.md` và không trừ lượt
nghiệp vụ. Mua gói qua billing hiện có, xem `../billing/README.md`.

## Ranh giới nghiệp vụ

Tóm tắt tháng được tự lưu tại PostgreSQL theo `(userId, houseId, month)`.
GET và POST không có `regenerate: true` trả bản đã lưu miễn phí, kể cả khi
hết lượt hoặc provider không khả dụng. Tháng chưa có bản lưu cần tạo riêng;
tạo lại với `regenerate: true` tốn một lượt và giữ ghi chú cá nhân đã lưu.
Đây là snapshot tại thời điểm tạo; khoản chi mới không tự sửa bản đã lưu.
Người dùng phải còn là thành viên hoạt động để xem, tạo hoặc lưu ghi chú;
thành viên khác không đọc được bản của người tạo.

PATCH nhận `{ month, notes, version }`, tối đa 5000 ký tự. Version chống ghi
đè bản đã thay đổi ở tab khác. Lưu summary và hoàn tất sử dụng lượt nằm trong
cùng transaction; lỗi lưu trả lại lượt. Một lease 2 phút theo user/nhà/tháng
chặn tạo trùng giữa các instance, không giữ transaction khi gọi OpenAI.
Sau lỗi tạo lại, snapshot và ghi chú cũ vẫn được giữ. Không thể khôi phục các
tóm tắt sinh trước migration vì phiên bản cũ chưa lưu chúng.

- Description: không gửi địa chỉ riêng, tọa độ, ảnh, lịch sử chat hoặc thông tin
  tài khoản; loại ROOM_WANTED/ROOMMATE chưa có phòng không gửi chi phí phòng
  cũ. Tiện ích của nhu cầu tìm phòng là mong muốn, không phải phòng có thật.
- OCR: không trả người thanh toán, phần chia, số đã trả hoặc trạng thái thanh
  toán. Ngày không tồn tại/số tiền không nguyên/ngoài giới hạn bị loại. Ngoại tệ
  không được tự đổi VNĐ. Ảnh khó đọc giữ null để người dùng bổ sung.
- Search: không có bộ lọc khoảng cách, phường/xã, hút thuốc, thú cưng, giờ ngủ,
  số người hoặc hasRoom trong chức năng AI này. Điều kiện ngoài bộ lọc hiện có
  được nêu rõ trong `unsupported`; không biến thành keyword ngầm. Preview
  cho sửa và xác nhận; áp dụng đồng bộ các điều khiển tìm kiếm thủ công.
- Matching/summary: AI chỉ chọn ID trong danh sách sự kiện do backend lập;
  backend kiểm tra ID, bỏ mọi nội dung tự sinh ngoài ID và trả chữ/số gốc.
  Không gửi tên thành viên, biên nhận hay số dư cá nhân để tóm tắt chi tiêu.
  Tóm tắt tháng có điều chỉnh sau chốt, không phải báo cáo công nợ.
- Không endpoint nào ghi listing, expense, debtPayment, boost hoặc xác nhận
  thanh toán. Chỉ ghi số lượt, lịch sử sử dụng, bản tóm tắt và ghi chú cá nhân.
  Việc dùng gợi ý mô tả/biên nhận diễn ra trong form;
  lưu vẫn gọi API nghiệp vụ cũ. Form receipt đặt số đã trả về 0 sau khi dùng
  nháp để người dùng kiểm tra và chọn tình trạng thanh toán.

Schema và kiểm tra backend ràng buộc định dạng/phạm vi, không chứng minh
ngữ nghĩa mô tả, OCR hoặc câu tìm kiếm luôn đúng. UI yêu cầu đối chiếu; nhập
tay, tìm/lọc tay, điểm quy tắc và báo cáo thường vẫn dùng được khi AI lỗi.
Nội dung ảnh/câu tìm kiếm được xem là dữ liệu không tin cậy trong prompt.
Không ghi khóa, ảnh, nội dung provider hay dữ liệu cá nhân vào log.

## Kiểm tra

```powershell
npm.cmd test -- src/modules/ai/ai.service.spec.ts
npm.cmd run test:e2e -- test/ai.e2e-spec.ts
npm.cmd run test:e2e -- test/ai-credits.e2e-spec.ts
npm.cmd run build
npm.cmd run lint
```

Kết quả và giới hạn nghiệm thu tại `PHASE_11_STATUS.md` ở gốc repository.
