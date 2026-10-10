# Phase 8 — Sinh hoạt chung và báo cáo

Hoàn thành triển khai và kiểm chứng local ngày 11/10/2026 theo `room.todo` và hai mẫu việc nhà/mua chung, chi phí định kỳ/báo cáo trong `design-reference`. Giữ theme cam đỏ/kem và các component dùng chung.

## Đã triển khai

- Việc nhà: tạo, phân công người trong nhà, ngày hạn, ghi chú, sửa, xác nhận hoàn thành, hủy/mở lại; lọc trạng thái và phân trang.
- Mua chung: món/số lượng/người phụ trách/ngày cần mua, đánh dấu đã mua, mở form khoản chi để nhập số tiền thực tế. Đánh dấu đã mua không tự đổi công nợ.
- Quy tắc chi phí hằng tháng: khoản cố định hoặc biến động, danh mục, người phụ trách, danh sách chia; sửa và tạm dừng/kích hoạt. Ngày 29–31 xử lý tháng ngắn và giữ ngày gốc cho tháng sau.
- Worker tạo nháp đến hạn, nhắc trong ứng dụng và SSE; chống hai instance tạo trùng, bù kỳ sau downtime theo lô, dừng ở nhà đã đóng.
- Người dùng kiểm tra số tiền và người chia, xác nhận nháp vào sổ hoặc bỏ qua kỳ. Dùng transaction, khóa nhà, nghiệp vụ khoản chi/lịch sử/công nợ hiện có; retry/đồng thời không tạo khoản chi trùng.
- Người ngoài app dùng `HouseParticipant`, được phân công và chia tiền; hoàn thành ghi rõ thủ công, nhắc khoản định kỳ qua trưởng nhà. Người đã rời không truy cập sinh hoạt/báo cáo nhà, vẫn giữ luồng lịch sử công nợ Phase 7.
- Khoản chi có danh mục và ngày phát sinh. API cũ tương thích, giữ dữ liệu khi sửa không gửi trường mới; migration backfill ngày lịch sử theo UTC+7.
- Báo cáo tháng theo ngày phát sinh, danh mục, người trả/phần chịu. Loại khoản hủy, không cộng nháp hoặc trả nợ vào chi phí. Công nợ toàn sổ hiện tại hiển thị riêng.
- Xuất CSV UTF-8 BOM dùng Excel/LibreOffice, gồm khoản chi/phân loại/phần chịu/số dư/thanh toán chờ/đề xuất bù trừ, bảo vệ công thức từ nội dung người dùng và tải riêng tư.
- Xuất PDF A4 trực tiếp, tiếng Việt dùng Be Vietnam Pro nhúng, tự phân trang/lặp tiêu đề bảng/đánh số trang. Font kèm giấy phép được copy vào bản build; không cần mạng lúc xuất.
- Làm lại bốn màn sinh hoạt: header có điểm nhấn, thẻ chia cột, người phụ trách và hạn tách rõ, trạng thái có nhãn/màu; định kỳ có lịch/tiền/người chia. Báo cáo có biểu đồ vòng nhiều màu, bảng thành viên/khoản chi và thẻ công nợ cần trả/cần nhận. Đổi tháng không hiển thị dữ liệu tháng cũ trong lúc tải.
- Nhà chung thêm các tab Việc nhà, Mua chung, Chi phí định kỳ, Báo cáo. Thông báo mở `/nha-chung/:id/sinh-hoat` vào tab định kỳ.

Service chính `HouseholdService` chỉ chuyển lời gọi. Service theo nhiệm vụ và worker được Nest inject/quản lý, tương tự cấu trúc expenses. Chi tiết API/quyền/nghiệp vụ: [src/modules/household/README.md](src/modules/household/README.md).

## Kiểm chứng thực tế

- Migration `20261010190000_household_reports` đã deploy vào PostgreSQL local `127.0.0.1:5433`. Prisma diff giữa DB và schema: **No difference detected**.
- **29 kiểm thử HTTP/PostgreSQL Phase 8** qua: xác thực/quyền nhà/Origin/DTO, phân công sai nhà, người ngoài app/đã rời, phiên bản, đồng thời, retry, trạng thái và phân trang; thống kê trạng thái không phụ thuộc bộ lọc/trang, quyền/tháng PDF và đọc PDF 45 khoản tiếng Việt nhiều trang đúng tổng/không mất dòng/số trang.
- Bao gồm hai worker độc lập, tạo nháp không đổi sổ, snapshot giữ nguyên khi sửa quy tắc, lịch UTC+7, tạm dừng/kích hoạt, khoản biến động, xác nhận đúng một lần từ hai người, rollback khi thanh toán đang chờ, retry sau khi người ghi rời nhà, nhắc qua trưởng nhà, báo cáo/CSV và tương thích API cũ.
- **28 kiểm thử hồi quy** expenses/houses Phase 7/6 qua. Tổng lượt cuối: **57 HTTP/PostgreSQL**.
- **4 unit test** qua cho tháng ngắn/năm nhuận/chuyển năm và CSV chống công thức/escape.
- Backend build/TypeScript qua; frontend production build/TypeScript và ESLint qua. Backend lint không có lỗi; còn các warning sort ở test cũ ngoài Phase 8.
- Edge headless với tài khoản/nhà thử riêng, PostgreSQL/API thật, SMTP tắt: tạo việc bằng form, đổi tài khoản người phụ trách và hoàn thành, cập nhật SSE từ người khác, đánh dấu mua không tạo nợ, nhập khoản mua thực tế, worker thật tạo nháp và xác nhận cố định/biến động, báo cáo chính xác, tải CSV và PDF thực tế (đọc lại đúng tiếng Việt/tổng/số trang), tháng rỗng và tải lại vẫn giữ dữ liệu.
- Bảy màn hình/form kiểm tra ở **320/390/768/1366/1920 px** không tràn ngang toàn trang. Bảng báo cáo có cuộn ngang bên trong trên màn nhỏ. Không lỗi JavaScript trong lượt kiểm tra đạt.
- Kết quả/ảnh kiểm tra nằm cục bộ ở `.verification/phase8-browser-report.json` và `.verification/phase8-*.png`; dữ liệu thử đã dọn.

