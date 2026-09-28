# Phase 5 — Nhắn tin, lịch xem phòng và thông báo

Triển khai ngày 28/09/2026 theo `backend/room.todo`, giữ PrismaModule,
PrismaService, opaque HttpOnly session, AuthGuard, OriginGuard và API client hiện có.
Không thêm dependency. Giao diện tham chiếu ba mẫu hộp thư, lịch xem phòng và
trung tâm thông báo trong `design-reference`; dùng theme cam đỏ/kem chung.

## Màn hình

| Đường dẫn | Chức năng |
| --- | --- |
| `/tin-nhan` | Hộp thư, phân trang hội thoại, lọc tên/chưa đọc trong trang hiện tại |
| `/tin-nhan/[id]` | Nhắn tin, tải lịch sử, tin phòng, bản đồ khu vực và lịch hẹn của hai người |
| `/lich-xem-phong` | Danh sách bên trái, chi tiết bên phải; lọc tất cả/sắp tới/chờ phản hồi/đã kết thúc và phân trang trên server |
| `/thong-bao` | Lọc loại/tất cả/chưa đọc, phân trang, đánh dấu từng thông báo hoặc tất cả đã đọc |

Thanh điều hướng có Tin nhắn và chuông thông báo với số chưa đọc. Menu tài khoản
có Lịch xem phòng. Hồ sơ đã kết nối có liên kết mở hộp thư. Menu thu gọn dưới
1200px; hộp thư chuyển từ ba cột sang hai cột rồi một cột trên điện thoại.
Các trạng thái tải, trống, lỗi, kết nối lại và thao tác đang xử lý có phản hồi rõ ràng.

## Quy tắc dữ liệu

- Một hội thoại cho mỗi cặp kết nối. Chấp nhận lời mời tạo hội thoại trong cùng
  transaction; migration tạo hội thoại cho các kết nối đã được chấp nhận trước đó.
- Chỉ hai người có kết nối `ACCEPTED`, không chặn nhau, mới đọc/gửi tin hoặc
  truy cập lịch. Kiểm tra quyền cho từng request; hồ sơ riêng tư được che tên/ảnh.
  Không trả email hoặc địa chỉ riêng trong dữ liệu hội thoại.
- Tin nhắn tối đa 2.000 ký tự, bỏ khoảng trắng đầu/cuối; tối đa 30 tin/người/phút.
  `clientId` duy nhất cho người gửi trong hội thoại chống trùng khi gửi lại sau
  mất phản hồi. Gửi cùng ID với nội dung khác bị từ chối.
- Mỗi hội thoại có số thứ tự tăng dần. Tải 40 tin/request: `before` để tải cũ,
  `after` để bắt kịp tin mới. Không dùng timestamp làm cursor, tránh bỏ sót các tin
  có cùng thời gian. Ghép kết quả theo số thứ tự để không hiển thị trùng.
- Số đã đọc chỉ tăng và không vượt tin cuối. Chỉ đánh dấu những tin đã tải khi
  trang hội thoại đang hiển thị. Số chưa đọc tin nhắn và thông báo là hai trạng
  thái riêng: đọc thông báo không tự xác nhận lịch hoặc đánh dấu tin nhắn đã đọc.
- Hai người đã kết nối có thể đề xuất lịch gặp mà không cần tin phòng. Nếu hẹn xem
  phòng, lịch chỉ gắn với tin `PUBLISHED` của một trong hai người; người ngoài
  không thể gắn tin của mình vào hội thoại. Hai bên tự nhập điểm gặp riêng,
  không lấy địa chỉ riêng từ tin đăng.
- Bản đồ khu vực của tin `PUBLISHED` được xem công khai trên trang tin, hồ sơ
  người đăng và trong hội thoại của hai người. Tọa độ được làm tròn đến khoảng 1 km khi lưu; địa chỉ
  riêng không được trả về cho người xem, kể cả sau khi xác nhận lịch.
- Giờ hẹn phải trong tương lai, tối đa 180 ngày; tối đa 10 đề xuất/hội thoại/24 giờ.
  Form dùng giờ Việt Nam, API yêu cầu timezone rõ ràng, database lưu timestamp UTC.
