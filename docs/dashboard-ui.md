# Dashboard Roomora

Dashboard admin nằm ở `/admin/tong-quan`, có mục Tổng quan trong sidebar và
menu tài khoản. Các trang xử lý tin, người dùng, báo cáo và hoàn tiền chỉ có
thanh hàng chờ gọn; trang mặc định sau đăng nhập vẫn là tin chờ duyệt.

Dashboard ADMIN có bộ chọn tháng (mặc định tháng hiện tại, UTC+7). Ô doanh thu
dịch vụ là tiền đã nhận trong tháng trừ tiền hoàn tất trong tháng; ô hoàn tiền
hiển thị số âm. Tiền thu 98.000 đ và hoàn 98.000 đ trong cùng tháng cho doanh
thu 0 đ, hoàn tiền -98.000 đ. Khoản hoàn tháng sau được trừ ở tháng sau; doanh
thu có thể âm. Số tiền đã nhận vẫn hiển thị phụ để đối chiếu.

Ô thứ ba là "Đã xử lý trong tháng": số tin đã được duyệt/từ chối, báo cáo đã
có kết quả, yêu cầu hoàn tiền đã hoàn tất/từ chối. Mỗi tin đếm một lần trong
tháng dù qua nhiều review hoặc có cả duyệt và từ chối. Yêu cầu hoàn tiền bị từ
chối tính theo ngày quyết định, kể cả gửi tháng trước. Không cộng hàng chờ,
đang thực hiện hay hoàn tiền lỗi còn cần thử lại. Link mở các biểu đồ kết quả.

Biểu đồ và hàng chờ dashboard cùng dùng tháng đang chọn. Tin duyệt/từ chối
theo ngày review, báo cáo đã xử lý theo ngày xử lý; dữ liệu đang chờ theo ngày
gửi/tạo trong tháng. Các trạng thái đơn chưa thanh toán và yêu cầu chưa hoàn
tất theo tháng tạo và trạng thái hiện tại. Thanh hàng chờ trên trang xử lý vẫn
bao gồm toàn bộ công việc tồn đọng. Chi tiết API ở `backend/src/modules/admin/README.md`.

Nhà chung có header gọn và sidebar chia theo chi tiêu, sinh hoạt và thông tin
nhà. Dưới 1000 px, menu chọn mục thay sidebar, vẫn mở đủ 11 phần quản lý.
Tổng quan gồm chi tiêu tháng, số khoản chi/điều chỉnh, thanh toán chờ xác nhận,
khoản chi gần đây, việc nhà cần làm và thành viên trên Roomora. Biểu đồ đổi
giữa lũy kế, theo ngày và theo danh mục. Widget việc nhà đọc ba việc đang mở có hạn
gần nhất từ API hiện có; lỗi của widget được tải lại riêng. Thông báo, đăng
thông báo và nội quy vẫn nằm trong tổng quan.

Biểu đồ admin và tổng quan nhà chung dùng [Apache ECharts](https://github.com/apache/echarts)
`6.1.0`, giấy phép Apache 2.0; đã gỡ Recharts và dependency trực tiếp `react-is`.
Import theo module: line, bar, pie, grid, tooltip, aria và renderer SVG. Màu và
font dùng theme chung của Roomora. Component React quản lý việc khởi tạo,
cập nhật, resize và dispose; không cần thư viện wrapper. Tham khảo các ví dụ
chính thức của ECharts, không sao chép template dashboard bên ngoài.

Nhà chung mặc định là biểu đồ vùng lũy kế có gradient; đường bậc thang thể hiện
đúng ngày thay đổi, không nội suy thành khoản chi phát sinh. Tooltip cho cả
số tiền lũy kế và số tiền trong ngày. Chế độ ngày vẫn dùng cột có dấu; danh
mục dùng thanh ngang. Donut và chú giải nằm cạnh nhau trên desktop, xếp dọc
ở màn hình nhỏ. Chú giải hiển thị số tiền, phần trăm và thanh tỷ trọng; chọn
một nhóm làm nổi bật phần tương ứng và cập nhật số ở tâm vòng.

Biểu đồ bắt đầu hoạt ảnh khi đi vào vùng nhìn thấy, có tooltip, chọn chú giải
và hỗ trợ bàn phím. `prefers-reduced-motion` tắt hoạt ảnh của biểu đồ và panel.
Chuyển tháng nhà chung tải lại báo cáo; các khoản điều chỉnh âm vẫn hiển thị
đúng dấu. Biểu đồ vòng chỉ thể hiện tỷ trọng số tiền dương, kèm ghi chú khi có
điều chỉnh. Admin dùng tổng của tháng được chọn; không dựng chuỗi doanh thu
theo ngày khi API chưa trả dữ liệu theo ngày.

Kiểm chứng local ngày 13/10/2026: frontend production build và TypeScript qua;
lint các file biểu đồ thay đổi qua. Edge xác nhận hoạt ảnh vùng, thanh và cung,
giữ nguyên khi bật giảm chuyển động, tooltip cho điều chỉnh âm, điều hướng
bàn phím, ba chế độ nhà chung, đổi tháng, lỗi/tải lại và tám kích thước
320–1920 px. Kiểm tra UI dùng response fixture, không ghi dữ liệu vào database.
Ảnh, video và báo cáo nằm trong `.verification/echarts-results/`.

`npm audit` sau cài đặt còn báo một lỗi critical ở Next.js và bảy lỗi high
trong các dependency sẵn có; phiên bản của cả tám mục giống lockfile trước
thay đổi này. ECharts và các dependency mới không nằm trong danh sách đó.
