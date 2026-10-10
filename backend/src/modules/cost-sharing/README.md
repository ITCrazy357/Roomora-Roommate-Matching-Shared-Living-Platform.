# Thống nhất cách chia chi phí tháng

Module riêng, controller chỉ gọi facade `CostSharingService`; service kỳ, phiếu, áp dụng quy tắc và scheduler tách theo nhiệm vụ. Tái dùng `AuthGuard`, `HouseAccessService.lock/active`, `NotificationsService` và luồng tạo `ExpenseRecordsService` (gồm xác nhận nháp định kỳ).

## Model và phạm vi

- `CostSharingSetting`: danh mục cần thống nhất, ngày hạn mặc định; trưởng nhà bật/tắt. Scheduler mở kỳ hiện tại vào đầu tháng cho danh mục đã bật. Không tự bật chính sách tài chính cho House cũ.
- `CostSharingPeriod`: kỳ `MONTHLY` theo tháng/danh mục hoặc cuộc thống nhất `DEFAULT`; trạng thái, hạn, vòng hiện tại, kết quả và snapshot dự phòng đã được đồng ý trước khi mở kỳ. Một kỳ tháng/danh mục duy nhất trong DB.
- `CostSharingRound`: vòng chọn `EQUAL/WEIGHTED` hoặc đề xuất cụ thể. Danh sách thành viên và thời điểm gia nhập được snapshot theo vòng; đề xuất mới là vòng mới, không sửa tỷ lệ của đề xuất đã bỏ phiếu.
- `CostSharingVote`: duy nhất `(roundId, userId)`, có phiên bản để tránh ghi đè khi gửi đồng thời. `CostSharingVoteEvent` lưu mọi thay đổi phiếu.
- `Expense.sharingPeriodId/sharingSnapshot`: nguồn và tỷ lệ đã áp dụng; phần VNĐ vẫn lưu bằng `ExpenseSplit` như hiện tại. Không chạy cập nhật hàng loạt các khoản đã ghi/chốt.

Người có tài khoản và đang là `HouseMember` bỏ phiếu; theo lựa chọn của người dùng, không đưa người ngoài app vào quy tắc tháng. Form đề xuất cho chọn các thành viên đại diện để tính nhanh 100% chia cho N người, các thành viên còn lại 0%; có thể sửa từng tỷ lệ trước khi gửi. Chọn đại diện chỉ hỗ trợ tính toán, không thay thế phiếu: mọi thành viên vẫn phải đồng ý. Các luồng chi thủ công không bật chính sách tháng vẫn hỗ trợ người ngoài app như trước.

## Luồng

1. Trưởng nhà bật từng danh mục. Hạn mặc định cuối ngày 7 hằng tháng (UTC+7); scheduler mở kỳ vào đầu tháng. Nếu bật lần đầu sau ngày 7, kỳ hiện tại chưa thống nhất; trưởng nhà có thể mở vòng mới với hạn tương lai trong đúng tháng đó. Kỳ mở vòng chọn cách chia; mọi thành viên chọn EQUAL thì chốt EQUAL. Có lựa chọn WEIGHTED thì mọi thành viên được tạo đề xuất tỷ lệ + lý do.
2. Đề xuất mới tạo vòng mới. Tất cả thành viên đồng ý cùng vòng thì chốt; có phiếu từ chối thì giữ lịch sử và cho chỉnh thành đề xuất mới, bỏ phiếu lại.
3. Tỷ lệ WEIGHTED dùng basis point nguyên (100 = 1%, tổng 10000 = 100%), không âm, không trùng/người ngoài snapshot. Số tiền dùng phương pháp phần dư lớn nhất, thứ tự UUID để phân bổ khi bằng nhau, tổng luôn đúng VNĐ.
4. Kỳ DEFAULT cũng cần đồng thuận đầy đủ. Kỳ tháng snapshot bản DEFAULT đã thông qua trước khi mở kỳ, chỉ dùng khi hết hạn và danh sách/thời điểm gia nhập không đổi. Không có bản hợp lệ thì UNRESOLVED, chặn ghi khoản chi theo chính sách đó. Không chọn EQUAL ngầm.
5. Thay đổi thành viên làm vòng hiện tại cần mở lại với danh sách mới; phiếu/mặc định cũ không được dùng để tạo đồng thuận mới. Trưởng nhà có thể mở lại kỳ chưa có kết quả, hoặc kỳ đã chốt nhưng danh sách/thời điểm gia nhập thay đổi, và đặt hạn mới. Vòng cũ/kết quả/phiếu vẫn lưu; khoản chi cũ giữ snapshot riêng. Không mở lại kết quả đã chốt khi thành viên vẫn giữ nguyên.
6. Khoản chi mới áp dụng theo category + tháng của spentOn. Backend tính phần chia, không tin tỷ lệ/số tiền chia do client gửi. Danh mục chưa bật không đổi hợp đồng cũ. Chỉnh sửa chủ động khoản đã ghi giữ snapshot riêng và đi qua audit/version như cũ; thay đổi tháng/danh mục của khoản theo chính sách phải kiểm tra lại quy tắc.

