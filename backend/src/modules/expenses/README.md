# Chi phí và công nợ

Các route vẫn được khai báo trong `expenses.controller.ts`. Cả `ExpensesController` và `FinanceHistoryController` chỉ inject `ExpensesService`. Service chính inject các service phụ và chuyển lời gọi đến đúng nhiệm vụ; module đăng ký các provider trong `expenses.module.ts`.

| File                              | Trách nhiệm                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `expenses.service.ts`             | Đầu mối cho controller: khoản chi, người tham gia, công nợ, thanh toán, biên nhận và ngày hẹn trả.    |
| `expense-records.service.ts`      | Tạo, sửa, hủy, liệt kê khoản chi và đọc lịch sử điều chỉnh.                                           |
| `expense-participants.service.ts` | Danh sách người tham gia, thêm/rời người ngoài app và danh sách nhà trong lịch sử công nợ.            |
| `expense-balances.service.ts`     | Tính số dư, gợi ý chuyển tiền và chốt quyết toán.                                                     |
| `expense-payments.service.ts`     | Ghi thanh toán kèm minh chứng, xác nhận, từ chối, hủy, đọc thanh toán và ảnh theo quyền sổ công nợ.   |
| `expense-receipts.service.ts`     | Xử lý, lưu và đọc ảnh biên nhận riêng tư.                                                             |
| `expense-access.service.ts`       | Đọc khoản chi theo quyền hiện tại/lịch sử, kiểm tra người được sửa, phiên bản và thanh toán đang chờ. |
| `expense-events.service.ts`       | Ghi lịch sử trước/sau và phát tín hiệu SSE trong transaction.                                         |
| `expense-ledger.ts`               | Đọc và tính số dư bằng cùng transaction, dùng chung cho quyết toán và nhắc nợ.                        |
| `expense-promises.service.ts`     | Hẹn/sửa/hủy ngày trả theo công nợ hiện tại, kiểm tra quyền/phiên bản và thông báo cho người nhận.     |
| `expense-reminders.service.ts`    | Đồng bộ lịch nhắc với thay đổi công nợ, tạm dừng theo ngày hẹn và xếp email định kỳ vào hàng đợi.     |
| `expense-views.ts`                | Các Prisma select/include và hàm tạo dữ liệu trả về, dùng chung giữa service.                         |
| `expense-calculations.ts`         | Chia tiền VNĐ nguyên và tính gợi ý bù trừ.                                                            |

`ExpensesService` không chứa truy vấn Prisma hoặc mở thêm transaction. Service phụ giữ nguyên phần xử lý cũ và không inject ngược service chính. Các service dùng chung về quyền, lịch sử, nhắc nợ được inject tại nơi sử dụng; worker nhắc nợ vẫn do Nest quản lý vòng đời.

Các thao tác ghi giữ transaction và khóa hàng nhà bằng `HouseAccessService.lock` trước khi kiểm tra lại quyền. Truyền cùng `tx` cho các service dùng chung, gồm `ExpenseBalancesService.calculate`, để số dư, giữ chỗ thanh toán, lịch sử và SSE được xử lý cùng transaction. Giữ nguyên clientId, phiên bản và hash nội dung khi retry; phần tách service không thay đổi API hoặc schema.

`POST /houses/:houseId/expenses/payments` vẫn nhận JSON. Khi đính kèm ảnh chuyển khoản, gửi multipart với trường `proof` và các trường thanh toán cũ. Ảnh là tùy chọn, chỉ dùng với `BANK_TRANSFER`, tối đa 5 MB, JPG/PNG/WebP. Dùng lại xử lý ảnh chung để xác thực nội dung, bỏ metadata và nén JPEG trước khi lưu vào `DebtPaymentProof` cùng transaction tạo thanh toán.

Response thanh toán có `hasProof`, không chứa bytes ảnh hoặc hash. `GET /houses/:houseId/expenses/payments/:paymentId/proof` trả ảnh riêng tư theo cùng quyền đọc danh sách thanh toán: thành viên hiện tại xem sổ chung; người đã rời chỉ xem thanh toán liên quan, trưởng nhà cũ còn xem thanh toán với người ngoài app. Ảnh được giữ khi xác nhận/từ chối/hủy/quyết toán; ảnh không tự xác nhận nhận tiền. Retry kiểm tra cả bytes ảnh gốc và nội dung thanh toán, giữ tương thích hash của request JSON cũ.

`GET .../balances` có `isSettled`, `unsettledCount`, `repaymentPromises` và `reminderPausedUntil` trên số dư. Trạng thái đã chốt tính từ toàn bộ khoản chi trong nhà, không phụ thuộc phân trang. Chốt gửi thông báo trong ứng dụng cho thành viên hiện tại, chỉ một lần cho đợt đó; chốt lại không tạo thông báo trùng. Khoản chi mới hoặc điều chỉnh sẽ mở lại trạng thái chưa chốt.

`POST .../repayment-promises` nhận `recipientId`, `payOn` (YYYY-MM-DD), `version` khi sửa. Chỉ người đang cần trả được hẹn đúng người nhận trong đề xuất còn hiệu lực. Ngày từ hôm nay đến 30 ngày tới, hết ngày tính theo UTC+7. `DELETE .../repayment-promises/:recipientId` nhận `version`. Cùng nội dung hẹn gửi lại không tạo thông báo trùng; ngày hẹn là cam kết của người trả, không phải xác nhận người nhận đã đồng ý hoặc đã nhận tiền. Người nhận ngoài app được thông báo qua trưởng nhà. Người đã rời nhà vẫn có thể hẹn trả nợ cũ.

Mỗi người đang nợ nhận tối đa một nhắc nợ cho mỗi nhà mỗi 7 ngày, bắt đầu sau 7 ngày theo dõi nợ. Phần đã ghi trả đang chờ xác nhận được loại khỏi số tiền nhắc. Nếu mọi đề xuất còn cần trả đều có ngày hẹn tương lai và được hẹn đủ tiền, dừng email đến ngày hẹn sớm nhất. Hẹn một phần không tắt nhắc các khoản còn lại. Khi khoản chi mới tăng nợ vượt số tiền đã hẹn hoặc người nhận thay đổi, ngày hẹn cũ không tự áp dụng cho nợ mới. Sau quá hẹn/hủy hẹn, tiếp tục chu kỳ còn lại; hẹn không đặt lại mốc 7 ngày. Khi trả đủ, xóa ngày hẹn, hủy mail chưa gửi và bắt đầu mốc mới nếu phát sinh nợ mới.

Worker nhắc nợ kiểm tra mỗi phút, mỗi lượt tối đa 100 nhà, khóa hàng nhà để hai instance không xếp cùng một nhắc hai lần. Khi backend khởi động, nợ cũ được đồng bộ theo lô và bắt đầu mốc theo dõi nếu chưa có. Thay đổi tài chính cập nhật lịch nhắc/hủy mail trong cùng transaction qua `ExpenseEventsService.signal`. `NotificationsService` dùng cơ chế gửi SMTP/retry có sẵn và kiểm tra lại trạng thái nhắc trước khi gửi. Scheduler/email tự động tắt trong môi trường `test`; cần backend chạy và SMTP được cấu hình để gửi mail thực tế.
