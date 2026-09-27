# Phase 4 — Tìm người ở ghép và kết nối

Triển khai ngày 27/09/2026 theo `backend/room.todo`. Database, API NestJS và
giao diện dùng dữ liệu thật, giữ kiến trúc Prisma/session hiện tại.

## Màn hình

| Đường dẫn           | Chức năng                                                                        |
| ------------------- | -------------------------------------------------------------------------------- |
| `/tim-nguoi-o-ghep` | Tìm tên/giới thiệu, lọc khu vực/ngân sách/thói quen, phân trang, đối chiếu hồ sơ |
| `/ho-so/[id]`       | Hồ sơ công khai, giải thích mức độ phù hợp, kết nối, chặn và báo cáo             |
| `/ket-noi`          | Lời mời đã nhận/đã gửi, kết nối được chấp nhận, danh sách chặn và bỏ chặn        |

Bố cục dựa trên các mẫu tìm người ở ghép, yêu cầu kết nối và hồ sơ trong
`design-reference`: thông tin nhu cầu của mình, bộ lọc, danh sách bên trái và
khung đối chiếu bên phải. Dùng semantic token cam đỏ/kem của theme hiện tại.
Điện thoại có bộ lọc thu gọn; chọn hồ sơ đưa người dùng đến khung đối chiếu.
Có phản hồi đang tải, lỗi, danh sách trống và thông báo thành công cho thao tác.

Chỉ tìm hồ sơ công khai của tài khoản đã xác minh email, loại chính mình và
người bị chặn ở cả hai chiều. Không trả email, thông tin phiên hoặc dữ liệu ẩn.
Hồ sơ chuyển sang riêng tư được che trong danh sách kết nối; lời nhắn đã gửi
trực tiếp vẫn giữ để hai bên biết nội dung lời mời.

## Quy tắc phù hợp

| Tiêu chí  | Trọng số | Quy tắc                                                                                                                                     |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Khu vực   | 25       | Chung phường/xã hoặc có bên chọn cả tỉnh: phù hợp; cùng tỉnh khác phường: cần trao đổi; khác tỉnh: khác biệt                                |
| Ngân sách | 25       | Khoảng ngân sách giao nhau: phù hợp; không giao nhau: khác biệt                                                                             |
| Giờ ngủ   | 15       | Giống nhau: phù hợp; có bên linh hoạt: cần trao đổi; còn lại: khác biệt                                                                     |
| Hút thuốc | 15       | Giống nhau: phù hợp; có bên chỉ hút ngoài trời: cần trao đổi; còn lại: khác biệt                                                            |
| Thú cưng  | 10       | Giống nhau hoặc có thú cưng/gần gũi thú cưng: phù hợp; không thú cưng/có thú cưng: khác biệt; không thú cưng/gần gũi thú cưng: cần trao đổi |
| Yên tĩnh  | 10       | Giống nhau: phù hợp; có bên cân bằng: cần trao đổi; còn lại: khác biệt                                                                      |

Phù hợp được đủ điểm, cần trao đổi được nửa điểm, khác biệt được 0 điểm.
Thiếu dữ liệu hoặc bên kia không công khai tiêu chí thì bỏ khỏi phép tính.
Điểm phần trăm = tổng điểm / tổng trọng số có dữ liệu, làm tròn số nguyên;
cần ít nhất hai tiêu chí để hiển thị điểm. Luôn hiển thị số tiêu chí đã đối chiếu
và giải thích từng tiêu chí. Nhu cầu riêng của người xem chỉ dùng cho chính
người đó; không suy ra dữ liệu bị ẩn của người khác qua lọc hoặc điểm số.

Danh sách sắp xếp theo hồ sơ cập nhật gần đây với ID làm thứ tự phụ.
Không dùng AI và không quảng cáo đây là xếp hạng phù hợp toàn bộ database.
Lọc khu vực dùng `desiredLocations` đã chọn từ danh mục tỉnh/phường; hồ sơ cũ
chỉ có tên khu vực tự nhập cần cập nhật để dùng bộ lọc này.

## Kết nối và bảo vệ dữ liệu

- Mỗi cặp người dùng chỉ có một bản ghi kết nối, khóa duy nhất không phụ thuộc
  chiều gửi. Không gửi cho chính mình; cần công khai hồ sơ trước khi gửi.
