# Phase 9 · Dịch vụ Roomora

Một gói thử nghiệm: **Đẩy tin 7 ngày, 49.000đ**. Giá lấy từ mẫu giao diện,
chưa phải bảng giá kinh doanh được phê duyệt. Hỗ trợ MoMo sandbox và PayOS;
PayOS không có sandbox riêng, giao dịch thử qua PayOS dùng tiền thật.
không có ví, giữ tiền thuê hoặc liên quan đến công nợ nhà chung.

## Các service

- `ServiceOrdersService`: catalog, chọn tin, tạo đơn, lịch sử và checkout.
- `MomoGatewayService`: gọi `captureWallet`, kiểm tra chữ ký phản hồi và IPN.
- `PayosGatewayService`: tạo/khôi phục link theo orderCode, kiểm tra chữ ký phản hồi/webhook.
- `PaymentGatewayService`: chọn cổng cho đơn mới; checkout dùng cổng đã lưu trên từng đơn.
- `ServicePaymentsService`: ghi nhận kết quả, cấp quyền lợi, tiếp nhận hoàn tiền.
- `ServiceReceiptsService`: PDF tiếng Việt từ snapshot lúc tạo đơn.
- `BillingSchedulerService`: cập nhật đơn chờ hết hạn; hiệu lực đẩy tin được kiểm tra trực tiếp khi đọc.

## Quy tắc

Chỉ USER mua cho tin của mình đang PUBLISHED và chưa đánh dấu đủ. Cả ba loại
ROOMMATE, ROOM_RENTAL và ROOM_WANTED đều có thể dùng gói. ADMIN không mua gói.
Giá/thời hạn do máy chủ quyết định, không nhận số tiền hoặc trạng thái từ client.
Đơn giữ snapshot tên người mua, email, tiêu đề tin, tên gói, giá và thời hạn.

`clientId` duy nhất theo người mua. Gửi lại trả về đơn cũ; đổi tin cùng clientId
bị từ chối. Các yêu cầu khác clientId cho cùng tin vẫn dùng đơn đang chờ hiện tại.
Đơn chờ 15 phút; không tạo lại đơn khi gateway timeout. Retry checkout dùng lại
orderId/requestId, lease 45 giây chống gọi gateway đồng thời và lưu payUrl để dùng lại.

Mỗi tin chỉ thanh toán thành công một lần trong cùng `postingRound`, kể cả gói
đã hết hạn. Đơn lưu snapshot số đợt. Sửa nội dung hoặc duyệt lại không đổi đợt;
đóng tin kết thúc đợt/boost, tăng số đợt và hết hạn các đơn đang chờ. Khi đăng lại,
đợt mới có thể thanh toán. API trả `LISTING_ALREADY_PAID` (409) khi tạo đơn mới
cho đợt đã trả tiền. `paymentCompleted` ở tin riêng và danh sách dịch vụ phản ánh
đơn PAID của đợt hiện tại, không suy ra từ thời hạn boost. PENDING/FAILED không tính đã trả tiền.
Unique index PostgreSQL `service_orders_one_pending_per_round` chỉ cho một đơn
PENDING theo tin/đợt, bất kể cổng thanh toán. Chuyển cổng không tạo liên kết chờ thứ hai.

Gateway `create` thành công chỉ tạo liên kết thanh toán, không cấp gói.
Trang `/dich-vu/ket-qua` chỉ đọc đơn của người đăng nhập: mọi resultCode từ URL
quay về đều không được dùng để cập nhật thanh toán.

IPN xác thực HMAC-SHA256 bằng so sánh constant time, kiểm tra merchant, amount,
orderId/requestId, orderInfo, kiểu dữ liệu, thời gian và transId. Chỉ resultCode
**0** cấp quyền lợi; 1000/7000/7002/9000 tiếp tục chờ, chưa coi là đã thu tiền.
IPN hợp lệ trả HTTP 204 sau khi transaction đã commit.
Chỉ handler IPN được miễn kiểm tra Origin; các thao tác người dùng vẫn có AuthGuard
và OriginGuard. IPN không dựa vào cookie hoặc một secret trong query URL.

Khóa theo thứ tự user → listing → order; update trạng thái, tạo boost và thông báo
trong cùng transaction. Mỗi đơn có tối đa một boost, mỗi transId thành công chỉ
thuộc một đơn trong cùng cổng. Lưu event đã xác thực theo chữ ký để chống xử lý lại. IPN thành công
gửi lặp với thời gian mới không nối thêm gói. Thất bại đến sau không hạ trạng thái PAID.

Đơn FAILED hoặc EXPIRED vẫn tiếp nhận thành công đến chậm. Nếu tin còn đủ điều kiện,
cấp đủ 7 × 24 giờ từ lúc xử lý nếu đợt chưa thanh toán.
Nếu tin đóng/chờ duyệt/đã đủ hoặc chủ tài khoản bị khóa, lưu PAID và tạo yêu cầu
hoàn tiền; không cấp boost. Không dùng responseTime như thời điểm bắt đầu gói.
Nếu một liên kết cũ nhận tiền sau giao dịch khác đã thành công trong cùng đợt,
vẫn ghi nhận khoản tiền PAID và tạo yêu cầu hoàn tiền; không cấp quyền lợi lần hai.
Thanh toán thuộc đợt đã đóng không cấp boost cho đợt đăng mới.

