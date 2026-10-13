# Phase 11 — Trợ lý theo nghiệp vụ

Module `ai` gồm controller mỏng, provider dùng chung và ba service nghiệp vụ.
Tái sử dụng `PeopleDiscoveryService`, `HouseReportsService`, `HouseAccessService`
và danh mục khu vực. Không tạo một hệ thống điểm phù hợp hoặc sổ chi phí khác.

| API                               | Dữ liệu gửi tới provider                          | Kết quả                                                             |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /ai/usage`                   | Không gọi provider                                | Hạn mức tháng của người đang đăng nhập                              |
| `POST /ai/listing-description`    | Trường công khai từ form, chuẩn hóa theo loại tin | Mô tả có thể sửa, chưa lưu                                          |
| `POST /ai/receipt-draft`          | Ảnh JPG/PNG/WebP và danh mục chi phí              | Tên, tổng VNĐ, ngày, danh mục; trường không đọc được là null        |
| `POST /ai/search-filters`         | Câu tìm kiếm và danh mục tỉnh/thành phố           | Loại tin, tỉnh/thành phố, mức tiền, tiện ích, điều kiện chưa hỗ trợ |
| `POST /ai/people/:id/explanation` | Giải thích đối chiếu được phép đọc                | Điểm gốc, tiêu chí gốc và các điểm cần chú ý                        |
| `POST /ai/houses/:id/summary`     | Tổng và danh mục báo cáo tháng từ DB              | Số liệu gốc và các điểm cần chú ý                                   |

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
AI_MONTHLY_LIMIT=50
```

Khóa dùng chung với FAQ chatbot; `CHATBOT_MODEL` vẫn là cấu hình riêng.
Không có khóa: trả `AI_UNAVAILABLE`, không tiêu lượt. Không cần SDK mới;
provider dùng Responses API hiện có, `store: false`, Structured Outputs,
không có tools. Cấu trúc theo [OpenAI Docs về Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
và [image input](https://developers.openai.com/api/docs/guides/images-vision).
`store: false` không đồng nghĩa bên cung cấp không có bất kỳ chính sách lưu dữ liệu nào.

Migration `20261014100000_ai_assistance` thêm `ai_usage` theo user/tháng UTC+7.
Một SQL upsert nguyên tử giữ hạn mức trên nhiều instance và sau khởi động lại.
Mặc định 50 lượt/tháng, cấu hình 1–1000. Lượt đã giữ trước khi gọi provider
được tính cả khi provider lỗi, từ chối hoặc trả kết quả không hợp lệ, để tránh
vòng thử lại không giới hạn. Request bị từ chối vì quyền, dữ liệu đầu vào,
chưa cấu hình, bận hoặc hết hạn mức không tiêu lượt.
Giới hạn đồng thời: 4 lượt/instance, 1 lượt/user/instance. Timeout provider 20s;
frontend chờ tối đa 30s. Không tự retry. Giới hạn đồng thời chưa dùng chung
trên nhiều instance; hạn mức tháng đã dùng chung qua DB. FAQ chatbot giữ
giới hạn riêng đã được tài liệu hóa tại `docs/chat-widget.md`.

## Ranh giới nghiệp vụ

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
  thanh toán. Chỉ bảng hạn mức được ghi. Việc dùng gợi ý diễn ra trong form;
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
npm.cmd run build
npm.cmd run lint
```

Kết quả và giới hạn nghiệm thu tại `PHASE_11_STATUS.md` ở gốc repository.
