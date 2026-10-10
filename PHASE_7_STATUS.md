# Phase 7 — Chi phí, công nợ và chat Nhà chung

Cập nhật 10/10/2026. Đã triển khai backend và frontend theo `backend/room.todo`.

## Nhà chung

- Giữ ràng buộc PostgreSQL một `house_members` đang hoạt động cho mỗi tài khoản; API tạo nhà/chấp nhận lời mời cũng kiểm tra điều kiện này. Rời nhà mới được tham gia nhà khác.
- `/nha-chung` mở thẳng nhà đang tham gia. Khi chưa có nhà, trang hiển thị tạo nhà và lời mời.
- Thành viên và người gửi chat có chú thích Trưởng nhà/Thành viên dưới tên. Chính mình không có nút xem hồ sơ.
- Chat chung có văn bản tối đa 2.000 ký tự, tối đa 4 ảnh JPEG/PNG/WebP và 1 ghi âm WebM/MP4/Ogg mỗi tin, 40 tin mỗi lần tải. Có gửi, sửa, xóa, dấu chỉnh sửa và tombstone cho tin đã xóa. Dùng clientId, phiên bản và số thứ tự tăng theo nhà để xử lý retry, cập nhật đồng thời và phân trang. Chỉ thành viên hiện tại có quyền đọc/gửi chat hoặc tải file đính kèm.
- Ảnh đầu vào tối đa 5 MB/25 triệu pixel, được giảm kích thước/chuyển JPEG/bỏ metadata; ghi âm tối đa 2 MB, kiểm tra MIME và chữ ký container. Tổng media sau xử lý tối đa 5 MB/tin. File lưu riêng trong PostgreSQL, API tải kiểm tra quyền và trả `private, no-store`. Xóa tin xóa cả dữ liệu file, gửi lại không khôi phục file đã xóa.
- Composer và xử lý media được dùng chung với chat cá nhân. Có xem trước ảnh/phóng to ảnh, nghe lại ghi âm, ghi trực tiếp tối đa 60 giây và chọn tệp khi không có micro. Dừng micro và thu hồi URL xem trước khi rời màn hình. Chuẩn hóa các MIME WebM/M4A khác nhau giữa trình duyệt.
- SSE hiện có phát tín hiệu để các thành viên tải dữ liệu mới sau thay đổi chat, tài chính và thành viên.

## Sổ chi phí và công nợ