Danh sách public theo `newest` lấy tin có `boostUntil > now` và chưa đủ trước,
giữ nguyên bộ lọc, thứ tự thời gian và phân trang trong snapshot RepeatableRead.
Giá tăng/giảm và danh sách tin đã lưu giữ quy tắc sắp xếp hiện có. Các thẻ/chi tiết
có nhãn “Được tài trợ”. Chỉ ưu tiên tin đang công khai, chủ tài khoản không bị khóa.
Hiệu lực hết ngay khi đọc, dù scheduler dừng. Sửa tin không dừng đồng hồ;
khi duyệt lại trong cùng đợt chỉ hưởng thời gian còn lại. Đóng tin kết thúc đợt,
lịch sử vẫn giữ nguyên thời hạn đã mua; không tự hoàn tiền hoặc tự gia hạn.

## API

| Phương thức | Đường dẫn `/api/v1` | Quyền |
| --- | --- | --- |
| GET | `/services/catalog` | Công khai; không trả credentials |
| GET | `/services/listings` | USER; tối đa 100 tin đủ điều kiện của mình |
| POST | `/services/orders` | USER; `{ clientId, listingId }` |
| GET | `/services/orders?page=1&limit=10&kind=all` | USER; `kind=boosts` cho quyền lợi đã mua |
| GET | `/services/orders/:id` | Chủ đơn |
| POST | `/services/orders/:id/checkout` | Chủ đơn đang chờ |
| POST | `/services/momo/ipn` | Chữ ký MoMo; body theo spec |
| POST | `/services/payos/webhook` | Chữ ký PayOS; không cần cookie/Origin |
| POST | `/services/orders/:id/refund-request` | Chủ đơn PAID; `{ reason }`, 10–1000 ký tự |
| GET | `/services/orders/:id/receipt` | Chủ đơn PAID; PDF tải xuống riêng tư |

## Hoàn tiền và chứng từ

Yêu cầu hoàn tiền được lưu duy nhất cho đơn, gửi lại không tạo thêm yêu cầu.
Giao diện hiển thị **Chờ kiểm tra**. Đây là tiếp nhận yêu cầu, chưa có quy trình
admin duyệt/từ chối hoặc gọi API refund của MoMo. Không cập nhật trạng thái REFUNDED,
không tự thu hồi boost và không hứa thời hạn hoàn tiền. Những phần này cần triển khai
cùng quy trình hỗ trợ/đối soát ở Phase 10 trước khi cung cấp dịch vụ thật.

PDF là **biên nhận thanh toán dịch vụ**, ghi đúng cổng và tiền thật/thử nghiệm, độc lập với bảng quyết toán
nhà chung. Không phải hóa đơn điện tử. PDF lấy dữ liệu snapshot của đơn, thêm thời
hạn đã cấp và tình trạng tiếp nhận hoàn tiền khi có. Font Be Vietnam Pro và giấy
phép dùng chung từ `household/fonts`, đã được đóng gói trong backend build.

## Cấu hình MoMo sandbox

Thêm vào `backend/.env`; không đặt credentials trong frontend hoặc Git:

```dotenv
BILLING_PAYMENT_PROVIDER=MOMO_SANDBOX
MOMO_PARTNER_CODE=
MOMO_ACCESS_KEY=
MOMO_SECRET_KEY=
MOMO_IPN_URL=
```

Để cả bốn trống sẽ tắt checkout; vẫn xem được catalog/lịch sử. Nếu cấu hình thì
phải đủ cả bốn. IPN cần URL HTTPS công khai kết thúc bằng
`/api/v1/services/momo/ipn`, trỏ tới backend và truy cập được từ MoMo.
HTTP localhost chỉ dùng kiểm thử local, MoMo không gọi được localhost của máy bạn.
Redirect dùng `FRONTEND_ORIGIN + /dich-vu/ket-qua`.
Gateway cố định `https://test-payment.momo.vn/v2/gateway/api/create`, timeout 30 giây.
Khởi động lại backend sau khi điền thông tin do MoMo cấp.

Hiện chưa có thông tin merchant; **chưa xác nhận giao dịch đi qua MoMo sandbox thật**.
Không dùng credentials minh họa trong kiểm thử như credentials merchant.
Để nghiệm thu tích hợp: dùng tài khoản/ứng dụng MoMo Test, mua gói, xác nhận IPN
qua HTTPS, kiểm tra transId/số tiền trong database, gửi lại callback và xác nhận
chỉ có một boost. Thử hủy/thất bại và tình huống return về trước IPN.

