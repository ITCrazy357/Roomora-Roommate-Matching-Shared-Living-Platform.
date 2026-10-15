# Khai báo danh tính demo, tra cứu hồ sơ và hạn mức đăng tin

Cập nhật 15/10/2026. Người dùng chọn **khai báo tượng trưng cho đồ án** và
**nộp đủ hồ sơ là được tiếp tục**, không cần chờ ADMIN duyệt.

## Hành vi hiện tại

- USER mở `/tai-khoan/danh-tinh`, nhập họ tên, ngày sinh, số CCCD 12 chữ số,
  điện thoại và địa chỉ liên hệ. Có nút **Điền dữ liệu mẫu** và xác nhận chỉ
  dùng dữ liệu giả. Không thu ảnh giấy tờ, ảnh khuôn mặt hoặc sinh trắc học.
- Nộp thành công tạo trạng thái `PENDING`: **Đã khai báo (demo)**. USER được
  tạo nhà chung, nhận lời mời vào nhà và gửi tin cho thuê ngay sau khi nộp.
- Backend kiểm tra khi tạo nhà, nhận lời mời, gửi duyệt tin `ROOM_RENTAL` và
  khi ADMIN công khai tin cho thuê. Có thể lưu nháp trước khi khai báo.
- ADMIN có `/admin/ho-so`, tìm theo tên hiển thị/email, lọc trạng thái và mở
  hồ sơ từ trang Người dùng. Danh sách chỉ gồm tài khoản đã nộp khai báo.
- ADMIN được duyệt thủ công thành `APPROVED`: **Hồ sơ đã duyệt (demo)** hoặc
  yêu cầu bổ sung thành `REJECTED`, luôn có lý do và kiểm tra phiên bản.
- `REJECTED` chặn các lần tạo/vào nhà hoặc gửi/duyệt tin cho thuê tiếp theo.
  USER sửa và nộp lại sẽ trở về `PENDING`, xóa nhãn duyệt cùng ghi chú cũ.
  Không tự đuổi thành viên hiện hữu hoặc tự gỡ các tin đã công khai.
- Nhãn demo xuất hiện ở hồ sơ công khai và chi tiết người đăng tin. Không
  dùng chữ “đã xác minh danh tính” hoặc giả kết quả RAR/VNeID. Duyệt demo
  không nâng hạn mức 3/8 và không bảo đảm quyền sở hữu phòng hay trả nợ.

## Phân quyền và bảo vệ thông tin

Hồ sơ khai báo nằm trong bảng `identity_declarations`, tách khỏi hồ sơ công
khai. Payload họ tên/ngày sinh/CCCD/điện thoại/địa chỉ được mã hóa AES-256-GCM,
nonce ngẫu nhiên mỗi lần ghi và AAD ràng buộc userId. Chỉ bốn số cuối và trạng
thái được lưu riêng để hiển thị. Không dùng khóa mặc định hoặc lưu plaintext
khi thiếu khóa. Không công khai CCCD để tìm kiếm hoặc trao đổi giữa các USER.

| Thông tin | ADMIN mặc định |
| --- | --- |
| Trạng thái khai báo | Được xem, ghi rõ demo |
| Họ tên trong khai báo | Ẩn, mở khi có lý do |
| CCCD | Chỉ thấy `********1234` |
| Ngày sinh, điện thoại, địa chỉ | Ẩn, mở khi có lý do |
| Ảnh CCCD gốc | Không thu thập trong demo |
| Khuôn mặt, sinh trắc học | Không thu thập trong demo |
| Kết quả API xác thực | Chưa tích hợp, kết quả `null` |
| Ai xem/mở/xử lý hồ sơ | Có nhật ký actor/thời điểm/lý do/phiên bản |

ADMIN cần nhập lý do ít nhất 5 ký tự và đúng phiên bản để mở thông tin đầy
đủ. Mỗi lần mở ghi `IDENTITY_REVEALED`; xem chi tiết đã che ghi
`IDENTITY_VIEWED`; xử lý ghi `IDENTITY_APPROVED`/`IDENTITY_REJECTED`.
Snapshot audit chỉ chứa mode/trạng thái/phiên bản, không chép dữ liệu giấy tờ.
Thông tin đã mở tự ẩn sau 60 giây, khi chuyển tab hoặc phiên bản thay đổi;
có nút Ẩn thông tin. Không lưu vào localStorage. API hồ sơ dùng `no-store`.

