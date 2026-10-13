# Trợ lý hỗ trợ Roomora có giới hạn

Chatbot chạy trực tiếp trong bong bóng Roomora và gọi backend hiện có qua `POST /api/v1/support/chat`. Không còn iframe, frontend riêng, LangGraph hoặc Supabase trong luồng hỗ trợ này.

## Phạm vi được trả lời

Theo phạm vi người dùng chốt:

- Tài khoản: tạo tài khoản, quên mật khẩu, chỉnh sửa hồ sơ.
- Đăng/tìm tin: đăng tin, loại tin, bộ lọc và quản lý tin của mình.
- Kết nối: tìm người ở ghép, gửi lời mời và hướng dẫn nhắn tin.
- Nhà chung: tạo nhà, mời thành viên và hướng dẫn khoản chi.
- Dịch vụ: cách dùng gói dịch vụ và cách gửi yêu cầu hoàn tiền theo quy tắc hiện có.

Nguồn nội dung là `backend/src/modules/support/chat-knowledge.ts`. Mỗi mục có ID, cách hỏi mẫu, câu trả lời cố định và đường dẫn đến đúng màn hình Roomora. Các hướng dẫn được đối chiếu với code và tài liệu sản phẩm; khi nghiệp vụ thay đổi, cần cập nhật nội dung và kiểm thử cùng lúc.

Chatbot không đọc tài khoản, giao dịch, nhà chung hoặc tin riêng; không duyệt tin, mở khóa tài khoản, xác nhận thanh toán, trả tiền hay giải quyết tranh chấp. Những câu cần dữ liệu thực tế, ngoài danh sách, có nhiều ý không được bao phủ hoặc không đủ chắc chắn sẽ chuyển hỗ trợ.

## AI hiểu câu hỏi như thế nào

Khi có khóa, backend dùng OpenAI để chọn ID FAQ phù hợp. Model chỉ trả ID, dấu hiệu câu hỏi được bao phủ đầy đủ và độ chắc chắn. Server kiểm tra ID trong danh sách, yêu cầu độ chắc chắn ít nhất 0,9 rồi trả nội dung có sẵn. Server không hiển thị câu trả lời hoặc đường dẫn do AI tự sinh.

