# Khoản chi và công nợ

Controller gọi `ExpensesService`. Service chính inject và chuyển công việc đến
các service phụ: khoản chi, người tham gia, số dư/quyết toán, thanh toán giữa
thành viên, thanh toán cho chủ phòng/người bán, biên nhận, nhắc nợ, ngày hẹn và
điều chỉnh sau chốt. Quyền truy cập và sự kiện/lịch sử dùng chung.

## Thanh toán một phần cho chủ phòng/người bán

- `amount`: tổng giá trị khoản chi; `paidAmount`: số thực tế đã thanh toán.
  `remainingAmount = amount - paidAmount`. Số tiền là VNĐ nguyên.
- Tạo khoản chi nhận `paidAmount` từ 0 đến `amount`. Nếu không gửi trường này,
  giữ hành vi cũ: khoản chi đã thanh toán đủ. Migration cũng gán các khoản cũ
  bằng tổng khoản chi để giữ dữ liệu và cách hiểu trước đây.
- `POST /houses/:houseId/expenses/:expenseId/supplier-payments` ghi trả thêm;
  nhận `version`, `clientId`, `amount`, `method`, `paidOn` (YYYY-MM-DD).
  Trưởng nhà hoặc người tạo khoản chi đang trong nhà được ghi nhận.
- `ExpenseSupplierPaymentsService` khóa theo nhà, kiểm tra phiên bản và số còn
  thiếu, ghi bản thanh toán, tăng `paidAmount`, lưu lịch sử trước/sau và phát SSE
  trong cùng transaction. Gửi lại cùng yêu cầu không ghi trùng; nội dung khác
  với cùng `clientId` bị từ chối. Khoản đã chốt/hủy không nhận lần trả mới.
- Sau khi có lần trả thêm, sửa khoản chi giữ nguyên số đã trả và người phụ trách.
  Có thể sửa nội dung hoặc tăng tổng khoản chi; không giảm tổng xuống dưới số đã
  trả. Điều chỉnh tiền đã nhập ban đầu trước lần trả thêm phải có lý do và lịch sử.
- Đây là ghi nhận tiền đã thanh toán; không thực hiện chuyển tiền hay xác minh
  với chủ phòng/người bán. Lần trả thêm không cần người nhận ngoài ứng dụng xác nhận.

## Bù trừ giữa thành viên

`DebtPayment` là tiền thành viên trả nhau, có xác nhận người nhận. Không dùng nó
để suy ra số đã trả cho chủ phòng/người bán.

Giữ công thức công nợ theo trách nhiệm thanh toán toàn bộ khoản chi:
`Tổng khoản phụ trách - Phần bản thân chịu + Đã trả thành viên - Đã nhận thành viên`.
Thanh toán một phần cho chủ phòng/người bán chỉ thay đổi tiến độ thanh toán,
không thay đổi phần chia hay công nợ nội bộ. Vì vậy người phụ trách có thể thu
tiền thành viên trước khi hoàn tất thanh toán hóa đơn.

Ô tổng hợp chỉ dùng chi tiết đợt chưa chốt: khoản chi chưa chốt, chênh lệch điều
chỉnh chưa chốt và thanh toán thành viên có `settledAt = null`. Tổng lịch sử ở
API được giữ để không đổi hợp đồng của các luồng cũ. Khi chốt, đánh dấu các
thanh toán đã xác nhận thuộc đợt vừa đóng; đợt mới không cộng lại tiền đợt trước.

Chỉ chốt khi số dư mọi người bằng 0, không có thanh toán chờ xác nhận và đã
thanh toán đủ từng khoản cho chủ phòng/người bán. Các khoản gốc đã chốt tiếp tục
chỉ được xem. Điều chỉnh sau chốt vẫn là bản chênh lệch riêng, không mở lại khoản gốc.

## Kiểm chứng ngày 13/10/2026

- Hai migration `payment_settlement_marker` và `expense_partial_payments` đã
  deploy vào PostgreSQL local; Prisma validate/status và build backend/frontend qua.
- 89 kiểm thử HTTP/PostgreSQL của chi phí, sinh hoạt và thống nhất chia phí qua,
  gồm gửi lại/đồng thời, phân quyền, trả vượt, sửa có lịch sử, khóa sau chốt và
  tách đợt cũ. Chạy bằng `vitest run --config vitest.config.e2e.ts
  test/expenses.e2e-spec.ts test/household.e2e-spec.ts test/cost-sharing.e2e-spec.ts
  --testTimeout=20000`.
- Edge với phiên đăng nhập và API kiểm thử thật: ví dụ tổng 6.180.000, đã trả
  1.000.000, còn 5.180.000; tạo khoản có trả trước, ghi trả thêm, lịch sử, focus,
  chi tiết bằng bàn phím và SSE tách tiền thành viên khỏi tiền trả hóa đơn.
  Thanh toán đủ ở phiên khác khóa form đang mở và bỏ nút trả thêm qua SSE.
- Bố cục ô tổng hợp, chi tiết mở, form khoản chi và form trả thêm không tràn
  ngang ở 320/390/430/768/820/1024/1366/1920 px. Đây là mô phỏng kích thước trong
  Edge, không phải kiểm chứng phần cứng của mọi thiết bị hay mọi trình duyệt.
