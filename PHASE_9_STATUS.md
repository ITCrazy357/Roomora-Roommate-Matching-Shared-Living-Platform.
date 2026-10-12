# Phase 9 · Dịch vụ trả phí và chứng từ

Ngày 11/10/2026. Đã triển khai database, API và giao diện cho một dịch vụ đẩy tin
7 ngày, giá thử nghiệm 49.000đ theo design-reference. Giữ theme cam đỏ/kem,
component chung và service chia theo nghiệp vụ.

## Đã triển khai

- Trang `/dich-vu`: gói, chọn tin của mình, quyền lợi đã mua, lịch sử, hoàn tiền.
- MoMo sandbox `captureWallet`, kiểm tra chữ ký phản hồi, cache payUrl và chống checkout đồng thời.
- IPN HMAC-SHA256; kiểm tra merchant, số tiền, đơn, mã giao dịch; xử lý trùng trong transaction.
- Cấp boost đúng một lần mỗi tin/đợt đăng; hết hạn tại thời điểm đọc. Không mua thêm trong cùng đợt.
- Tin tài trợ được ưu tiên trong danh sách `newest`, giữ bộ lọc/phân trang và thứ tự theo giá.
- Xử lý thất bại, kết quả đến chậm sau EXPIRED/FAILED; tin không đủ điều kiện tạo yêu cầu hoàn tiền.
- Lưu lịch sử thanh toán/sự kiện và thông báo trong ứng dụng.
- Tiếp nhận một yêu cầu hoàn tiền mỗi đơn, hiển thị chờ kiểm tra.
- Biên nhận PDF tiếng Việt từ snapshot đơn, phân quyền chủ đơn, độc lập quyết toán nhà chung.

## Kiểm chứng

- PostgreSQL local: migration `20261011200000_service_billing` đã deploy.
- 40 kiểm thử Phase 9 ban đầu cùng 201 hồi quy: toàn bộ 241 kiểm thử E2E qua.
- Bổ sung kiểm thử UUID sai, thanh toán đến khi tài khoản khóa và failure callback ký lại;
  43 kiểm thử Phase 9 và 13 kiểm thử listings đều qua sau các thay đổi cuối (56/56).
- 69 unit test qua. Backend/frontend build qua; frontend TypeScript và ESLint qua.
- Backend lint không lỗi; còn 5 warning `sort` đã có trong các test chi phí/chat.
- TypeScript build của backend qua. Kiểm tra `tsc --noEmit` toàn bộ test gặp lỗi
  đã có tại `test/auth-otp.e2e-spec.ts:31` (body `unknown` truyền cho Supertest `.send`),
  không sửa test ngoài phạm vi. Test OTP runtime trong bộ 241 vẫn qua.
- Edge kiểm tra đăng nhập/quyền guest, chọn tin/mua gói, return giả mạo,
  chờ IPN → PAID, tải PDF, yêu cầu hoàn tiền, quyền lợi, nhãn tài trợ và trạng thái chưa cấu hình.
- 320/390/768/1366/1920px: các màn được kiểm tra không tràn ngang toàn trang; không có lỗi JavaScript.
- PDF tải từ nút trên trình duyệt đã đọc nội dung: đủ tiếng Việt, tên người mua, gói,
  49.000đ, và nhãn phân biệt với hóa đơn điện tử.

Artifact local (không đưa vào Git): `.verification/phase9-browser-report.json`,
`.verification/phase9-*.png`, `.verification/phase9-downloads/*.pdf`.
Dữ liệu tài khoản/tin/đơn thử nghiệm được dọn sau khi chạy.

## Phần còn thiếu để nghiệm thu toàn bộ phase

Người dùng chưa có thông tin merchant MoMo sandbox. Checkout/IPN trong kiểm thử MoMo
là **mô phỏng gateway và callback ký số**, không phải thanh toán qua MoMo sandbox thật.
MoMo vẫn chưa khả dụng. Cần điền bốn biến MOMO trong `.env`, có IPN HTTPS công khai
rồi kiểm chứng giao dịch MoMo sandbox. PayOS được bổ sung để dùng trong lúc chờ xác thực.