- Người còn lại xác nhận đề xuất. Đổi giờ hoặc địa điểm trở thành đề xuất mới
  `PENDING`, cần người còn lại xác nhận lại. Phiên bản ngăn xử lý hai phản hồi
  cũ đồng thời. Lịch đã hủy không được khôi phục bằng thao tác xác nhận.
- Lịch có lịch sử từng phiên bản chỉ cho hai người xem. Có xuất `.ics` cho lịch
  đã xác nhận, hỗ trợ nhập vào ứng dụng lịch; chưa tích hợp đồng bộ Google Calendar.
- Chặn hủy các lịch còn hoạt động, lưu lịch sử và thu hồi quyền hội thoại.
  Bỏ chặn không khôi phục kết nối. Nếu hai người gửi lại/chấp nhận kết nối,
  giữ lịch sử tin và chuyển đúng số đã đọc khi chiều gửi lời mời thay đổi.

Các thay đổi tin/lịch dùng cùng thứ tự khóa hai hàng người dùng như Phase 4,
kiểm tra quyền lại sau khi khóa để tránh gửi/đổi lịch đồng thời với chặn.
Khóa tin phòng khi đề xuất/xác nhận lịch xem ngăn tin bị đóng giữa bước kiểm tra và ghi lịch.
Truy vấn số chưa đọc dùng một aggregate; không truy vấn riêng cho mỗi thẻ.
Có unique constraint và index cho cursor, giới hạn gửi, lịch và thông báo.

## Cập nhật thời gian thực và email