- Khoản chi có người trả, người tham gia, chia đều hoặc chia số tiền cụ thể, ghi chú và biên nhận. Tiền là số nguyên VNĐ; tổng phần chia phải bằng khoản chi. Phần dư khi chia đều được phân bổ theo ID đã sắp xếp, không phụ thuộc thứ tự nhập.
- Người trả có thể trả toàn bộ cho người khác, không bắt buộc chịu một phần chi phí. Mỗi người chỉ xuất hiện một lần trong khoản chi.
- Số dư = đã chi − phần phải chịu + thanh toán đã trả được xác nhận − thanh toán đã nhận được xác nhận. Số dương cần nhận, số âm cần trả.
- Đề xuất bù trừ ghép người cần trả với người cần nhận và trừ số đang chờ xác nhận. Không tuyên bố tìm số giao dịch ít nhất trong mọi trường hợp.
- Thanh toán tiền mặt/chuyển khoản bắt đầu ở trạng thái chờ. Người nhận xác nhận/từ chối, người trả hủy; chỉ xác nhận mới làm thay đổi số dư. Trạng thái cuối không được sửa ngược. Gửi lại cùng clientId/nội dung hoặc xác nhận lại không ghi tiền hai lần.
- Khi ghi chuyển khoản có tải ảnh minh chứng tùy chọn JPG/PNG/WebP tối đa 5 MB, xem trước và bỏ ảnh. Chọn tiền mặt ẩn phần tải và bỏ ảnh đang chọn. Ảnh được xác thực nội dung, nén JPEG, bỏ metadata và lưu cùng transaction tạo thanh toán; retry kiểm tra cả ảnh gốc. JSON không kèm ảnh vẫn được hỗ trợ. Danh sách trả `hasProof`, người có quyền xem thanh toán mở ảnh qua endpoint riêng tư; người đã rời chỉ xem ảnh của thanh toán liên quan. Ảnh được giữ sau xác nhận/từ chối/hủy/quyết toán và không tự xác nhận đã nhận tiền.
- Bổ sung minh chứng: migration `20261010170000_payment_transfer_proofs` đã deploy lên PostgreSQL local; 17 kiểm thử chi phí HTTP/PostgreSQL, build backend/frontend và lint đã qua. Edge trên bản production kiểm tra chọn/bỏ/đổi hình thức/tải/xem ảnh, xác nhận/quyết toán, focus khung ảnh và bố cục form/khung ảnh ở 320/390/430/768/820/1024/1366/1920 px; không tràn ngang, không lỗi JavaScript. Đây là kiểm tra kích thước bằng Edge, chưa kiểm tra trên thiết bị Safari/iOS thật.
- Mọi thao tác ghi tài chính khóa hàng nhà trong transaction để tránh hai thao tác cùng dùng một số dư. Khi có thanh toán chờ, tạo/sửa/hủy khoản chi và thay biên nhận bị chặn; cần xử lý thanh toán chờ trước.
- Người tạo khoản chi hoặc trưởng nhà được sửa/hủy. Các thao tác cần phiên bản hiện tại; sửa/hủy cần lý do, giữ lịch sử trước/sau và người thực hiện.
- Chỉ trưởng nhà được chốt quyết toán, khi toàn bộ số dư bằng 0 và không có thanh toán chờ. Điều chỉnh khoản đã chốt mở lại khoản đó, giữ thanh toán đã xác nhận và tính lại phần nợ phát sinh. Hủy cũng giữ lịch sử/thanh toán và tính lại số dư.
- Thành viên đã rời vẫn truy cập các khoản chi liên quan, số dư cá nhân và thanh toán liên quan, có thể trả nợ/xác nhận nhận tiền ở nhà cũ. Không có quyền tạo/sửa chi phí hay đọc chat của nhà cũ.
- Người ngoài ứng dụng được biểu diễn bằng người tham gia sổ chi phí, không phải tài khoản hoặc thành viên nhà. Trưởng nhà thêm/đánh dấu đã rời; lịch sử và nợ vẫn giữ. Nếu người nhận không dùng app, trưởng nhà ghi nhận thủ công sau khi kiểm tra với họ; giao diện ghi rõ điều này. Trưởng nhà cuối cùng vẫn quản lý các xác nhận thủ công liên quan tới người ngoài app sau khi nhà lưu trữ.
- Biên nhận tải lên chỉ nhận JPEG/PNG/WebP thật, tối đa 5 MB/25 triệu pixel; chuyển JPEG, giảm kích thước, bỏ metadata. Dữ liệu lưu riêng trong PostgreSQL, đọc qua API kiểm tra quyền với `no-store`. Không dùng URL công khai cho ảnh mới.
- Roomora chỉ ghi nhận việc trả tiền giữa các thành viên, không giữ hoặc chuyển tiền hộ.
- Ô công nợ cần nhận dùng xanh lá và dấu +; đang nợ dùng đỏ và dấu −; bằng 0 dùng màu trung tính. Badge chờ dùng vàng, đã xác nhận/đã quyết toán dùng xanh lá, từ chối dùng đỏ. Nhãn chữ luôn đi kèm màu. Token màu ngữ nghĩa nằm trong theme chung, không thay màu nút thương hiệu.

## Các màn hình và API chính