Structured Outputs giúp ràng buộc định dạng, không bảo đảm phân loại ngữ nghĩa luôn đúng. Vì vậy model có lựa chọn `handoff`, server kiểm tra trường trả về và có kiểm thử câu ngoài phạm vi. Tham khảo [OpenAI Docs về Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Khi chưa có khóa, chatbot dùng các câu mẫu và so khớp bảo thủ để trả những FAQ rõ ràng. Câu chưa chắc chắn chuyển hỗ trợ. Không coi chế độ này là AI ngữ nghĩa đã được kiểm chứng.

Nếu OpenAI lỗi, từ chối, hết thời gian chờ hoặc trả kết quả chưa đầy đủ, chatbot chuyển hỗ trợ. Không tự đoán nội dung.

## Chuyển cho ADMIN

1. Chatbot hiển thị thông báo cần hỗ trợ.
2. USER bấm **Gửi yêu cầu cho ADMIN**.
3. Khung điền sẵn câu hỏi; USER kiểm tra, bổ sung và bấm **Xác nhận gửi**.
4. Frontend gọi API `POST /support/tickets` đã có. Yêu cầu được lưu với trạng thái OPEN.
5. ADMIN tiếp nhận ở `/admin/ho-tro`; USER theo dõi ở `/ho-tro`. Link trong hội thoại mở đúng yêu cầu vừa gửi.

Không tạo ticket tự động khi chatbot không biết câu trả lời. Khách cần đăng nhập trước khi gửi. API ticket vẫn áp dụng AuthGuard, OriginGuard, quyền chủ sở hữu và giới hạn yêu cầu hiện có; chatbot không vượt qua các kiểm tra này. Trường hợp tài khoản đã bị khóa vẫn chịu quy tắc truy cập hiện hành của Roomora.

## Cấu hình và chạy

Roomora dùng frontend và backend sẵn có. Frontend chỉ dùng `NEXT_PUBLIC_API_BASE_URL` để gọi API Roomora.

Trong `backend/.env`:

```dotenv
# Không có khóa: FAQ rõ ràng vẫn dùng được.
OPENAI_API_KEY=
CHATBOT_MODEL=gpt-4o-mini
```

Chỉ giữ API key trên backend. Không gửi khóa trong chat hoặc đưa vào biến `NEXT_PUBLIC_*`. Sau khi điền khóa, khởi động lại backend. Câu hỏi dùng để phân loại được gửi đến OpenAI khi bật AI; yêu cầu dùng `store: false`, không gửi lịch sử hội thoại hoặc dữ liệu tài khoản.

Endpoint chat được bảo vệ bởi OriginGuard và giới hạn 20 câu hỏi/IP/phút, tối đa 4 lượt phân loại AI đồng thời mỗi instance. Giới hạn hiện nằm trong bộ nhớ của từng instance; khi mở rộng nhiều instance cần cơ chế giới hạn dùng chung.

Khi deploy, cấu hình API base và FRONTEND_ORIGIN như Roomora hiện có, rồi build/deploy frontend và backend. Không cần dịch vụ chatbot riêng hoặc database vector.

Mã ứng dụng PDF cũ, API riêng, cấu hình môi trường, script Supabase/LangGraph và thư viện đã cài trong thư mục `ai-pdf-chatbot-langchain` đã được dọn. Thư mục đó chỉ giữ lịch sử Git, giấy phép và tài liệu trỏ sang hướng dẫn này. Không chạy hoặc cài đặt chatbot từ thư mục cũ.

## File chính

| File                                                    | Vai trò                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `backend/src/modules/support/chat-knowledge.ts`         | Phạm vi, FAQ, quy tắc chuyển hỗ trợ và so khớp khi chưa có AI |
| `backend/src/modules/support/chat.service.ts`           | Phân loại AI và trả nội dung có sẵn                           |
| `backend/src/modules/support/chat.controller.ts`        | DTO, API và giới hạn câu hỏi                                  |
| `frontend/src/components/chat-widget.tsx`               | Bong bóng và khung hội thoại                                  |
| `frontend/src/components/support/help-chat.tsx`         | Hỏi đáp và xác nhận gửi yêu cầu hỗ trợ                        |
| `frontend/src/app/chat-widget.css`                      | Giao diện dùng token Roomora                                  |
| `frontend/src/components/support/support-workspace.tsx` | Mở chi tiết ticket từ link trong chat                         |

Hội thoại và bản nháp được giữ khi thu gọn/mở lại và chuyển trang trong cùng phiên trang. Khi đổi tài khoản, khung mới được tạo. Trợ lý không hiện trong khu vực ADMIN.

## Kiểm chứng ngày 13/10/2026

- 26 unit test cho câu hỏi FAQ, cách diễn đạt khác, ngoài phạm vi, yêu cầu xử lý cá nhân, prompt injection, kết quả model sai ID/không chắc chắn, refusal, lỗi provider và giới hạn request đã qua.
- 7 kiểm thử HTTP/PostgreSQL đã qua: FAQ public, Origin/DTO, không tự tạo ticket, yêu cầu đăng nhập, USER gửi ticket, ADMIN đọc/xử lý và chặn USER khác đọc.
- Backend source typecheck và build đã qua. Frontend build, TypeScript và ESLint cho phần chatbot đã qua.
- Browser ở 320/390/768/1440px đã qua, không tràn ngang và không lỗi JavaScript. FAQ/ngoài phạm vi gọi API Roomora thật; thao tác xác nhận gửi ticket và vai trò trong browser dùng fixture. Luồng ticket/session/ADMIN thật được kiểm chứng riêng bằng HTTP/PostgreSQL.
- Không có request đến cổng chatbot riêng trong browser; dịch vụ frontend PDF và LangGraph cũ đã dừng.
- Chưa kiểm chứng OpenAI thật vì `OPENAI_API_KEY` còn trống. Unit test phần phân loại dùng Responses API mock; phiên local trả FAQ bằng so khớp bảo thủ.
- Typecheck toàn backend bao gồm test vẫn báo lỗi ở các test auth-otp, billing và phase-10 hiện có. Những file đó không được sửa trong tác vụ chatbot này.

Ảnh và báo cáo nằm tại `.verification/bounded-chat/`.