Yêu cầu hoàn tiền mới được tiếp nhận/lưu; chưa có admin xử lý và chưa gọi API hoàn tiền
MoMo. Không coi yêu cầu là tiền đã hoàn, không có trạng thái REFUNDED hoặc tự thu hồi gói.
Tích hợp hóa đơn điện tử và MoMo production chưa triển khai. PayOS sử dụng API production;
giao dịch kiểm thử qua cổng này là tiền thật.
Không đánh dấu Phase 9 hoàn thành toàn bộ khi chưa có kiểm chứng merchant và quy trình hoàn tiền.

Chi tiết nghiệp vụ, API, cấu hình và spec:
[billing/README.md](backend/src/modules/billing/README.md).

## Bổ sung PayOS

- Giữ giá 49.000đ và quyền lợi 7 ngày theo lựa chọn người dùng.
- Đơn lưu provider, orderCode và paymentLinkId; retry/checkout giữ cổng và mã đã tạo.
- Xác thực chữ ký create/GET/webhook PayOS, kiểm tra số tiền/mã đơn/VND/link/reference.
- Dùng chung transaction cấp gói một lần, nhận thanh toán muộn, hoàn tiền và biên nhận.
- PayOS không có sandbox; giao diện/PDF ghi rõ thanh toán bằng tiền thật.
- Đã deploy migration `20261011210000_payos_billing` lên PostgreSQL local.
- `.env` đã có đủ ba khóa PayOS; chọn `BILLING_PAYMENT_PROVIDER=PAYOS`.
- API local cổng 5000 xác nhận provider PAYOS, sandbox false, paymentAvailable true, giá 49.000đ.
- Kiểm tra read-only API merchant với mã đơn không tồn tại trả HTTP 200/code 101;
  đây không phải kiểm chứng tạo link/chuyển tiền/webhook thật.
- Chưa có tunnel HTTPS được xác nhận; chưa thực hiện giao dịch chuyển tiền PayOS thật.
- 60 kiểm thử billing (43 MoMo/nghiệp vụ + 17 PayOS) qua. Chạy toàn bộ E2E tuần tự:
  261/261 qua. Lần chạy song song trước đó có 8 lỗi timeout/dọn fixture ở các bộ test khác;
  không sửa nghiệp vụ hay test ngoài Phase 9 để che các lỗi đó.
- 76 unit test qua, gồm vector chữ ký webhook chính thức của PayOS và cấu hình cổng.
- Backend/frontend build, frontend TypeScript/ESLint và lint các file backend thay đổi qua.
- Edge dùng mock gateway PayOS + webhook ký số, API và PostgreSQL thật: chọn tin,
  redirect giả không cấp gói, webhook lặp cấp một lần, PDF ghi 49.000đ/PayOS/tiền thật,
  yêu cầu hoàn tiền, tin tài trợ và thiếu credentials. Responsive 320/390/768/1366/1920px
  không tràn ngang, không có lỗi JavaScript. Fixture browser được dọn sau khi chạy.

Artifact local: `.verification/phase9-payos-browser-report.json`,
`.verification/phase9-payos-*.png`, `.verification/phase9-payos-downloads/*.pdf`.

Webhook cần đăng ký trên kênh thanh toán PayOS:
`https://<backend-public>/api/v1/services/payos/webhook`.

### Sửa lỗi xác minh URL webhook

Request kiểm tra thực tế của PayOS trong ngrok có chữ ký đúng nhưng không gửi
trường `success` ngoài `data`. Backend trước đó bắt buộc trường này nên trả 400
`PAYMENT_NOTIFICATION_INVALID`. Đã cho phép trường này vắng mặt; vẫn xác thực
chữ ký và dữ liệu thanh toán. Hai test bổ sung kiểm tra mẫu setup và thanh toán
không có `success`, callback giả và lặp; 62/62 test billing qua, build/lint qua.
Đã khởi động lại backend cổng 5000 và phát lại đúng mẫu PayOS qua URL ngrok đang
chạy: HTTP 200, `{ "code": "00", "desc": "success" }`. Đây là kiểm chứng nhận mẫu
webhook qua HTTPS, chưa phải giao dịch chuyển khoản thật hoặc xác nhận kênh đã lưu URL.

## Sửa nghiệp vụ tin đăng và UI địa điểm — 12/10/2026

- Một thanh toán thành công mỗi tin/đợt đăng, kể cả gói hết hạn. Sửa/duyệt lại
  giữ đợt; đóng tin kết thúc đợt/đơn chờ/boost, đăng lại dùng đợt mới.