Người dùng chỉ đọc/sửa hồ sơ của chính mình. ADMIN không dùng API khai báo
USER. Quyết định và nộp lại dùng khóa tài khoản, kiểm tra version để không
duyệt nhầm dữ liệu đã đổi. Trạng thái công khai chỉ là enum, không chứa các
trường cá nhân, ghi chú xử lý hoặc ciphertext.

## API và cấu hình

- `GET /identity/me`: `{ declaration: record | null }`, gồm các trường của
  chính USER đã giải mã.
- `GET /identity/status`: cùng envelope, chỉ metadata đã che.
- `PUT /identity/me`: thông tin + `{ version, confirmDemo: true }`; tạo mới
  dùng version 0, cập nhật dùng version hiện tại.
- `GET /admin/identities`: tìm kiếm/lọc/phân trang hồ sơ đã che.
- `GET /admin/identities/:userId`: chi tiết đã che, có nhật ký truy cập.
- `POST /admin/identities/:userId/reveal`: `{ version, reason }`.
- `PATCH /admin/identities/:userId`: `{ version, reason, status }`.

Các đường dẫn có tiền tố `/api/v1` như các module khác.

Backend cần `IDENTITY_ENCRYPTION_KEY` gồm 64 ký tự hex ngẫu nhiên (32 byte).
Khóa local đã tạo trong `backend/.env`, không in giá trị ra log/chat và không
đưa vào Git. Khi chạy container, đặt khóa trong env_file của môi trường API.
Giữ khóa cùng bản sao lưu được bảo vệ; đổi/mất khóa làm dữ liệu cũ không giải
mã được, chưa có chức năng xoay khóa tự động.

`IDENTITY_DECLARATION_REQUIRED=true` là mặc định. Có thể đặt false để rollout
hoặc chạy các bộ regression có fixture cũ. Bộ `identity-support.e2e-spec.ts`
luôn bật true và kiểm tra điều kiện bắt buộc bằng HTTP/PostgreSQL thật.
Migration mới: `20261015100000_demo_identity_declarations`.

## Sửa cập nhật trạng thái hỗ trợ và báo cáo

Ảnh lỗi của người dùng là màn **Yêu cầu hỗ trợ**. Trước đây dropdown chỉ chọn
“trạng thái sau phản hồi”, trạng thái chỉ lưu khi gửi kèm nội dung hợp lệ;
chọn “Đã đóng” trong dropdown chưa tự ghi vào database.

Đã bổ sung nút **Lưu trạng thái** và endpoint
`PATCH /admin/support/tickets/:id/status` nhận `{ version, status }`, không
bắt viết thêm phản hồi hoặc tạo tin nhắn giả. Gửi phản hồi kèm trạng thái vẫn
hoạt động. Màn hình tách trạng thái đã lưu khỏi lựa chọn đang soạn, cập nhật
đúng phiên bản và báo rõ thành công/lỗi. Yêu cầu đã đóng vẫn là trạng thái cuối.

Tạo yêu cầu, phản hồi và đổi trạng thái phát tín hiệu tới người gửi và các
ADMIN đang hoạt động sau commit. Xử lý báo cáo vi phạm cũng phát tín hiệu tới
người báo cáo, đối tượng và ADMIN. SSE chỉ chứa tín hiệu, dữ liệu được đọc lại
qua API có phân quyền. Frontend không phụ thuộc việc tải số chưa đọc thành
công mới refresh màn hình; bỏ qua response cũ đã bị abort để tránh ghi đè dữ
liệu mới. Không thay đổi các quy tắc xử lý báo cáo/khóa tài khoản sẵn có.

## Hạn mức đăng tin đã triển khai trước đó

- Tổng **3 tin/tuần** cho `ROOM_WANTED` và `ROOMMATE` (cả hai lựa chọn ở ghép).
- Tăng thành **8 tin/tuần** khi có `BOOST_7_DAYS` đã kích hoạt còn hạn, chưa
  hoàn tiền; nhiều gói không cộng dồn, gói AI không cấp quyền lợi này.
