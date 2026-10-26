# Thử ba hành trình với người dùng đầu tiên

Dùng staging và tài khoản thử riêng, không dùng tiền/giao dịch, OTP hay thông tin
định danh thật. Người điều phối không chỉ chỗ bấm và không giải thích nhãn trước
khi người thử trả lời. Ghi bí danh thay cho tên/email thật. Cần thử trên điện thoại
thực tế; mobile emulation trong Playwright chỉ là kiểm tra kỹ thuật.

| Nhiệm vụ giao cho người thử | Tiêu chí quan sát |
| --- | --- |
| Tìm phòng theo khu vực/ngân sách; chọn một tin và giải thích chi phí. | Tự tìm được tin phù hợp; phân biệt tiền thuê, tổng tháng, cọc ban đầu, đơn vị theo phòng/người và chi phí dự kiến. |
| Liên hệ người đăng và trao đổi một lời nhắn. | Tìm được đường tới hồ sơ/kết nối, hiểu phải được chấp nhận mới nhắn; hai bên thấy cùng tin nhắn sau tải lại. |
| Với khoản chi 1.000.000, đã trả nhà cung cấp 200.000, giải thích còn thiếu gì. | Nói được còn trả nhà cung cấp 800.000; số bù trừ giữa thành viên bằng 0 không có nghĩa đã trả đủ nhà cung cấp. |

Mỗi người thử thực hiện cả ba nhiệm vụ. Ghi thời gian, chỗ phải hỏi lại, thao tác
sai và cách họ hiểu nhãn; không gợi câu trả lời. Sau nhiệm vụ, hỏi một câu trung
lập: “Có thông tin nào bạn chưa chắc hoặc phải tự suy ra không?”.

Mẫu ghi nhận: [CSV](user-acceptance-results.csv). Đây là mẫu trống, chưa phải kết quả.
Sau ít nhất 5 người thuộc nhóm sử dụng dự kiến, ưu tiên sửa mọi hiểu nhầm về tiền
hoặc quyền truy cập; xem xét nhãn/bố cục nếu nhiều người mắc cùng điểm. Chạy lại
với người chưa được hướng dẫn sau khi sửa. Không tự điền kết quả con người từ
log hoặc bài kiểm thử tự động.