- Người nhận chấp nhận/từ chối, người gửi hủy lời mời đang chờ. Người ngoài
  không truy cập được lời mời; phiên bản bản ghi ngăn thao tác trên trạng thái cũ.
- Sau từ chối hoặc hủy, chờ 24 giờ mới được gửi lại. Tối đa 10 lần gửi thành công
  trong một giờ và 30 lần trong 24 giờ, kể cả khi hủy lời mời.
- Chặn ẩn hồ sơ ở cả hai chiều và hủy lời mời/kết nối đang có trong cùng transaction.
  Bỏ chặn chỉ gỡ chặn của mình, không khôi phục kết nối cũ.
- Báo cáo lưu riêng tư, một báo cáo cho mỗi cặp người báo cáo/người bị báo cáo,
  tối đa 5 báo cáo trong 24 giờ. Có lý do, nội dung và trạng thái `OPEN`.
  Giao diện xác nhận tiếp nhận; quy trình admin xử lý báo cáo thuộc Phase 10.
- Khóa hai hàng người dùng theo thứ tự cố định trong PostgreSQL bảo vệ thao tác
  gửi/chấp nhận/chặn đồng thời và giới hạn tần suất giữa nhiều API instance.
  Các request thay đổi dữ liệu dùng AuthGuard và OriginGuard hiện tại.

Chấp nhận kết nối chỉ ghi nhận đồng thuận giữa hai tài khoản, không xác minh
danh tính hoặc bảo đảm hai người ở chung phù hợp. Nhắn tin, lịch xem phòng và
thông báo tự động tiếp tục ở Phase 5.

## Code và triển khai

Backend `modules/people`: DTO, controller, service, hàm đối chiếu độc lập và test.
Mapper `modules/profile/public-profile.ts` dùng chung để giữ quyền riêng tư nhất quán.
Frontend `components/people` tách tìm kiếm, danh sách kết nối, hồ sơ công khai và
component đối chiếu/thao tác dùng chung. Kiểu dữ liệu và nhãn ở `lib/people.ts`.
Tái sử dụng `apiFetch`, AuthProvider và UI có sẵn, không thêm dependency.

Phân trang giới hạn 24 hồ sơ/request. Lấy trạng thái kết nối theo lô cho danh sách,
không truy vấn từng thẻ. Hủy request cũ khi đổi bộ lọc/tab hoặc rời trang;
không hiển thị kết quả cũ dưới bộ lọc mới. Có index trạng thái/người gửi/người nhận,
thời gian gửi, hồ sơ công khai và GIN cho khu vực mong muốn.

Migration bổ sung `20260928090000_phase_4_connections` đã được áp dụng trên
database local bằng `prisma migrate deploy`; giữ dữ liệu trước đó. Khi chạy ở
checkout/môi trường khác, trong `backend`:

```powershell
npm run prisma:migrate:deploy
npm run prisma:generate
npm run build
npm run start:prod
```

Frontend chạy `npm run dev` trong `frontend`; API local ở
`http://localhost:5000/api/v1`. Phase 4 không cần thêm biến môi trường.

## Kiểm chứng

- Backend build và lint; 49 unit test, 36 E2E test với PostgreSQL thật, gồm
  5 test đối chiếu và 10 E2E test Phase 4.
- E2E kiểm tra quyền riêng tư, phân trang, lọc, gửi ngược chiều đồng thời,
  quyền/phiên bản thao tác, giới hạn giờ/ngày, gửi lại, báo cáo và chặn lúc chấp nhận.
- Frontend TypeScript, lint, 8 API client test và production build thành công.
- Chrome dùng frontend development, API thật và PostgreSQL thật: hai tài khoản
  tìm nhau, gửi/nhận/chấp nhận và tải lại vẫn giữ kết nối; từ chối/hủy có thông báo;
  báo cáo được lưu riêng tư; chặn hủy kết nối, bỏ chặn không khôi phục lời mời cũ.
- Kiểm tra khách chưa đăng nhập, hồ sơ riêng tư/thông tin ẩn và bộ lọc mobile.
  Giao diện 1440/768/320px không tràn ngang, không có lỗi JavaScript.
