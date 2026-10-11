# Bản đồ Roomora — Leaflet và Geoapify

Roomora giữ Leaflet và ảnh bản đồ OpenStreetMap `osm-carto` của Geoapify.
`RoomMap` dùng chung cho chọn vị trí và xem khu vực công khai.

## Cấu hình

Đặt khóa ở **backend/.env**:

```dotenv
GEOAPIFY_API_KEY=YOUR_API_KEY
```

Lấy khóa tại [Geoapify MyProjects](https://myprojects.geoapify.com/).
Khởi động lại backend sau khi thay đổi biến môi trường. Không cần Google Maps key.
Không đặt khóa trong `NEXT_PUBLIC_*`: frontend chỉ gọi API Roomora, backend gọi
Geoapify và không trả khóa hoặc URL chứa khóa về trình duyệt.

Khóa cũ `NEXT_PUBLIC_GEOAPIFY_MAPS_API_KEY` không còn được dùng. Chuyển giá trị
sang backend và xóa biến cũ; build lại frontend để áp dụng mã mới.
Nếu khóa bị giới hạn theo referrer của trình duyệt, cấu hình lại quyền dùng
từ máy chủ tại Geoapify. Không đưa khóa hoặc file môi trường lên Git.

## Theo loại tin

- **Tìm phòng:** chỉ chọn tỉnh/phường mong muốn; không bản đồ, địa chỉ riêng
  hoặc ngày có thể dọn vào của một phòng cụ thể.
- **Tìm người ghép phòng:** có thể chọn khu vực mong muốn hoặc vị trí chỗ ở.
  Tọa độ, địa chỉ phòng, diện tích, ngày dọn vào và ảnh không bắt buộc nếu chưa có phòng.
- **Cho thuê phòng:** cần thông tin phòng, ngày dọn vào, địa chỉ riêng, tọa độ
  và ít nhất một ảnh trước khi gửi duyệt.

## Thao tác

- Mở **Chi phí & Vị trí**. Kéo bản đồ, bấm vào bản đồ hoặc **Chọn vị trí tại tâm**.
  Ghim tại tâm phản ánh vị trí được chọn; tọa độ hiện dưới bản đồ.
- **Mở rộng bản đồ** dùng toàn bộ vùng màn hình; **Thu gọn bản đồ** hoặc Escape
  đóng vùng mở rộng, giữ vị trí. Có giới hạn focus bàn phím trong vùng mở rộng.
- Dùng +/−, bánh xe chuột, chụm/tách hai ngón tay để zoom. Phím mũi tên di
  chuyển bản đồ. Nút điều khiển đủ lớn cho thao tác chạm.
- **Tìm địa điểm hoặc khu vực** rồi chọn kết quả. Bản đồ chuyển đến địa điểm;
  người dùng có thể tiếp tục điều chỉnh ghim. Tìm kiếm chỉ trả vị trí tại Việt Nam,
  tối đa năm kết quả, không tự đổi tỉnh/phường hoặc địa chỉ riêng của form.
- **Lấy vị trí hiện tại** chỉ gọi định vị sau khi người dùng bấm nút.
  Trình duyệt cần quyền vị trí và HTTPS (localhost cũng dùng được).
- Từ chối quyền, không tìm thấy địa điểm hoặc provider lỗi đều có thông báo.
  Vẫn có thể **Nhập tọa độ thủ công** và **Áp dụng tọa độ**, kể cả khi không có khóa.
- Ghim chính xác được giữ trong phiên chỉnh sửa sau khi lưu nháp. Backend
  lưu hai chữ số thập phân, khoảng 1 km; mở lại tin sẽ nhận vị trí đã làm tròn.
  Địa chỉ cụ thể chỉ chủ tin và admin được xem, không được gửi đi tìm kiếm tự động.

## API và hạn mức

| API `/api/v1` | Nội dung |
| --- | --- |
| GET `/locations/map/config` | Chỉ trả `{ available }`, không trả khóa |
| GET `/locations/map/search?q=...` | Chuỗi 2–200 ký tự, tên và tọa độ địa điểm |
| GET `/locations/map/tiles/:z/:x/:y?retina=0` | Ảnh PNG, zoom 5–20, hỗ trợ `retina=1` |

Backend timeout provider sau 8 giây, cache tối đa 128 tile trong 5 phút.
Ảnh chỉ được tải cho vùng đang xem; Leaflet được tải động trong trình duyệt
và hủy map/listener khi rời component. Nguồn Geoapify/OpenStreetMap vẫn hiện trên bản đồ.

Theo dõi hạn mức trong Geoapify Usage & statistics. Khi provider từ chối khóa
hoặc hết hạn mức, API trả lỗi an toàn `MAP_UNAVAILABLE`, không kèm URL/khóa.
Xem [Geocoding API](https://apidocs.geoapify.com/docs/geocoding/) và
[Map Tiles API](https://apidocs.geoapify.com/docs/maps/map-tiles/).