- Khóa user → listing → order, partial unique index một PENDING mỗi tin/đợt,
  kiểm tra lại checkout trước/sau gateway. Callback muộn/trùng ghi tiền thực
  nhận và yêu cầu đối soát hoàn tiền, không cấp thêm boost.
- Hai migration posting_round/closed_listing_round đã deploy PostgreSQL local.
- Tìm phòng không có map/ngày dọn vào/địa chỉ riêng; tìm người ghép có thể chưa
  có phòng; cho thuê giữ validation phòng thực tế. Form/API/chi tiết cùng quy tắc.
- Bản đồ Leaflet/Geoapify có mở rộng, tìm kiếm, zoom, định vị và nhập thủ công
  khi lỗi. Geoapify thật trả tile và tìm kiếm trong browser; khóa chuyển về backend.
- Combobox tỉnh/phường có tìm không dấu, keyboard, giữ lựa chọn/payload hồ sơ.
- Lượt cuối: 277/277 E2E trong 20 file qua, 80 unit backend qua, 8 test API
  frontend qua. Build TypeScript backend và production frontend qua; ESLint
  frontend/lint file backend thay đổi không lỗi. Lint toàn bộ backend vẫn có
  năm warning sort đã có trong các test khác.
- Edge + API/PostgreSQL thật: tám nhóm kiểm tra qua, 320/390/768/1366px không
  tràn ngang, không lỗi JavaScript. Thanh toán dùng webhook ký HMAC giả lập;
  không tự tạo giao dịch merchant/chuyển tiền thật. 40 chunk production không
  chứa khóa Geoapify local; backend 5000 healthy, map available, giá giữ 49.000đ.

Chi tiết file, nghiệp vụ, kiểm thử và cấu hình:
`docs/listing-payment-map-update.md`, `docs/maps-setup.md`.
Artifact: `.verification/listing-payment-map-browser-report.json`,
`.verification/request-*.png`. Fixture đã được dọn; giữ lịch sử thanh toán có sẵn.

## Hoàn thiện hoàn tiền dịch vụ — 12/10/2026

- USER gửi trong 24h từ paidAt; đúng 24h hợp lệ, vượt 1ms bị từ chối. ADMIN
  xét thời điểm gửi, không tự từ chối yêu cầu đúng hạn khi xử lý sau 24h.
- Có state machine duyệt/từ chối/xác minh recipient/process/complete/failure/retry,
  audit và chứng từ riêng tư. APPROVED/PROCESSING không được gọi là đã hoàn tiền.
- PayOS chuyển khoản thủ công có kiểm tra gốc, xác minh bổ sung khi khác tài khoản,
  proof/mã/số tiền/giờ/xác nhận thực tế. MoMo sandbox có refund/query với mã cố định,
  kiểm tra khoản hoàn trên giao dịch gốc, timeout giữ PROCESSING để đối soát.
- Unique references, version và row lock chống hoàn trùng; lỗi audit rollback.
  COMPLETED ghi refundedAt và chỉ dừng boost của đơn/đợt đã hoàn, giữ PAID và lịch sử.
- Migration service_refund_workflow đã deploy; không xóa yêu cầu/lịch sử cũ.
- 298/298 E2E trong 21 file qua; 89/89 billing/refund qua sau bank prefill/server clock;
  90 unit và 8 test API frontend qua. Build backend/frontend qua; lint file thay đổi
  không lỗi. Browser sáu nhóm qua ở 320–1366px, không tràn ngang/lỗi JavaScript.
- Không tạo giao dịch tiền thật; provider/bank/proof trong kiểm thử được mô phỏng.
  MoMo thật cần merchant sandbox; PayOS hiện cần ADMIN chuyển khoản/đối soát ngoài app.

Xem `docs/service-refunds-status.md` cho file, API, migration, giới hạn và cách xử lý.
Artifact: `.verification/refunds-browser-report.json`, `.verification/refund-*.png`.

## Hủy PayOS và đăng ký lại tin chưa thanh toán — 12/10/2026

- Bổ sung CANCELLED và migration `20261012160000_service_order_cancelled`, đã
  deploy lên PostgreSQL local. Đơn hủy được giữ trong lịch sử cùng mã cổng ban đầu.