API `GET /api/v1/updates` dùng [SSE của NestJS](https://docs.nestjs.com/techniques/server-sent-events).
Một kết nối SSE dùng chung cho mỗi tab. Thay đổi được báo qua
[PostgreSQL LISTEN/NOTIFY](https://www.postgresql.org/docs/17/sql-notify.html)
sau khi transaction commit; không truyền nội dung tin nhắn qua tín hiệu.
Client tải dữ liệu qua API được xác thực; SSE kiểm tra phiên trước mỗi tín hiệu.
Có đồng bộ định kỳ 20 giây, tự nối lại listener/database và EventSource,
đồng bộ khi tab hiện lại, hủy request cũ khi đổi trang/bộ lọc.
Khi bị chặn, dữ liệu hội thoại đang mở được gỡ khỏi giao diện ở lần cập nhật kế tiếp.

Thông báo được lưu cùng transaction với lời mời, chấp nhận kết nối, tin mới và
thay đổi lịch. Email cần thiết: chấp nhận kết nối và đề xuất/xác nhận/đổi/hủy lịch;
tin nhắn mới chỉ thông báo trong ứng dụng.

Hàng đợi email nằm trong bản ghi thông báo, sống qua lần khởi động lại API.
Worker lấy tối đa 5 email mỗi lượt, khóa `SKIP LOCKED`, giữ quyền xử lý 5 phút,
thử lại sau 5 phút, tối đa 5 lần. Chỉ ghi đã gửi sau khi SMTP chấp nhận.
MailService có timeout kết nối/chào SMTP 10 giây và socket 30 giây.
Lỗi SMTP không làm mất tin nhắn hoặc lịch đã lưu. Email có thể bị gửi lại nếu
SMTP đã nhận nhưng tiến trình dừng trước khi ghi trạng thái; đây là cơ chế gửi
ít nhất một lần, không bảo đảm email đúng một lần.
Không bật worker trong môi trường `test`; khi thiếu SMTP giữ email trong database.
Các bản ghi hết số lần thử vẫn giữ để kiểm tra, chưa có màn hình quản trị retry.

Dùng lại `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`,
`MAIL_FROM` và `FRONTEND_ORIGIN`; không cần biến môi trường hoặc dịch vụ mới.
Nếu đặt reverse proxy trước API, cần tắt buffering cho `/api/v1/updates` và
đặt timeout lớn hơn nhịp đồng bộ 20 giây.

## Triển khai

Migration bổ sung `20260928110000_phase_5_communications` đã áp dụng trên
PostgreSQL local bằng `prisma migrate deploy`, không reset dữ liệu.

Trong `backend`:

```powershell
npm run prisma:migrate:deploy
npm run build
npm run start:prod
```

Trong `frontend`: `npm run dev`, hoặc `npm run build` rồi `npm run start`.
Server backend chạy từ `dist/main.js` cần khởi động lại để nạp API mới.
Giữ API mặc định `http://localhost:5000/api/v1` và frontend `http://localhost:3000`.

## Kiểm chứng

- Backend build/lint thành công; 52 unit test, gồm 3 test gửi email thành công,
  thất bại và ngăn worker chạy chồng trên một instance.
- Toàn bộ 52 E2E test PostgreSQL đã qua khi chạy `node node_modules/vitest/vitest.mjs run --config ./vitest.config.e2e.ts --no-file-parallelism` trong `backend`.
  Chạy từng file để tránh tranh tài nguyên với build frontend; các tình huống
  gửi/chấp nhận/đổi lịch đồng thời vẫn được kiểm tra bằng request song song trong test.
  Bộ Phase 5 có 16 test cho xác thực/Origin/quyền, chống trùng đồng thời,
  số chưa đọc, SSE thật, cursor tải lịch sử, giới hạn gửi, lịch/timezone/quyền tin,
  đổi lịch/phiên bản đồng thời, thông báo riêng tư, giới hạn đề xuất, chặn và
  kết nối lại theo chiều gửi ngược.
- Frontend lint, TypeScript, production build và 8 test API client qua.
- Chrome dùng production frontend/API và PostgreSQL thật: hai tài khoản gửi/nhận
  tin tự cập nhật; tải lại giữ lịch sử; mất mạng/kết nối lại lấy đủ tin bỏ lỡ;
  mất phản hồi sau khi server đã lưu vẫn giữ bản nháp và gửi lại không trùng;
  gửi/xác nhận/đổi/xác nhận lại/hủy lịch; 15:00 Việt Nam được lưu đúng 08:00 UTC;
  xuất `.ics`; lọc và đánh dấu thông báo; tải 40 tin rồi tin cũ không trùng.
- Kiểm tra khách, người ngoài và chặn khi hội thoại đang mở; kiểm tra bố cục
  1440/768/320px, không tràn ngang và không có lỗi JavaScript.
- Kiểm thử production dùng cổng riêng 3002/5002 để không chiếm server đang dùng.
  Tắt SMTP trong API kiểm thử; dữ liệu tài khoản/tin phòng/hội thoại/lịch/thông báo
  kiểm thử được dọn qua cascade. Ảnh/report lưu `.verification/phase5-*` được Git bỏ qua.
- Đã dọn server kiểm thử, build lại với API mặc định và nạp lại backend trên 5000.

## Bổ sung lịch gặp và bản đồ khu vực

- Nút đề xuất luôn mở form sau khi hai người kết nối. Không có tin phòng thì đề xuất
  lịch gặp; nếu chọn tin công khai của một trong hai người thì đó là lịch xem phòng.
  `listing_id` được phép rỗng và lịch gặp vẫn cần bên kia xác nhận.
- Hồ sơ công khai, trang tin và hội thoại hiển thị bản đồ khu vực của tin `PUBLISHED`.
  API chỉ trả tọa độ làm tròn; địa chỉ riêng không xuất hiện trong phản hồi.
- 52 E2E PostgreSQL, backend/frontend build và lint đã qua. Chrome kiểm tra khách
  chưa đăng nhập và hai tài khoản, xác nhận lịch không gắn tin, hiển thị ghim ở
  hồ sơ/hội thoại, bố cục 320px và không có lỗi JavaScript. Mạng thử nghiệm chặn
  tile Geoapify (`ERR_NETWORK_ACCESS_DENIED`), nên kiểm tra phần hiển thị bản đồ
  dùng tile giả cục bộ; chưa xác nhận ảnh tile thật từ dịch vụ ngoài.
  Chrome xác nhận ba trang mới trên frontend 3000, trạng thái khách, API đúng cổng,
  CORS và không có lỗi JavaScript. Không còn tài khoản kiểm thử Phase 5 trong database.

Chưa kiểm chứng nhận email thật qua SMTP, tải nhiều người dùng hoặc triển khai
production công khai. Gọi thoại/video, gửi file tùy ý và nghiệp vụ nhà chung
nằm ngoài phạm vi.

## Bổ sung trải nghiệm nhập tin

Người nhận thấy bong bóng ba chấm chuyển động khi bên kia đang gõ. Tín hiệu đi qua
SSE hiện có và chỉ tới người còn lại trong hội thoại; không tạo tin nhắn hoặc thông
báo trong database. Khi ngừng gõ, rời ô nhập hoặc gửi tin, trạng thái tắt; phía nhận
tự xóa sau 4 giây nếu bỏ lỡ tín hiệu dừng. Hiệu ứng tôn trọng cài đặt giảm chuyển
động của hệ điều hành.

Trong ô nhập, Enter gửi tin, Shift + Enter xuống dòng. Kiểm tra Chrome với hai tài
khoản trên API/PostgreSQL thật đã xác nhận cả hai thao tác, giao diện 1440px/320px,
không tràn ngang hoặc có lỗi JavaScript. Backend build/lint, 52 unit test, 51 E2E
test và frontend lint/build, 8 API test đều qua sau thay đổi này.

## Bổ sung ảnh và ghi âm trong chat

Khung chat tự bám cuối khi người xem đang ở gần tin mới nhất, nên dấu ba chấm không
bị khuất khi xuất hiện. Nếu người xem kéo lên đọc tin cũ, khung giữ nguyên vị trí.
Thanh nhập theo kiểu nhắn tin gọn: chọn tối đa 4 ảnh, xem và bỏ ảnh trước khi gửi,
mở ảnh đã gửi ở kích thước lớn; ghi âm tối đa 60 giây, nghe lại trước khi gửi và
phát lại trong hội thoại. Tin chỉ có ảnh hoặc ghi âm cũng gửi được. Enter/Shift +
Enter vẫn hoạt động như trên.

Migration `20260928180000_chat_media` và `20260928181000_allow_media_only_messages`
đã áp dụng trên PostgreSQL local bằng `prisma migrate deploy`, không reset dữ liệu.
Ảnh JPG/PNG/WebP được giải mã, thu nhỏ, đổi thành JPEG và bỏ metadata. Tệp ghi âm
chỉ nhận WebM/MP4/Ogg, tối đa 2 MB; tổng dữ liệu media sau xử lý tối đa 5 MB/tin.
Ảnh và âm thanh lưu trong PostgreSQL; API chỉ trả byte sau khi xác thực và kiểm tra
quyền hội thoại, không có URL Cloudinary công khai. Cách này phù hợp quy mô MVP,
cần chuyển sang kho tệp riêng có kiểm soát truy cập nếu dung lượng chat tăng lớn.

Kiểm thử E2E xác nhận gửi nhiều ảnh, gửi ghi âm, gửi lại không tạo tin trùng, trả
tệp đúng cho thành viên và từ chối người ngoài/người đã chặn. Chrome với hai tài
khoản thật xác nhận xem trước/bỏ ảnh, mở ảnh, ghi âm bằng luồng âm thanh mô phỏng,
phát lại tệp WebM thật, tự cuộn khi có dấu đang nhập, bố cục 1440px/320px và không
có lỗi JavaScript. Quyền micro của môi trường kiểm thử bị từ chối nên chưa kiểm
chứng với micro vật lý; giao diện hiển thị lỗi rõ khi trình duyệt từ chối quyền.

## Chẩn đoán micro khi quyền trang đã cấp

Trên Chrome kiểm thử tại `http://localhost:3000`, Permissions API báo `granted` và
trình duyệt thấy một thiết bị đầu vào, nhưng `getUserMedia({ audio: true })` vẫn trả
`NotAllowedError: Permission denied`. Lỗi này xảy ra trước khi tạo MediaRecorder;
không thể sửa bằng cách đổi codec hay gửi API. Ứng dụng hiện phân biệt lỗi quyền,
không tìm thấy micro, thiết bị đang không khả dụng và lỗi khởi động bộ ghi âm. Nếu
trình duyệt từ chối micro, người dùng có thể chọn một tệp ghi âm WebM/MP4/Ogg có
sẵn (tối đa 2 MB) để gửi. Đã kiểm tra Chrome cả nhánh ghi âm MediaRecorder bằng
âm thanh mô phỏng và nhánh bị từ chối rồi chọn tệp có sẵn. Chưa xác định được vì
sao micro vật lý bị từ chối trong trình duyệt của người dùng; cần kiểm tra thêm
quyền ứng dụng trình duyệt trong hệ điều hành và thiết bị đầu vào đang chọn.
