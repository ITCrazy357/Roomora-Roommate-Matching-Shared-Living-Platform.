# UAT nhanh: ba bài thử trong 10–15 phút

## Chuẩn bị trước khi mời người thử

Dùng staging hoặc môi trường demo với dữ liệu riêng. Chuẩn bị tài khoản A đã
đăng nhập trên điện thoại thật của người thử; người điều phối giữ tài khoản B
ở thiết bị khác để nhận/chấp nhận kết nối. Có một tin mẫu của B phù hợp một
khu vực và ngân sách bạn chọn trước.

Chuẩn bị nhà demo chỉ có A: một khoản điện 1.000.000đ, đã thanh toán 200.000đ,
toàn bộ phần chia thuộc A. Dùng số liệu mẫu, không thanh toán PayOS/chuyển khoản
thật. Không yêu cầu người thử cung cấp mật khẩu, OTP hay giấy tờ cá nhân cho
người điều phối. Ghi bí danh như P01 thay cho tên/email thật.

## Chỉ đọc các yêu cầu này cho người thử

1. **3 phút:** “Hãy tìm một phòng ở [khu vực] trong ngân sách [số tiền], chọn
   một tin và nói tổng chi phí bạn dự kiến phải trả tháng đầu.”
2. **4 phút:** “Hãy liên hệ người đăng tin đó và trao đổi một lời nhắn.” Người
   điều phối dùng B chấp nhận khi nhận được yêu cầu, rồi trả lời một câu ngắn.
   Yêu cầu A tải lại trang và kiểm tra tin nhắn vẫn còn.
3. **3 phút:** Mở nhà demo đã chuẩn bị, hỏi: “Với khoản điện này, nhà đã trả
   bao nhiêu và còn phải trả bao nhiêu? Không có bù trừ giữa thành viên có nghĩa
   là đã trả xong tiền điện chưa?”

Không chỉ chỗ bấm hoặc giải thích nhãn trước câu trả lời. Sau mỗi bài hỏi:
“Có thông tin nào bạn chưa chắc hoặc phải tự suy ra không?”. Nếu người thử cần
hướng dẫn, ghi lại trước khi giúp; không đánh dấu hoàn thành không trợ giúp.

## Tiêu chí dành riêng cho người điều phối

| Nhiệm vụ giao cho người thử | Tiêu chí quan sát |
| --- | --- |
| Tìm phòng theo khu vực/ngân sách; chọn một tin và giải thích chi phí. | Tự tìm được tin phù hợp; phân biệt tiền thuê, tổng tháng, cọc ban đầu, đơn vị theo phòng/người và chi phí dự kiến. |
| Liên hệ người đăng và trao đổi một lời nhắn. | Tìm được đường tới hồ sơ/kết nối, hiểu phải được chấp nhận mới nhắn; hai bên thấy cùng tin nhắn sau tải lại. |
| Với khoản chi 1.000.000, đã trả nhà cung cấp 200.000, giải thích còn thiếu gì. | Nói được còn trả nhà cung cấp 800.000; số bù trừ giữa thành viên bằng 0 không có nghĩa đã trả đủ nhà cung cấp. |

Mỗi người thử thực hiện cả ba nhiệm vụ. Ghi thời gian, chỗ phải hỏi lại, thao tác
sai và nguyên văn cách họ hiểu nhãn; không gợi câu trả lời hoặc cho xem bảng
đáp án trước khi thử.

Mẫu ghi nhận: [CSV](user-acceptance-results.csv). Đây là mẫu trống, chưa phải kết quả.
Mỗi bài ghi một dòng: `tester_alias=P01`, `device` là điện thoại thực tế,
`task=find_room/connect_message/supplier_balance`, `completed_without_help=yes/no`,
`time_seconds` là thời gian thực. Các cột còn lại ghi hiểu nhầm, điểm bị chặn và
ghi chú; không đưa thông tin riêng tư vào CSV.

Bắt đầu với một người để bắt lỗi rõ, rồi thử thêm người thuộc nhóm sử dụng dự
kiến. Sau khoảng 5 người, ưu tiên sửa mọi hiểu nhầm về tiền hoặc quyền truy cập;
xem xét nhãn/bố cục nếu nhiều người mắc cùng điểm. Chạy lại với người chưa được
hướng dẫn sau khi sửa. Không tự điền kết quả con người từ log/kiểm thử tự động.