- Nhà chung có các tab Tổng quan, Thành viên, Chat chung, Chi phí, Công nợ & Quyết toán, Thông tin nhà; dùng theme coral/cream chung.
- `/nha-chung/lich-su` liệt kê các sổ đã tham gia; `/nha-chung/[id]/chi-phi` mở lịch sử/công nợ, gồm nhà đã rời.
- `/houses/:houseId/messages`: GET/POST; `/:id`: PATCH/DELETE.
- `/houses/:houseId/attachments/:attachmentId`: GET media riêng tư. POST tin nhận JSON hoặc multipart với `clientId`, `text`, `images`, `audio`.
- `/houses/:houseId/expenses`: GET (query phân trang)/POST; `/:id`: PATCH; `/:id/cancel`, `/:id/receipt`, `/:id/history` xử lý hủy, biên nhận và lịch sử.
- Các nhánh `/balances`, `/settlements`, `/participants`, `/payments`, `/payments/:id`, `/settle` xử lý số dư, bù trừ, người ngoài app, thanh toán và chốt.
- `/expenses/houses` trả các sổ hiện tại và lịch sử mà tài khoản có quyền truy cập.

## Kiểm chứng

- Đã deploy migration `20261010090000_pre_phase_7_supplements` và `20261010100000_phase_7_finance_house_chat` lên PostgreSQL local bằng `prisma migrate deploy`, không reset dữ liệu. Đã generate Prisma Client.
- Build backend NestJS và frontend Next.js production đã qua. Frontend build cần kết nối Google Fonts; lần chạy trong sandbox bị EACCES, lần chạy được cấp quyền thành công.
- TypeScript và lint các phần thay đổi đã qua.
- 58 kiểm thử HTTP/PostgreSQL trong 6 suite: expenses, house-chat, houses, communications, message-changes, listings. Chạy lại 18 ca mới sau chỉnh sửa cuối của service vẫn qua.
- Các ca mới kiểm tra chia tiền lẻ/1 VNĐ, tổng chia sai, người ngoài nhà, phân quyền, gửi trùng, sửa cùng lúc, giữ chỗ thanh toán chờ, thanh toán vượt nợ, xác nhận trùng, điều chỉnh sau chốt, biên nhận riêng tư, người ngoài app, rời nhà/nhà lưu trữ, ràng buộc một nhà và SSE chat.
- Edge headless chạy frontend production thật, đã thao tác mở thẳng nhà, vai trò, gửi/sửa chat, nhận tin qua SSE, tạo chi phí, đổi sang tài khoản người trả để ghi thanh toán, đổi về người nhận để xác nhận và chốt quyết toán. Sau khi rời nhà, tài khoản xem được khoản chi cũ và không có nút tạo khoản chi. Kiểm tra 1440/390/320 px không tràn ngang, không lỗi JavaScript. Ảnh kiểm tra lưu tại `.verification/phase7-*.png` (không đưa vào Git).
- Trình duyệt dùng tài khoản/nhà kiểm thử riêng được dọn sau chạy, frontend cổng 3107 và API cổng 5107; script chuyển địa chỉ API trong hồ sơ trình duyệt kiểm thử sang 5107. Các dịch vụ người dùng đang chạy tại 3000/5000 không bị dừng. Cuối đợt bổ sung media, API cổng 5000 đã nhận route attachment mới (trả 401 khi chưa đăng nhập); nếu chạy bản build cũ ở môi trường khác thì cần khởi động lại để nạp code mới.

## Bổ sung màu, media và responsive