- Tài khoản/hồ sơ/kết nối/báo cáo kiểm thử được dọn qua cascade sau khi chạy.
  Ảnh đại diện thử nghiệm dùng chữ cái tên, không ghi dữ liệu Cloudinary.
  Screenshot và report ở `.verification/phase4-*`, được Git bỏ qua.

Kiểm chứng này là trên môi trường local; chưa đo tải hoặc triển khai production.

## Rà soát code ngày 28/09/2026

- Đổi tên biến/hàm theo mục đích và tách khai báo state để dễ đọc.
- Gom cấu hình bộ lọc thói quen thành một mảng có tên, nhãn và lựa chọn;
  thay các nhánh ba ngôi lồng nhau bằng điều kiện hoặc bảng ánh xạ.
- Bỏ nhánh đối chiếu thú cưng thừa, giữ nguyên điểm và quy tắc riêng tư.
- Tab đã chặn không truy vấn hồ sơ của người xem, chỉ lấy tên hồ sơ người bị chặn.
- Dùng lại bộ định dạng tiền thay vì tạo mới cho từng giá trị.

Frontend còn bổ sung `HomeSlideshow` và `SiteFooter` dùng chung theme:
4 ảnh lấy từ bộ thiết kế, WebP local đã nén sẵn và tải trực tiếp,
trượt từ phải sang trái mỗi 6 giây,
lặp liền mạch cả hai chiều, có hai nút ảnh trước/sau ở hai bên.
Banner luôn tự chuyển khi tab đang hiển thị, kể cả lúc rê chuột, focus hoặc
chạm các nút. Đã bỏ cụm chấm chọn ảnh và nút dừng/chạy ở phía trên.
Tùy chọn giảm chuyển động chỉ bỏ hiệu ứng trượt, ảnh vẫn tự đổi.
Footer có lời mời khám phá, giới thiệu và liên kết đến các chức năng đang có.

Kiểm tra sau rà soát: backend build/lint, 49 unit test và 36 E2E test đều qua;
frontend lint/TypeScript/build và 8 API client test đều qua. Chrome kiểm chứng lại
luồng Phase 4 với API mới/PostgreSQL thật; tài khoản thử nghiệm được dọn sạch.
Slideshow/footer đã kiểm tra ảnh thật, tự chuyển/tạm dừng, rê chuột, bàn phím,
giảm chuyển động và bố cục 1440/768/320px. Không có lỗi JavaScript hoặc tải ảnh;
phản hồi 401 từ `/auth/me` khi khách chưa đăng nhập là trạng thái dự kiến.
Ảnh/report ở `.verification/home-footer-*` và `.verification/home-browser-report.json`.

Hiệu ứng banner đã đổi sang trượt ngang bằng `transform`, ảnh mới vào từ bên phải.
Chrome xác nhận cả bốn lần chuyển đều đi sang trái, vòng lặp cuối/đầu liền mạch
và tiếp tục sang vòng mới; chọn ảnh và kích thước 1440/768/320px hoạt động đúng.
Report: `.verification/banner-slide-report.json`. Frontend lint/build đều qua.

Đã sửa lỗi tiếp tục banner nhưng còn bị dừng bởi hover/focus của chuột.
Ảnh WebP tải trực tiếp để tránh request tối ưu ảnh kích thước nhỏ bị treo trên local.
Chrome kiểm chứng tự chuyển khi hover, chọn ảnh bằng cảm ứng, dừng/tiếp tục,
vòng lặp cuối/đầu, bàn phím và tùy chọn giảm chuyển động; ảnh thật tải đủ,
không có lỗi JavaScript. Frontend lint/build qua.
Report: `.verification/banner-autoplay-report.json`.

Theo yêu cầu mới, đã bỏ toàn bộ cụm điều khiển phía trên và cơ chế tạm dừng,
thêm hai mũi tên ảnh trước/sau tại giữa hai cạnh. Ảnh tự chuyển mỗi 6 giây;
hai đầu có ảnh lặp để xem trước/sau liền mạch. Chrome kiểm chứng hai chiều,
chuột/bàn phím/cảm ứng, tự chuyển sau thao tác và chế độ giảm chuyển động;
ảnh tải đủ, không lỗi JavaScript, bố cục 1440/768/320px không tràn ngang.
Frontend lint/build qua. Report: `.verification/banner-arrows-report.json`.
