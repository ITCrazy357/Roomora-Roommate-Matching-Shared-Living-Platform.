# Sinh hoạt chung và báo cáo (Phase 8)

Xác nhận nháp áp dụng quy tắc đã thống nhất theo danh mục và tháng ngày phát sinh nếu đã bật bình chọn. Danh sách chia trong mẫu định kỳ chỉ là dự kiến; khi có quy tắc tháng, form hiển thị phần chia đã chốt và backend tính lại. Kỳ chưa thống nhất thì giữ nháp, chặn ghi Expense. Xem [cost-sharing/README.md](../cost-sharing/README.md).

Controller chỉ gọi `HouseholdService`. Service chính chuyển lời gọi đến service theo nhiệm vụ, không truy vấn Prisma hoặc mở transaction.

| File                             | Trách nhiệm                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `house-activities.service.ts`    | Việc nhà và danh sách mua chung: phân công, ngày hạn, sửa, hoàn thành/đã mua, hủy/mở lại, phân trang. |
| `recurring-rules.service.ts`     | Quy tắc hằng tháng, sửa lịch, tạm dừng/kích hoạt.                                                     |
| `recurring-drafts.service.ts`    | Đọc nháp, xác nhận vào sổ hoặc bỏ qua kỳ.                                                             |
| `recurring-scheduler.service.ts` | Worker tạo nháp đến hạn và thông báo, chạy mỗi phút.                                                  |
| `house-reports.service.ts`       | Báo cáo tháng/danh mục/thành viên và xuất bảng quyết toán CSV.                                        |
| `house-report-pdf.service.ts`    | Xuất PDF A4 tiếng Việt từ cùng snapshot báo cáo, tự phân trang và lặp tiêu đề bảng.                   |
| `household-access.service.ts`    | Kiểm tra người tham gia, quyền sửa, phiên bản và thông báo/SSE.                                       |
| `recurring-dates.ts`             | Ngày hằng tháng, cuối tháng ngắn và chuyển năm.                                                       |

Mọi thao tác ghi khóa hàng nhà bằng `HouseAccessService.lock`, sau đó kiểm tra thành viên hiện tại. Người đã rời hoặc nhà đã lưu trữ không truy cập sinh hoạt/báo cáo chung; lịch sử công nợ Phase 7 giữ quyền riêng như cũ. UUID được kiểm tra tại controller, DTO không nhận trường ngoài hợp đồng. Trưởng nhà quản lý nhóm, không đại diện quyền sở hữu phòng.

## Việc nhà và mua chung

`GET/POST /houses/:houseId/household/chores|shopping`, `PATCH .../:id`, `POST .../:id/status`.

Việc nhà bắt buộc người phụ trách và ngày hạn. Món cần mua có số lượng dạng chữ, người phụ trách/ngày cần mua tùy chọn. Phân công chỉ nhận `HouseParticipant` đang ở đúng nhà, gồm người ngoài app. Người tạo/trưởng nhà được sửa và hủy; người phụ trách được xác nhận hoàn thành/mở lại. Món chưa phân công cho phép thành viên nhận mua bằng thao tác đã mua. Với người ngoài app, người tạo/trưởng nhà ghi nhận thủ công, không cấp tài khoản hoặc quyền truy cập.

`OPEN`, `DONE`, `CANCELLED`; hoàn thành lưu người thao tác và thời điểm. Sửa cần phiên bản hiện tại; hoàn thành/hủy không sửa nội dung, phải mở lại. Tạo dùng UUID `clientId` và hash nội dung chống retry trùng. Thay đổi phân công gửi thông báo, mọi thay đổi phát SSE trong transaction. Danh sách phân trang, lọc trạng thái. Response có `summary.open/done/cancelled/overdue` cho toàn bộ danh sách đúng loại, độc lập bộ lọc và trang. Quá hạn tính theo ngày UTC+7 ở cả API và giao diện.

Đánh dấu đã mua **không tạo khoản chi**. Nút Ghi khoản chi mở form Phase 7 để người mua nhập số tiền thực tế, danh mục, người chia và ảnh biên nhận. Các khoản mua được ghi thủ công, chưa liên kết duy nhất với một dòng mua sắm; giao diện nhắc kiểm tra sổ để tránh ghi cùng món hai lần.

## Khoản định kỳ

`GET/POST .../recurring`, `PATCH .../recurring/:id`, `POST .../recurring/:id/enabled`.
`GET .../drafts`, `POST .../drafts/:id/confirm|skip`.

Lặp hằng tháng, ngày 1–31. Ngày 29–31 được hạ về ngày cuối tháng ngắn; tháng sau khôi phục ngày gốc. Ngày đầu/tiếp theo khi tạo/sửa phải từ hôm nay đến một năm tới và khớp ngày đã chọn. Mỗi nhà tối đa 100 quy tắc; có thể tạm dừng. Kích hoạt lại bỏ qua kỳ đã qua trong thời gian dừng. Nháp đã tạo không đổi theo sửa/dừng quy tắc.