Spec chính thức đã đối chiếu:
[captureWallet](https://developers.momo.vn/v3/vi/docs/payment/api/wallet/onetime/),
[Payment Notification](https://developers.momo.vn/v3/vi/docs/payment/api/result-handling/notification/),
[result codes](https://developers.momo.vn/v3/vi/docs/payment/api/result-handling/resultcode/).

## Dùng PayOS trong lúc chờ MoMo

Giữ nguyên gói 49.000đ/7 ngày. Chỉ backend lưu credentials, không đưa vào frontend/Git:

```dotenv
BILLING_PAYMENT_PROVIDER=PAYOS
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
```

Ba khóa phải cùng một kênh thanh toán trên `https://my.payos.vn`. Khởi động lại
backend sau khi sửa `.env`. MoMo chưa có credentials thì để cả bốn biến MOMO trống.
Đổi lại `BILLING_PAYMENT_PROVIDER=MOMO_SANDBOX` khi muốn tạo đơn mới qua MoMo;
đơn cũ giữ nguyên cổng, số tiền, mã đơn và quyền lợi. Catalog có `provider`, `sandbox`
và `providers` để giao diện hiển thị đúng và cho tiếp tục từng đơn theo cổng của nó.

PayOS **không có môi trường sandbox riêng**. Thanh toán QR/chuyển khoản sẽ chuyển
tiền thật vào tài khoản ngân hàng đã liên kết. Giao diện và PDF ghi rõ điều này.
Không tự gọi API chuyển tiền/hoàn tiền; yêu cầu hoàn tiền vẫn chỉ được tiếp nhận.

Chạy backend cổng 5000. Cài [ngrok cho Windows](https://ngrok.com/download/windows),
đăng ký tài khoản và lấy [authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).
Trong PowerShell chạy:

```powershell
ngrok config add-authtoken "TOKEN_NGROK_CUA_BAN"
ngrok http 5000
```

Token này là của ngrok, độc lập với ba khóa PayOS. Lấy URL HTTPS ở dòng Forwarding.
Trong cấu hình Webhook của kênh thanh toán trên `https://my.payos.vn`, đăng ký:

```text
https://<domain-ngrok-cua-ban>/api/v1/services/payos/webhook
```

URL webhook được đăng ký trên PayOS, không truyền cùng request tạo link và không cần
biến `PAYOS_WEBHOOK_URL`. Giữ tunnel chạy, cập nhật URL trên PayOS nếu domain đổi.
`returnUrl`/`cancelUrl` tự tạo từ `FRONTEND_ORIGIN + /dich-vu/ket-qua?orderId=<UUID>`.
Local frontend có thể dùng `http://localhost:3000` khi mở checkout trên cùng máy.

Webhook ký HMAC-SHA256 trên toàn bộ `data`, so sánh constant time; kiểm tra orderCode,
amount, VND, reference và paymentLinkId đã lưu. Chỉ `data.code=00` đã ký mới ghi nhận
thành công; `success`/`code` ngoài `data` và query return không cấp quyền lợi.
`success` ngoài `data` là tùy chọn: request kiểm tra URL webhook thực tế của PayOS
không gửi trường này. Vẫn bắt buộc xác thực chữ ký trên `data` trước khi phản hồi.
Callback lặp không tạo thêm boost; transaction/reference duy nhất trong từng cổng.
Webhook hợp lệ trả HTTP 200 sau commit. Mẫu xác thực webhook/đơn không thuộc Roomora
được xác thực chữ ký rồi trả 200, không ghi giao dịch hay quyền lợi.

Mã PayOS là số nguyên an toàn được tạo một lần và lưu cùng đơn; retry dùng cùng mã.
Khi create timeout/trùng mã, đọc lại link cùng mã qua API GET và xác thực chữ ký,
số tiền, mã đơn, trạng thái trước khi dùng lại. Không tạo đơn thay thế khi kết quả mạng chưa rõ.

Nghiệm thu: mở `/dich-vu`, mua cho tin công khai, thanh toán 49.000đ bằng QR/chuyển khoản,
kiểm tra webhook cập nhật PAID, một boost 7 ngày và PDF ghi PayOS/tiền thật. Nếu quay về
trước webhook, trang vẫn chờ. Hủy trên checkout không dùng query URL để đổi trạng thái;
đơn chưa trả tiền sẽ hết hạn. Chưa chứng minh giao dịch thật nếu chỉ có test callback mô phỏng.

Spec chính thức: [API](https://payos.vn/docs/api/),
[signature](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/),
[môi trường test](https://payos.vn/docs/moi-truong-test/).

## Kiểm chứng local

Migration `20261011200000_service_billing` đã deploy lên PostgreSQL local.
`test/billing.e2e-spec.ts` dùng HTTP/PostgreSQL thật, IPN ký số mô phỏng và mock
HTTP response của gateway cho kiểm thử checkout; không gọi merchant thật.
Browser dùng Edge headless, dữ liệu tách biệt và dọn sau khi chạy. Checkout MoMo
được mô phỏng, nhưng đơn/IPN/thông báo/quyền lợi/biên nhận đều xử lý bằng API và DB thật.
Xem báo cáo phạm vi kiểm chứng tại `../../../../PHASE_9_STATUS.md`.