- Tuần từ thứ Hai 00:00 UTC+7. Tính khi gửi duyệt thành công lần đầu.
- Lưu nháp, gửi lỗi, sai phiên bản và gửi lại cùng ID không trừ thêm lượt.
  Sửa/đóng/đổi loại/xóa nháp không trả lượt; số dư không chuyển sang tuần sau.
- Ưu đãi tài khoản kéo dài đến `ListingBoost.endsAt` đã cấp, kể cả khi tin gốc
  đóng/đã đủ/chờ duyệt lại. Đơn PAID đến muộn không được cấp boost không cấp
  thêm lượt. Gói hết hạn/hoàn tiền giữ số lượt đã dùng và các tin đã gửi.
- `GET /listings/quota` trả hạn mức của chính USER; hết lượt trả HTTP 429
  `LISTING_WEEKLY_LIMIT`. Kiểm tra và ghi `listing_submissions` cùng transaction.
- Migration `20261015090000_listing_weekly_quota` backfill từ mốc sớm nhất còn
  lưu. Lịch sử cũ bị xóa `submittedAt` mà không có review không khôi phục được;
  review chỉ là mốc thay thế. Từ migration trở đi có lịch sử riêng.

## Kiểm chứng local

- Cả hai migration đã áp dụng trên PostgreSQL `127.0.0.1:5433/roomora`.
- 101 kiểm thử HTTP/PostgreSQL qua: identity/support, Phase 10, listings,
  houses, people, auth-profile, admin và quota. Các regression cũ dùng flag
  khai báo false; 14 kiểm thử identity/support bật true và tự sinh dữ liệu giả.
- 33 unit tests mã hóa/cấu hình qua. Kiểm tra chống tráo dữ liệu giữa tài khoản,
  sửa ciphertext, thiếu khóa, nộp lại và quyết định stale, rò dữ liệu qua API/audit,
  nhận lời mời nhà, duyệt tin cho thuê và cạnh tranh cập nhật trạng thái.
- Build backend và production frontend (bản sao riêng), TypeScript frontend
  và lint frontend qua. Lint backend còn
  5 warning cũ ở test ngoài phạm vi. Không coi type-check toàn bộ test backend
  là đã qua; các lỗi kiểu test ngoài phạm vi được ghi nhận ở lần kiểm tra trước.
- Edge dùng hai browser context USER/ADMIN, session/API/DB/SSE thật: nộp hồ sơ,
  tạo nhà ngay sau nộp, che/mở/ẩn CCCD và audit, duyệt demo cập nhật trang USER;
  lưu trạng thái hỗ trợ không viết phản hồi cập nhật danh sách/chi tiết USER và
  ADMIN khi cả hai đang mở. Không dùng response fixture cho các luồng này.
- Khai báo, tra cứu ADMIN và hỗ trợ không tràn ngang tại
  320/390/768/1024/1366px, cả theme sáng/tối; không lỗi JavaScript.
  Script/báo cáo/ảnh trong `.verification/identity-support-browser.mjs` và
  `.verification/identity-support-results/`. Dữ liệu/tài khoản thử đã dọn.

## Phần xác minh chính thức và công nợ

Chưa gọi API RAR, chưa xác minh căn cước hoặc khuôn mặt thật. Thiết kế này
không thể thay cho xác minh điện tử chính thức. Khi tích hợp thật cần tài liệu,
quyền khai thác, quy trình consent/lưu trữ và kiểm chứng kết quả nhà cung cấp;
cần xác nhận riêng liveness của dịch vụ được cấp. Không suy đoán API hoặc giá.
Nguồn đối chiếu ở bước khảo sát trước: [cổng RAR](https://congxacthucdientuquocgia.gov.vn/vi)
và [mục tài liệu](https://congxacthucdientuquocgia.gov.vn/vi/document).

Luồng rời nhà vẫn giữ lịch sử thành viên/công nợ, không kiểm tra số dư nợ ngay
trong `HouseMembershipsService.leave()`. Không có thay đổi chính sách công nợ
trong tính năng khai báo demo. CCCD hoặc nhãn demo không ngăn người dùng rời
chỗ ở ngoài đời và không chứng minh khả năng trả nợ.