Chạy lại kiểm thử từ `backend` (Node 22 đang hoạt động, `NODE_ENV=test`, SMTP tắt):

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.config.e2e.ts test/household.e2e-spec.ts test/expenses.e2e-spec.ts test/houses.e2e-spec.ts
node node_modules/vitest/vitest.mjs run src/modules/household/recurring-dates.spec.ts
```

## Bổ sung: thống nhất cách chia chi phí tháng

- Thêm module `cost-sharing` theo facade/service nhiệm vụ, bảng kỳ/tháng/danh mục, vòng, phiếu có phiên bản, sự kiện phiếu và cấu hình. Migration `20261011010000_monthly_cost_sharing` đã deploy; DB diff trống, 22 migration đã áp dụng.
- Tab **Thống nhất chia phí**: hạn mặc định cuối ngày 7 UTC+7; EQUAL cần đủ phiếu, WEIGHTED cần đề xuất tỷ lệ + lý do và mọi thành viên đồng ý cùng vòng. Từ chối mở đề xuất mới; phương án dự phòng cũng cần đồng thuận từ trước. Không có dự phòng hợp lệ thì giữ chưa thống nhất, không tự chia đều.
- Người đại diện chỉ giúp tính nhanh tỷ lệ trong form đề xuất, các người còn lại 0%; mọi thành viên House có tài khoản vẫn phải đồng ý. Người ngoài app không tham gia chính sách tháng theo lựa chọn của người dùng.
- Khoản thực tế/xác nhận nháp dùng đúng tháng/danh mục, lưu nguồn/quy tắc trên Expense. Không đổi khoản cũ hàng loạt; đổi thành viên làm các khoản mới cần thống nhất lại. Khoản đã ghi giữ snapshot khi chỉnh cùng kỳ.
- HouseholdPerson dùng ảnh hồ sơ thật cho người phụ trách, người trả, báo cáo và bình chọn; fallback chữ khi chưa có ảnh. Lịch sử giữ snapshot nghiệp vụ, avatar hiển thị được cập nhật theo hồ sơ hiện tại.
- **24 kiểm thử HTTP/PostgreSQL mới qua**; **57 kiểm thử household/expenses/houses hồi quy qua**, **6 unit test qua**. Build backend/frontend, TypeScript và lint phần mới qua. Backend lint toàn repo còn các warning sort trong test cũ.
- Edge thật với 3 tài khoản/nhà thử riêng: bật ngày 7 sau hạn vẫn chưa thống nhất, form chặn khoản chưa chốt, chọn đại diện/tổng tỷ lệ, từ chối rồi sửa/bỏ phiếu lại đủ 3 người, lịch sử vòng/phiếu, form khoản thực tế khóa quy tắc và DB nhận đúng 701/200/100 VNĐ cho khoản 1001 VNĐ chia 70/20/10. Avatar tải được; 4 màn/form không tràn ở 320/390/768/1366/1920 px, không lỗi JavaScript.
- Artifact kiểm chứng local: `.verification/cost-sharing-browser-report.json`, `.verification/cost-sharing-*.png`; fixture đã dọn. Thiết kế, API, file và hướng dẫn dùng: [cost-sharing/README.md](src/modules/cost-sharing/README.md).

Chạy riêng kiểm thử mới từ backend: `node node_modules/vitest/vitest.mjs run --config vitest.config.e2e.ts test/cost-sharing.e2e-spec.ts`.

## Giới hạn hiện tại

- Có cả PDF và CSV; bảng quyết toán là bản ghi nội bộ tại thời điểm xuất, không tự chốt sổ hoặc xác nhận thanh toán.
- Chỉ lặp chi phí hằng tháng; chưa xoay vòng việc nhà phức tạp hoặc tích hợp lịch bên ngoài.
- Nháp và nhắc trong ứng dụng cần backend hoạt động; scheduler tự tắt trong môi trường test. Chi phí định kỳ không tự ghi tiền hoặc tự xác nhận thanh toán.
- Khoản mua chung ghi thủ công qua form Phase 7, chưa ràng buộc duy nhất một khoản chi với một món mua. Giao diện yêu cầu kiểm tra sổ để tránh nhập cùng món hai lần.
- Báo cáo hiện đọc và xuất trực tiếp; chưa kiểm chứng tải dữ liệu lớn hoặc thiết bị Safari/iOS. Kiểm chứng tải/queue báo cáo thuộc Phase 12.
