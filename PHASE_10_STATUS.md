# Phase 10 — Quản trị và hỗ trợ

Ngày triển khai: 13/10/2026. Phạm vi theo `backend/room.todo`.

## Phần đã có được giữ và kiểm tra lại

- Kiểm duyệt tin, ADMIN workspace và quyền truy cập riêng.
- Khóa/mở khóa có lý do, thu hồi phiên, lịch sử quyết định.
- Báo cáo người dùng và thông báo hệ thống theo lịch.
- Dashboard tháng, thanh toán/hoàn tiền và quy trình xử lý hoàn tiền của Phase 9.
- Cài đặt hồ sơ công khai/riêng tư và từng nhóm thông tin hiển thị.

## Phần bổ sung

- Báo cáo từng tin đăng, snapshot công khai, chống trùng và giới hạn gửi.
  ADMIN xem báo cáo/phiên bản hiện tại, gỡ tin kèm quyết định và lịch sử trong transaction.
- Ticket hỗ trợ cho USER/ADMIN, gắn đơn sở hữu, trao đổi có phiên bản,
  yêu cầu bổ sung/giải quyết/mở lại/đóng và lịch sử kiểm tra.
- Tra cứu đơn dịch vụ, trạng thái, sự kiện thanh toán và liên kết tới hoàn tiền.
- Nhật ký chung có phân trang/lọc UUID; duyệt tin mới ghi thêm AdminAction.
- Thống kê tài khoản, tin tạo và các cặp kết nối theo tháng.
- Đóng tài khoản bằng OTP email riêng. Kiểm tra nhà/công nợ/thanh toán/hoàn tiền,
  thu hồi phiên/token, đóng tin, hủy kết nối/lịch hẹn tương lai và giữ lịch sử đối chiếu.
- Theo lựa chọn của người dùng, ADMIN được khôi phục tài khoản đã đóng qua thao tác riêng,
  có căn cứ/phiên bản/audit; phiên cũ không sống lại, hồ sơ/tin không tự công khai.
- Sửa lỗi API hồ sơ công khai chưa kiểm tra chủ hồ sơ bị khóa khi truy cập trực tiếp ID.

Các service chia theo nghiệp vụ như cấu trúc hiện có. Dùng DTO/guard/transaction,
row lock và version của dự án; tái sử dụng ledger công nợ và dịch vụ OTP,
không thêm thư viện mới. UI dùng token coral/cream, component và workspace hiện có.

## Database và kiểm chứng

Migration `20261013025000_account_closure_otp` và `20261013030000_admin_support`
đã áp dụng trên PostgreSQL `127.0.0.1:5433`. Không xóa dữ liệu hiện có;
thay unique báo cáo bằng hai partial index cho tài khoản/tin.

`backend/test/phase-10.e2e-spec.ts` dùng HTTP và PostgreSQL thật, kiểm tra
quyền ADMIN/USER, chống báo cáo trùng/đồng thời, snapshot riêng tư,
rollback khi phiên bản tin cũ, gỡ tin và audit, tra cứu giao dịch,
ticket sở hữu/phiên bản/đồng thời/mở lại/đóng, giới hạn gửi,
hồ sơ tài khoản bị khóa và OTP đóng tài khoản (nhà, nhà cũ, công nợ, thanh toán,
hoàn tiền, Google-only, thu hồi phiên, giữ lịch sử, chặn mở khóa thường khi đã đóng,
khôi phục có căn cứ/phiên bản/đồng thời và yêu cầu đăng nhập lại).

Kết quả kiểm tra ngày 13/10/2026:

- 238 E2E qua trong 11 bộ: Phase 10 (20 test), admin, listings, auth/profile,
  people, OTP, billing, refunds, houses, communications và Google auth.
  Chạy tuần tự với `--no-file-parallelism --testTimeout=30000 --hookTimeout=60000`
  để tránh giới hạn 5 giây trong môi trường local đang chạy nhiều server.
- Build backend/frontend qua. Lint frontend không lỗi; backend không lỗi và
  không có warning mới. Còn 5 warning `require-array-sort-compare` trong các
  test expenses/house-chat/message-changes có sẵn, ngoài phạm vi Phase 10.
- Chromium/CDP với session thật và PostgreSQL thật kiểm tra gửi báo cáo,
  ADMIN gỡ tin, ticket USER/ADMIN từ gửi đến đóng, tra cứu giao dịch/lọc nhật ký,
  OTP đóng tài khoản và ADMIN khôi phục theo yêu cầu. Sau đóng, đăng nhập trả
  `403 ACCOUNT_CLOSED`; sau khôi phục, đăng nhập mới qua và hồ sơ vẫn `PRIVATE`.
- 55 trường hợp bố cục ở 320/390/768/1024/1366 px, gồm danh sách và chi tiết
  hỗ trợ/giao dịch, dashboard, báo cáo, nhật ký, cài đặt và khôi phục tài khoản:
  không tràn ngang, không có JavaScript exception của ứng dụng.
- Browser dùng font dự phòng do bản dev thử nghiệm không tải được Google Fonts;
  cấu hình Be Vietnam Pro của dự án vẫn giữ nguyên. Build frontend chính dùng
  cấu hình `.env.local` của dự án.
- Tài khoản/đơn/ticket/báo cáo thử nghiệm đã được dọn. Các server thử nghiệm
  3006/5010 và Chromium riêng đã dừng; server của người dùng ở 3000/5000 được giữ.

Ảnh và JSON kiểm tra local nằm trong `.verification/phase10/` (Git ignored).

## Các file nghiệp vụ chính

- `backend/src/modules/admin/`: báo cáo tin, tra cứu giao dịch, nhật ký,
  thống kê và khôi phục tài khoản.
- `backend/src/modules/support/`: ticket và trao đổi có kiểm tra sở hữu/phiên bản.
- `backend/src/modules/auth/account-closure.service.ts`: OTP đóng tài khoản,
  kiểm tra nghĩa vụ và thu hồi quyền truy cập.
- `frontend/src/components/support/`, `frontend/src/components/admin/` và
  `frontend/src/app/tai-khoan/cai-dat/account-closure-card.tsx`: các màn hình tương ứng.

## Giới hạn kiểm chứng

OTP email dùng MailService mô phỏng và mã development trong kiểm thử.
Chưa chứng minh gửi/nhận email đóng tài khoản qua SMTP thực tế.
Đơn dịch vụ trong kiểm tra là fixture; không thực hiện thu/hoàn tiền thật.
Các giới hạn tích hợp cổng thanh toán của Phase 9 tiếp tục theo tài liệu billing.

Đóng tài khoản là ngừng hoạt động, không phải xóa/anonymize toàn bộ thông tin.
Điều này được thông báo trước khi người dùng xác nhận. Email/tài khoản và dữ liệu
liên quan được giữ để đối chiếu; không có tự mở lại hoặc tái đăng ký cùng email.
Chủ tài khoản có thể yêu cầu ADMIN khôi phục với căn cứ được ghi trong nhật ký.