- Migration `20261010120000_house_chat_media` đã deploy; đã generate Prisma Client và build lại backend/frontend.
- 30 kiểm thử HTTP/PostgreSQL trong house-chat, message-changes, communications đã qua. House-chat có thêm kiểm tra ảnh riêng tư/metadata, gửi đồng thời, audio-only, xóa file/retry, giả mạo/oversize, quyền tải sau khi rời và retry các tin văn bản lưu trước migration. Chạy lại riêng 8 ca house-chat sau bổ sung kiểm tra tương thích vẫn qua.
- Edge headless đã gửi/xem/phóng to/đóng ảnh, ghi âm bằng MediaRecorder với micro giả lập, tải được metadata của ghi âm từ API và gửi tệp ghi âm có sẵn. Chat cá nhân vẫn gửi được ảnh/ghi âm qua composer dùng chung. Tài khoản người trả/người nhận vẫn ghi nhận/xác nhận tiền được; màu dương/âm/0 đúng trạng thái.
- Kiểm tra 27 route ở 320, 390, 430, 768, 820, 1024, 1366, 1920 px; kiểm tra riêng chat có media cùng các kích thước đó. Không tràn ngang, không lỗi JavaScript. Khung lịch sử chat cao 200–320 px theo chiều cao viewport, toàn bộ khung rộng tối đa 920 px. Mobile composer đặt ô nhập trên hàng riêng, nút ảnh/micro/gửi 44 px. Modal ảnh nằm giữa viewport.
- Các route bao gồm trang chủ, auth, tìm phòng/người, đăng/chỉnh sửa/chi tiết tin, kết nối, tin nhắn, lịch hẹn, thông báo, tài khoản, Nhà chung/lịch sử và trang quản trị ở trạng thái quyền của tài khoản kiểm thử. Đây là kiểm tra bố cục với dữ liệu/trạng thái hiện có, không chứng minh mọi trạng thái nghiệp vụ hoặc mọi thiết bị vật lý.
- Chưa chạy Safari/iOS hoặc thiết bị iPad/điện thoại thật. Các kích thước tablet/điện thoại được giả lập trên Edge; khi trình duyệt không hỗ trợ ghi âm hoặc từ chối micro, người dùng vẫn có thể chọn tệp ghi âm.
- Ảnh chụp của đợt này tại `.verification/media-*.png`, script `.verification/phase7-media-browser.mjs`; dữ liệu kiểm thử được dọn sau mỗi lần chạy.

## Bổ sung bình chọn và gửi tệp

- Chat chung dùng nút **Tạo bình chọn** tại vị trí **Chọn ghi âm**. Nút micro và chọn ghi âm dự phòng khi micro không khả dụng vẫn hoạt động. Chat cá nhân giữ chọn ghi âm.
- Bình chọn có câu hỏi tối đa 200 ký tự và 2–10 phương án khác nhau, mỗi phương án tối đa 120 ký tự. Mỗi tài khoản có một phiếu, được đổi/bỏ khi còn mở. Người tạo được đóng; kết quả đã đóng vẫn hiển thị. Câu hỏi/phương án không sửa sau khi đăng. Phiếu đã gửi được giữ trong kết quả nếu thành viên rời nhà; người đã rời không thể tiếp tục đọc/thao tác.
- Bình chọn là một tin trong lịch sử chat, dùng cùng số thứ tự/clientId, giới hạn gửi và SSE. Gửi lại không tạo trùng hoặc khôi phục bình chọn đã xóa. Tăng phiên bản tin sau thay đổi phiếu/đóng để tránh kết quả cũ ghi đè kết quả mới. Khóa hàng nhà đồng bộ với việc rời nhà, bỏ phiếu, đóng và xóa; ràng buộc PostgreSQL ngăn phiếu trùng hoặc dùng phương án của bình chọn khác.
- API chỉ trả tổng phiếu, số phiếu mỗi phương án và lựa chọn của người đang xem; không trả danh tính người bỏ phiếu khác. Chỉ thành viên hiện tại được tạo/bỏ phiếu; chỉ người gửi được xóa tin, xóa cả phương án/phiếu.
- Cả hai loại chat có nút kẹp giấy **Gửi tệp**, danh sách tên/dung lượng trước khi gửi, bỏ tệp đã chọn và liên kết tải trong tin. Gửi tệp không cần kèm văn bản. Hộp thư cá nhân nhận diện tin có tệp. Tối đa 4 tệp/tin, tổng ảnh/ghi âm/tệp sau xử lý không quá 5 MB; tệp rỗng bị từ chối.
- Giữ tên tiếng Việt, bỏ đường dẫn/ký tự điều khiển, giới hạn tên 255 ký tự. Tệp nguyên bản lưu riêng trong PostgreSQL và tải bằng `application/octet-stream`, `Content-Disposition: attachment` với tên UTF-8, `nosniff`, `private, no-store`. Kiểm tra quyền cuộc chat và tin chưa xóa trước khi trả dữ liệu. Tên/nội dung tệp tham gia kiểm tra clientId; các hash tin ảnh/ghi âm cũ được giữ tương thích. Xóa tin xóa dữ liệu tệp; chặn liên hệ/rời nhà thu hồi quyền tải tương ứng.
- Xử lý lỗi Multer còn sót theo mã lỗi tại hai endpoint gửi tin: quá số tệp trả 400, quá kích thước trả 413, tránh 500 khi phiên bản thư viện đổi thông báo lỗi.
- Đã generate Prisma Client, deploy `20261010140000_chat_files_house_polls` bằng `prisma migrate deploy`, không reset dữ liệu. Build backend/frontend, TypeScript, lint qua. 40 kiểm thử HTTP/PostgreSQL trong chat-features, house-chat, message-changes, communications qua; gồm gửi đồng thời, đổi/bỏ phiếu, đóng/vote đồng thời, tombstone/retry, SSE thật, tải tệp riêng tư/tên UTF-8/nội dung, giới hạn và thu hồi quyền.
- Edge headless chạy bản production thật: tạo/thêm/bỏ phương án, bỏ/đổi phiếu, cập nhật từ người khác qua SSE, đóng bình chọn; gửi tệp không có văn bản và tải thực tế ở cả hai loại chat, tên tiếng Việt và bytes trùng bản gốc; hộp thư hiển thị đúng tin có tệp. Không lỗi JavaScript. Kiểm tra form/kết quả bình chọn, tệp đã chọn và tin có tệp ở 320/390/430/768/820/1024/1366/1920 px không tràn ngang. Chưa chạy Safari/iOS hoặc thiết bị thật.
- Script/ảnh tại `.verification/phase7-files-polls-browser.mjs`, `.verification/polls-*.png`; dùng tài khoản/nhà riêng và dọn dữ liệu sau chạy.