## API

Prefix `/houses/:houseId/cost-sharing`, yêu cầu phiên và thành viên hiện tại.

| API                            | Nội dung                                                       |
| ------------------------------ | -------------------------------------------------------------- |
| GET `?month=YYYY-MM`           | Kỳ tháng, 50 cuộc dự phòng gần nhất, cấu hình và vòng/phiếu hiện tại |
| PUT `settings/:category`       | Trưởng nhà bật/tắt và chọn ngày hạn                            |
| POST `defaults`                | Mở cuộc thống nhất phương án dự phòng                          |
| POST `periods/:id/votes`       | Phiếu có roundId, version và choice                            |
| POST `periods/:id/proposals`   | Đề xuất mới có roundId, mode, shares, reason                   |
| POST `periods/:id/reopen`      | Trưởng nhà mở vòng mới khi chưa chốt hoặc thành viên đổi       |
| GET `periods/:id?page=&limit=` | Lịch sử các vòng, đề xuất và mọi thay đổi phiếu, có phân trang |
| GET `rule?month=&category=`    | Quy tắc áp dụng/đang chờ/chưa thống nhất cho form khoản chi    |

Mọi ghi khóa hàng House trước khi kiểm tra quyền/census/hạn. Request cuối chốt cùng transaction; request đến sau không được thay đổi kết quả. Scheduler và API cùng khóa, nên không chốt hai lần hoặc nhận phiếu sau hạn. Thông báo/SSE nằm trong transaction. Hạn dùng múi giờ UTC+7.

## File và cách dùng

- `cost-sharing.controller.ts`, `dto/`, `cost-sharing.service.ts`: hợp đồng API, xác thực và facade theo cấu trúc hiện có.
- `cost-sharing-periods.service.ts`: mở kỳ, cấu hình, gia hạn, dự phòng và lịch sử. `cost-sharing-ballots.service.ts`: phiếu có phiên bản, đề xuất, đồng thuận/từ chối. `cost-sharing-rules.service.ts`: kiểm tra và tính phần chia đúng tháng/danh mục. `cost-sharing-scheduler.service.ts`: mở kỳ/đóng hạn khi backend chạy.
- `cost-sharing-types.ts`: snapshot thành viên, kiểm tra tổng tỷ lệ và phân bổ VNĐ nguyên.
- Prisma schema + migration `20261011010000_monthly_cost_sharing`: bảng kỳ/vòng/phiếu/lịch sử/cấu hình; unique index bảo vệ concurrency; nguồn quy tắc trên Expense.
- `ExpenseRecordsService` áp dụng quy tắc khi tạo/xác nhận nháp và khi chủ động đổi tháng/danh mục. Chỉnh khoản cũ cùng kỳ giữ snapshot; khoản thủ công cũ không bị tự đổi sang chính sách tháng.
- Frontend: `HouseCostSharing`, `SharingProposalForm`, `SharingHistory`, route `/nha-chung/:id/chia-chi-phi`; `ExpenseForm` hiển thị quy tắc và phần tiền đã chốt, chặn lưu khi chưa thống nhất. `HouseholdPerson` dùng avatar hồ sơ, fallback chữ khi chưa có ảnh.

Vào **Nhà chung → Thống nhất chia phí**, chọn tháng/danh mục; trưởng nhà bật bình chọn. Chọn chia đều hoặc theo tỷ lệ; gửi đề xuất và cùng đồng ý. Thiết lập dự phòng trước khi kỳ muốn dùng nó được mở. Vào **Chi phí** hoặc xác nhận nháp **Chi phí định kỳ** để nhập tiền thực tế, ngày phát sinh và người trả; phần chia lấy từ quy tắc đã chốt.