- Backend xác thực trạng thái bằng GET PayOS trước khi dùng lại link hoặc tạo
  đơn thay thế. Không suy ra hủy/thành công từ query URL. PENDING còn hiệu lực
  dùng link cũ; CANCELLED/EXPIRED chưa nhận tiền có thể tạo đơn/orderCode mới.
- Tin chỉ bị chặn mua lại khi đã PAID trong cùng postingRound. Khóa user/listing
  và unique PENDING chống tạo nhiều đơn mới khi bấm đồng thời. Callback đến muộn
  vẫn được ghi nhận, không cấp lần hai nếu đơn thay thế đã PAID.
- Có POST `/services/orders/:id/sync` cho chủ đơn. Trang kết quả đồng bộ và dẫn
  về gói; lịch sử có Tạo thanh toán mới cho tin đủ điều kiện. PAID/PROCESSING/
  đã nhận tiền một phần chờ xác nhận, lỗi kiểm tra trạng thái không tạo thêm đơn.
- 88/88 billing và 22/22 refund E2E HTTP/PostgreSQL qua; gồm chữ ký/dữ liệu giả,
  partial money, expiry local, recovery timeout, race callback/hủy và late duplicate.
  Backend TypeScript, frontend TypeScript và lint file thay đổi qua.
- Edge + API fixture/PostgreSQL: năm nhóm qua gồm phát hiện link hủy khi resume,
  trang kết quả, tạo lại từ lịch sử, từ tab gói, và khóa tin đã thanh toán.
  320/390/768/1366px không tràn ngang; không lỗi JavaScript. Gateway và chuyển tiền
  trong kiểm thử đều mô phỏng, không gọi tạo link merchant hoặc chuyển tiền thật.
  Artifact: `.verification/payos-cancel-browser-report.json`.

## Khôi phục thanh toán thiếu webhook — 13/10/2026

- Lỗi trước: đối soát thấy provider đã nhận tiền nhưng chỉ trả trạng thái đang
  xử lý, chưa ghi PAID/cấp boost; lịch sử GET chỉ đọc DB nên vẫn có nút trả tiền.
- Đọc PayOS thật xác nhận đơn `4b87eccf…` đã thu đủ 49.000đ, chữ ký/link/orderCode
  khớp và một giao dịch ngân hàng hợp lệ; DB trước sửa EXPIRED, không có event/boost.
- Sửa query PAID đủ tiền và mã giao dịch đi qua cùng transaction xử lý webhook.
  Giữ uniqueness, row locks, kiểm tra đợt/tin, hoàn SYSTEM khi không thể cấp gói.
  Không dùng query URL hoặc kết quả thiếu reference/sai số tiền để kích hoạt.
- Chi tiết, lịch sử và trang kết quả đối soát; pending/partial/unknown hiển thị
  kiểm tra trạng thái, không tiếp tục thu tiền. UI khóa tin ngay theo đơn PAID
  vừa đối soát, kể cả danh sách tin được tải song song trước khi transaction commit.
- Kiểm tra nền tùy chọn `BILLING_RECONCILE_ENABLED=true`, mặc định false; tối đa
  10 đơn/lượt, 3 request đồng thời, giữ watcher độc lập với mạng trong transaction.
- 120/120 E2E billing/refund HTTP/PostgreSQL qua. Query và webhook đồng thời/lặp
  không gia hạn boost, không thêm thông báo; partial/missing ref/multiple tx không cấp gói.
- TypeScript backend/frontend và lint file thay đổi qua. Edge dữ liệu mô phỏng:
  mất webhook nhưng GET lịch sử cấp gói đúng một lần; late callback không cấp thêm;
  partial/bad signature không có CTA thu thêm; 320/390/768/1366px không tràn ngang,
  không lỗi JavaScript. Artifact `.verification/payos-recovery-browser-report.json`.
- Kiểm chứng live chỉ đọc cuối: đơn thật đã PAID, có một event khớp chữ ký GET
  PayOS và một boost, listing PUBLISHED/boostUntil khớp. Thời hạn đến
  00:32:26 ngày 20/10/2026 (UTC+7). Không tạo giao dịch hoặc chuyển tiền mới.
- Script khôi phục thủ công bị automatic approval review từ chối, chưa chạy.
  Đơn đã được đối soát trong ứng dụng trước thao tác bị từ chối; không thực hiện
  một đường vòng sau từ chối. Xác nhận kết quả bằng DB và API GET ở chế độ chỉ đọc.