`amount = null` là khoản biến động, bắt buộc nhập tiền khi xác nhận. Khoản cố định điền sẵn tiền; cả hai đều chỉ tạo nháp. Worker không tạo Expense, thanh toán hoặc tự xác nhận đã nhận tiền. Mỗi quy tắc/ngày đến hạn có một nháp duy nhất trong DB, khóa nhà chống hai instance chạy trùng. Worker quét tối đa 100 quy tắc/lượt, bù tối đa 12 kỳ/quy tắc/lượt sau downtime; phần còn lại được xử lý ở lượt tiếp. Nhà đã đóng không được tạo nháp.

Thông báo trong ứng dụng gửi người phụ trách hiện tại; người ngoài app/đã rời được nhắc qua trưởng nhà hiện tại. Scheduler tắt khi `NODE_ENV=test`; cần backend chạy để tạo nháp và nhắc. Phase 8 không yêu cầu SMTP.

Người tạo quy tắc, người phụ trách hoặc trưởng nhà hiện tại được xác nhận/bỏ qua. Xác nhận nhận đầy đủ nội dung khoản chi: kiểm tra tiền nguyên, tổng chia, người đang tham gia và thanh toán chờ như Phase 7. Dùng `ExpenseRecordsService.createInTransaction` với cùng transaction và khóa; tạo Expense, chia tiền, lịch sử, nhắc nợ/SSE và đánh dấu nháp `CONFIRMED` cùng commit. `clientId` xác định từ ID nháp, không thể ghi hai khoản do hai người xác nhận đồng thời. Retry cùng nội dung trả khoản đã lưu; đổi nội dung trả conflict. Người đã rời phải được bỏ/chọn lại trước khi xác nhận, không tự ghi nợ họ theo mẫu cũ. Nháp đã bỏ qua không thể xác nhận; kỳ tiếp theo vẫn chạy.

## Báo cáo và bảng quyết toán

`GET .../reports?month=YYYY-MM`, `GET .../reports/export?month=YYYY-MM` (CSV), `GET .../reports/pdf?month=YYYY-MM` (PDF).

Khoản chi có `category` và `spentOn` (ngày phát sinh), có thể sửa có lý do qua quy trình cũ. API cũ không gửi các trường này vẫn hoạt động: khi tạo dùng Khác và ngày UTC+7 hiện tại; khi sửa giữ giá trị đã có. Migration chuyển ngày tạo lịch sử sang ngày UTC+7, không gán mọi khoản cũ vào tháng deploy. Hash retry cũ được giữ khi request không có trường mới.

Báo cáo đọc snapshot `RepeatableRead`, tính khoản chưa hủy trong tháng theo `spentOn`, gồm đã chốt và chưa chốt. Nháp/thanh toán trả nợ không tăng chi phí. Thống kê người trả và phần chịu, gồm người ngoài app/đã rời có lịch sử. Số dư và gợi ý bù trừ dùng toàn bộ sổ Phase 7 tại thời điểm đọc, **không phải chỉ nợ của tháng được chọn**. Thanh toán chờ có cột riêng; gợi ý xuất ra chưa trừ tiền chờ nên phải kiểm tra sổ trước khi trả.

CSV UTF-8 BOM mở bằng Excel/LibreOffice, escape dấu nháy và công thức từ nội dung người dùng; số tiền giữ kiểu số. File gồm khoản chi, danh mục, phần chịu, trạng thái chốt, số dư/thanh toán chờ và đề xuất chuyển tiền.

PDF A4 dùng PDFKit, gồm tổng chi, danh mục, thành viên, toàn bộ khoản chi, công nợ và gợi ý bù trừ. Tự xuống dòng, phân trang, lặp tiêu đề bảng và đánh số trang. Font Be Vietnam Pro Regular/SemiBold nhúng trong PDF; nguồn [Google Fonts](https://github.com/google/fonts/tree/main/ofl/bevietnampro), giấy phép SIL OFL nằm trong `fonts/OFL.txt`. `nest-cli.json` copy font vào `dist/modules/household/fonts`; không tải font hoặc nội dung bên ngoài khi xuất. PDF.js chỉ là dependency phát triển để kiểm thử nội dung/phân trang.

Cả hai định dạng dùng quyền thành viên hiện tại, tháng hợp lệ 2000–2100, response tải riêng tư, `no-store`, `nosniff`. Xuất không sửa/chốt sổ hoặc xác nhận trả tiền. Đây là bảng ghi nhận nội bộ; chứng từ mua dịch vụ Roomora thuộc Phase 9.
