# Bản đồ Roomora — Leaflet và Geoapify

Roomora dùng Leaflet để hiển thị bản đồ và Geoapify để tải ảnh bản đồ
OpenStreetMap (`osm-carto`). Cùng component `RoomMap` phục vụ chọn vị trí
khi đăng tin và xem vị trí khu vực trong chi tiết tin.

## API key

Trong `frontend/.env.local`, thêm hoặc cập nhật biến này, giữ nguyên các biến khác:

```dotenv
NEXT_PUBLIC_GEOAPIFY_MAPS_API_KEY=YOUR_API_KEY
```

Không cần Google Maps API key hoặc Map ID. Không ảnh hưởng cấu hình Google
OAuth hiện có ở phần đăng nhập.

Lấy khóa tại [Geoapify MyProjects](https://myprojects.geoapify.com/): đăng ký,
bấm **Create a project**, mở project và sao chép khóa đầy đủ tại **API keys**.
Tham khảo [hướng dẫn Geoapify](https://www.geoapify.com/get-started-with-maps-api/).

Dừng rồi chạy lại frontend bằng `npm run dev`. Bản production cần đặt biến
trước `npm run build`, vì Next.js đưa `NEXT_PUBLIC_*` vào bundle lúc build.
Các file `.env*` vẫn chỉ nằm ở máy local và được Git bỏ qua.

Khóa này dùng trong trình duyệt nên sẽ có trong URL tải ảnh bản đồ.
Ở **API keys**, có thể giới hạn khóa theo website/referrer; thêm đúng địa chỉ
frontend đang chạy, chẳng hạn `http://localhost:3000` hoặc domain HTTPS production.
Không gửi khóa vào cuộc trò chuyện hoặc đưa file môi trường lên Git.

## Sử dụng

- Đến bước **Chi phí & Vị trí**, ghim nằm cố định ở giữa. Kéo bản đồ để đưa
  vị trí phòng đến dưới ghim; vị trí được chọn khi bản đồ dừng di chuyển.
  Tỉnh/phường vẫn chọn riêng, không tự xác minh từ ghim.
- Dùng nút **Lấy vị trí khu vực hiện tại** khi đang ở gần phòng. Trình duyệt
  cần được cấp quyền vị trí; triển khai bằng HTTPS. Permissions-Policy cho
  phép geolocation cùng origin (`self`).
- Có thể dùng phím mũi tên để di chuyển bản đồ, `+`/`−` để phóng to/thu nhỏ,
  vị trí tại tâm tự cập nhật sau khi di chuyển. **Chọn vị trí tại tâm** cũng
  cho phép chọn tâm hiện tại khi chưa di chuyển bản đồ. Khi bấm nút, thông
  báo **Đã chọn vị trí tại tâm bản đồ.** hiện trong 4 giây, kể cả chọn lại
  vị trí đang dùng.
- Lăn chuột trên bản đồ để zoom. Trên điện thoại, chụm/tách hai ngón tay
  hoặc bấm `+`/`−`. Zoom quanh tâm để giữ nguyên vị trí đang chọn.
- Chưa có khóa hoặc chưa tải được ảnh bản đồ: thông báo lỗi, vẫn cho lưu nháp.
  Tải lại trang để thử lại. Cần chọn vị trí trước khi gửi duyệt.
- Lưu nháp và mở lại tin để kiểm tra vị trí được giữ. Chi tiết công khai có
  bản đồ xem khu vực, không có thao tác thay đổi ghim.
- Trong phiên chỉnh sửa, bước 3 và bước 5 dùng cùng vị trí chính xác đang
  chọn, kể cả sau khi lưu nháp. Database vẫn lưu vị trí làm tròn; khi tải lại
  tin, bản đồ nhận vị trí đã lưu này. Bản đồ công khai chỉ hiển thị khu vực.
- Bước 5 hiển thị lỗi hoặc thông báo gửi duyệt thành công cạnh nút gửi.
  Sau khi gửi thành công, tin chuyển sang **Chờ duyệt**, nút đổi thành
  **Đã gửi duyệt** và không cho gửi trùng khi chưa sửa tin.

## Hạn mức, lỗi và dữ liệu

[Gói miễn phí Geoapify](https://www.geoapify.com/pricing/) hiện có 3.000
credits/ngày, không cần thẻ, cho phép dùng production trong hạn mức và có
ghi nguồn. Một lượt tải ảnh bản đồ tính 0,25 credits, không đồng nghĩa một
lượt mở bản đồ; xem [Map Tiles](https://apidocs.geoapify.com/docs/maps/map-tiles/).
Roomora hiển thị nguồn Geoapify và OpenStreetMap trong góc bản đồ.

Nếu ảnh bản đồ trả `401/403`, kiểm tra khóa đầy đủ, quyền và giới hạn referrer
của khóa. Nếu trả `429`, kiểm tra Usage & statistics/hạn mức. Không tải được
ảnh cũng có thể do mạng hoặc phần mở rộng trình duyệt.

Ảnh bản đồ chỉ được tải cho khu vực đang xem; không tải sẵn toàn bộ bản đồ.
Leaflet được tải động khi mở component, hủy map/listener khi rời màn hình;
ảnh chỉ cập nhật sau khi di chuyển bản đồ và giữ bộ đệm nhỏ.

Geoapify nhận yêu cầu ảnh cho khu vực đang xem. Roomora không gửi địa chỉ
riêng tư sang Geocoding API. Backend làm tròn vị trí đến hai chữ số thập
phân trước khi lưu, khoảng 1 km; bản đồ công khai chỉ nhận vị trí đã làm
tròn. Địa chỉ cụ thể vẫn chỉ chủ tin và admin được xem.