## Tách service chi phí và làm rõ nút thêm tệp

- Nút tệp của composer dùng chung có chữ **Thêm tệp** trên thanh công cụ thay biểu tượng đơn lẻ dưới ô nhập; hiện ở cả chat cá nhân và chat chung. Giữ xem trước/bỏ tệp, gửi không cần văn bản và tải tệp với tên tiếng Việt. Toolbar tự xuống dòng trên màn hình nhỏ.
- `expenses.service.ts` còn khoảng 250 dòng, phụ trách khoản chi. Tách người tham gia, số dư/quyết toán, thanh toán và biên nhận thành bốn service riêng. Quyền/phiên bản/thanh toán chờ dùng `ExpenseAccessService`; lịch sử/SSE dùng `ExpenseEventsService`; mapping response/select dùng hàm thuần trong `expense-views.ts`. Chi tiết trách nhiệm tại `backend/src/modules/expenses/README.md`.
- Controller gọi service tương ứng, không thêm lớp chuyển tiếp hoặc phụ thuộc vòng. Giữ nguyên API, schema, quy tắc tính tiền, phạm vi transaction và thứ tự khóa nhà. Đối chiếu 28 thân hàm cũ sau chuyển chỗ/đổi tên dependency không phát hiện thay đổi nghiệp vụ.
- 28 kiểm thử HTTP/PostgreSQL của expenses, houses, chat-features qua; backend/frontend production build, TypeScript và lint qua. Edge đã bấm **Thêm tệp** để mở trình chọn tệp ở cả hai loại chat, gửi tệp không kèm văn bản, tải thực tế đúng tên/nội dung; kiểm tra toolbar và tin có tệp tại 320–1920 px không tràn ngang, không lỗi JavaScript.
- Đã kiểm tra lại nút thêm tệp/gửi/tải và bình chọn trên ứng dụng đang chạy tại 3000/5000, với tài khoản kiểm thử riêng đã dọn. Trên bản production tại 3107/5107, trình duyệt cũng đã tạo khoản chi chia lẻ, ghi thanh toán chờ, xác nhận nhận tiền, chốt quyết toán và xem lịch sử sau khi rời nhà; 27 route được kiểm tra ở 8 kích thước màn hình, không tràn ngang hoặc lỗi JavaScript.
