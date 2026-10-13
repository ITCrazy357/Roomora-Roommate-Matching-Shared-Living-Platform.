# Phase 11 — AI hỗ trợ đúng nghiệp vụ

Ngày kiểm chứng: 14/10/2026.

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

## Phần chưa nghiệm thu

`OPENAI_API_KEY` local còn trống, đã kiểm tra chỉ trạng thái có/không có khóa.
Chưa gọi OpenAI thật, chưa đo chất lượng OCR trên biên nhận thật, tính đúng
ngữ nghĩa của mô tả/search hoặc độ trễ/chi phí provider thực tế. Không coi
response mô phỏng là bằng chứng AI thật. Cần cấu hình khóa ở backend và bộ
dữ liệu thử có sự đồng ý của người dùng để nghiệm thu các phần này.

Cấu hình, endpoint, hạn mức và các giới hạn tại
`backend/src/modules/ai/README.md`. Khởi động lại backend sau khi thêm khóa.
Không đánh dấu toàn bộ Phase 11 đã nghiệm thu AI thực tế.
