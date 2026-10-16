# Đổi credential đã lộ của Roomora

Đã xác nhận trong hội thoại: credential PostgreSQL Render và
`IDENTITY_ENCRYPTION_KEY` production đã lộ. Cả hai cần được thay thế. Mật khẩu
`roomora@123456` là mật khẩu tài khoản demo theo yêu cầu, không dùng cho tài khoản
thật, admin, database hoặc tài khoản nhà cung cấp.

Dữ liệu demo đã cập nhật thật. Chủ dự án đã chuyển credential DB sang user mới;
khóa mã hóa danh tính production chưa được công cụ này xoay.

## 1. Đổi credential PostgreSQL trước

1. Render Dashboard → database → **Info → Credentials** → **+ New default
   credential → Create Credential**. Render tạo username/password mới.
2. `Roomora-api → Environment`: thay `DATABASE_URL` bằng URL mới cùng loại đang
   dùng. Internal URL dùng cho dịch vụ cùng region; nếu đang dùng External URL,
   lấy External URL mới. Lưu và deploy với cấu hình mới.
3. Chuyển mọi app khác, worker, máy local và Prisma Studio đang nối cùng DB sang
   credential mới. Đóng/mở Studio và restart các tiến trình để bỏ kết nối cũ.
4. Kiểm tra backend đọc DB và đăng nhập được. Về **Credentials** xóa credential
   cũ sau khi tất cả kết nối đã chuyển. Tạo credential mới chưa thu hồi cái cũ.
   Không xóa database.

Internal/External URL dùng chung credential của PostgreSQL. Đổi tên biến local
hoặc đổi riêng chuỗi URL không thu hồi mật khẩu đã lộ. Với Blueprint tham chiếu
connection string, cần sync Blueprint; với biến khai báo thủ công phải tự thay.

Nguồn: [Render credential rotations](https://render.com/docs/postgresql-credentials),
[Render environment variables](https://render.com/docs/configure-environment-variables).

Trong Git Bash, bỏ biến cũ đang che `.env`:

```bash
unset DATABASE_URL EXTERNAL_DATABASE_URL
```

Nếu chạy thao tác production từ local, nhập **External URL mới** vào biến chỉ
có hiệu lực trong terminal đó, tránh thay URL dev trong file:

```bash
read -r -s -p "External Database URL moi: " DATABASE_URL
```

Dán URL khi được hỏi, nhấn Enter, sau đó:

```bash
echo
export DATABASE_URL
```

## 2. Những nơi dùng IDENTITY_ENCRYPTION_KEY

Theo mã nguồn hiện tại, đây là khóa AES-256-GCM **của backend Roomora**, không phải
key do Google, Brevo, Cloudinary hay Render tự cung cấp. Khóa gắn với dữ liệu hồ
sơ trong `identity_declarations.encrypted_data`.

| Nơi | Cần làm gì |
| --- | --- |
| Render → Roomora-api → Environment | Đặt khóa mới sau khi mã hóa lại DB; deploy backend bằng cấu hình mới. |
| Render Environment Group | Nếu biến đến từ group, cập nhật group và mọi service dùng cùng DB đó. |
| Backend/worker instance khác cùng DB production | Tất cả phải dùng cùng khóa mới trước khi cho chạy trở lại. |
| `backend/.env` local | Chỉ đổi theo production nếu local đang xử lý cùng DB production. DB dev riêng cần khóa của chính DB dev, không được đổi nhầm. |
| Docker/VPS dùng `compose.deploy.yml` | Nếu thực sự đang triển khai vào cùng DB: cập nhật file `ROOMORA_ENV_FILE` (mặc định `deploy/roomora.env`) rồi tạo lại container API/migrate. |
| Script bảo trì, secret store, bản sao cấu hình | Cập nhật khóa mới nếu công cụ đọc cùng DB; không giữ bản sao khóa cũ không cần thiết. |
| Vercel frontend | Không cần khóa này. Nếu đã thêm ở Vercel thì xóa; tuyệt đối không đặt thành `NEXT_PUBLIC_*`. |
| Google Cloud / Brevo / Cloudinary | Không dùng khóa này, không có trường tương ứng để đổi ở những nền tảng đó. |
| Render PostgreSQL / Prisma Studio | Không cần khóa AES để kết nối; chỉ cần DB credential mới. Studio thấy ciphertext, không tự giải mã danh tính. |
| GitHub Actions CI | CI hiện dùng DB test và helper tạo khóa test riêng; không đưa khóa production vào CI. Nếu trước đó tự lưu bản sao trong GitHub Secrets thì xóa hoặc cập nhật nơi dùng thật. |

Danh sách này được đối chiếu với source/config local. Không phải kết quả kiểm
toán mọi biến bạn đã tự thêm trong dashboard các nhà cung cấp.

## 3. Xoay khóa danh tính mà giữ nguyên hồ sơ

**Không chỉ thay biến trên Render rồi deploy.** Backend hiện giải mã bằng một
khóa; hồ sơ mã hóa bằng khóa cũ sẽ không đọc được bằng khóa mới. Cần mã hóa lại
trước, trong khoảng thời gian toàn bộ backend ghi DB này được dừng.

Đã có công cụ bảo trì `backend/scripts/rotate-identity-key.mjs` và test PostgreSQL
riêng. Công cụ không xóa/nộp lại/duyệt lại hồ sơ: chỉ cập nhật ciphertext, giữ
nguyên version, trạng thái, reviewer và timestamps. Lỗi một hồ sơ sẽ rollback
cả transaction. Chạy lại với cùng cặp khóa sẽ nhận ra hồ sơ đã đổi khóa.

### Chuẩn bị từ Git Bash

Từ thư mục `backend`, build code rồi tạo khóa mới vào file được Git bỏ qua.
Công cụ không in khóa ra terminal. File đã tồn tại thì dừng, không ghi đè:

```bash
npm run build
npm run identity:rotate-key -- --generate-key
```

Khóa mới nằm tại `.verification/identity-key-next.txt` ở thư mục gốc repo.
Giữ file trong nơi riêng tư. Chưa thay bất kỳ biến nào trên Render ở bước này.

Đặt `DATABASE_URL` bằng **External URL mới** theo bước 1. Nhập khóa production
**hiện tại** lấy từ Render, không lấy khóa dev khác trong `.env`:

```bash
read -r -s -p "IDENTITY_ENCRYPTION_KEY hien tai tren Render: " IDENTITY_OLD_KEY
```

Nhập xong, nhấn Enter, rồi chạy:

```bash
echo
export IDENTITY_OLD_KEY
npm run identity:rotate-key -- --preview
```

Preview phải giải mã được **tất cả** hồ sơ. Nó chưa ghi DB. Nếu một hồ sơ sai
khóa, dừng để kiểm tra; không bỏ qua hồ sơ và không xóa dữ liệu cho qua lỗi.

Nếu lỗi định dạng hoặc hai khóa trùng nhau, chạy chẩn đoán không kết nối DB,
không in giá trị khóa:

```bash
npm run identity:rotate-key -- --check-keys
```

`oldKey.validHex64` và `newKey.validHex64` phải là `true`, `sameKey` phải là
`false`. `oldKey.present: false` nghĩa là Node chưa nhận biến `IDENTITY_OLD_KEY`;
cần export trong đúng terminal. `newKeySource` cho biết khóa mới đang lấy từ
biến `IDENTITY_NEW_KEY` hay file được tạo. Xóa override không mong muốn bằng
`unset IDENTITY_NEW_KEY`. Dán khóa không kèm tên biến hoặc dấu nháy.

Nếu gặp P1017 (kết nối bị đóng), không suy ra rằng transaction chắc chắn đã
rollback. Giữ nguyên hai khóa, giữ backend dừng nếu đã chạy `--apply`, rồi kiểm
tra kết nối chỉ đọc từ đúng terminal đang dùng:

```bash
npm run identity:rotate-key -- --check-db
```

Lệnh không cần khóa danh tính, chỉ in hostname/database/username/SSL mode và
chạy SELECT để kiểm tra đăng nhập. Từ local cần External URL của credential mới;
không dùng URL của credential đã xóa hoặc Internal hostname. External Render
URL thiếu `sslmode` sẽ được công cụ bổ sung `verify-full` cho lần chạy đó, không
sửa `.env`. Khi kết nối ổn, chạy lại `--preview`: `alreadyNew` cho biết số hồ sơ
đã dùng khóa mới, `wouldRotate` là số hồ sơ còn dùng khóa cũ. Nếu preview lỗi,
không bật backend hoặc tạo cặp khóa khác để thử.

### Áp dụng trong thời gian tạm dừng backend

1. Sao lưu DB an toàn và lưu cặp khóa phục vụ khôi phục trong nơi riêng tư.
2. **Dừng mọi backend/worker đang ghi cùng DB**, gồm Roomora-api trên Render và
   backend local nếu đang trỏ production. Dùng Suspend/Resume của dịch vụ hoặc
   phương thức dừng instance tương đương; xác nhận không còn tiến trình ghi.
   Dừng frontend hoặc đổi banner không dừng được API/worker. Trong danh sách
   service của Render có thể chọn checkbox của **Roomora-api**, rồi chọn
   **Suspend**; không suspend database. Sau khi đổi khóa/cấu hình xong mới Resume.
   [Thao tác Suspend/Resume chính thức](https://render.com/changelog/suspend-and-resume-services-in-bulk-from-the-render-dashboard).
3. Chỉ sau khi backend thực sự dừng, chạy:

```bash
npm run identity:rotate-key -- --backup
```

Lệnh backup chỉ sao chép `userId` và ciphertext vào
`.verification/identity-before-rotation-....json`, không xuất thông tin danh tính
dạng rõ và không thay DB. Giữ file riêng tư cùng khóa cũ để dự phòng; đây là backup
riêng phần mã hóa danh tính, không thay thế backup toàn bộ DB. Kiểm tra `backedUp`
khớp `total` của preview. Sau đó mới chạy:

```bash
export IDENTITY_ROTATION_BACKEND_STOPPED=true
npm run identity:rotate-key -- --apply
```

4. Sau khi báo `applied`, **giữ backend dừng**. Mở file khóa mới tại
   `.verification/identity-key-next.txt`, chép giá trị vào
   `Roomora-api → Environment → IDENTITY_ENCRYPTION_KEY` và mọi nơi cùng DB trong
   bảng trên. Lưu và deploy/resume với cấu hình mới. Không chỉ Restart bản deploy
   cũ nếu thao tác đó vẫn dùng bộ biến cũ.
5. Đăng nhập, mở `/tai-khoan/danh-tinh` của hồ sơ đã có và kiểm tra admin xem hồ
   sơ; xác nhận hồ sơ cũ đọc được. Không kiểm tra bằng cách nộp lại để ghi đè hồ sơ.
6. Cất khóa mới cùng bản sao lưu được bảo vệ; dọn bản sao tạm. Khóa cũ chỉ giữ ở
   nơi hạn chế truy cập nếu còn cần giải mã backup cũ hoặc rollback. Sau khi
   không còn nhu cầu thì loại bỏ. Xoay khóa không thu hồi được dữ liệu/backup mà
   người khác đã lấy kèm khóa cũ trước đó.

`IDENTITY_ROTATION_BACKEND_STOPPED=true` là xác nhận của người vận hành, công cụ
không tự dừng hoặc kiểm chứng trạng thái dịch vụ trên Render. Render Free không
có tính năng Maintenance Mode trả phí; không dựa vào chế độ đó cho quy trình này.
[Render Maintenance Mode](https://render.com/docs/maintenance-mode).

Nếu DB đã đổi khóa nhưng chưa thể khởi động app bằng khóa mới, giữ app dừng.
Có thể rollback bằng công cụ với `IDENTITY_OLD_KEY` = khóa mới và
`IDENTITY_NEW_KEY` = khóa cũ, rồi `--apply`; chỉ bật lại app sau khi khóa khớp DB.
Không khôi phục cả DB chỉ để đổi khóa, vì có thể mất các giao dịch khác.

Xong thì đóng terminal, hoặc:

```bash
unset DATABASE_URL IDENTITY_OLD_KEY IDENTITY_NEW_KEY IDENTITY_ROTATION_BACKEND_STOPPED
```

Kiểm thử công cụ chỉ chạy trên DB PostgreSQL riêng, tên chính xác
`roomora_identity_rotation_test`, host localhost. Test xóa schema `public` của
DB test này rồi áp dụng migration, không được dùng DB ứng dụng:

```bash
export IDENTITY_ROTATION_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:55439/roomora_identity_rotation_test'
npm run test:identity-key-rotation
unset IDENTITY_ROTATION_TEST_DATABASE_URL
```

## 4. Những secret khác — chỉ đổi nếu chính giá trị đó cũng bị lộ

Chưa có bằng chứng trong nội dung đã kiểm tra rằng các khóa dưới đây đã lộ.
Nếu bạn đã chụp cả `.env`, gửi log chứa giá trị hoặc dùng chung mật khẩu đã lộ,
hãy đổi tại nơi phát hành và cập nhật backend cùng lúc:

| Secret | Nơi thu hồi/tạo mới | Nơi cập nhật của Roomora |
| --- | --- | --- |
| `SMTP_PASSWORD` (Brevo SMTP key) | Brevo → SMTP & API, thay SMTP key đã lộ | Render backend và local nếu dùng cùng key; không phải đổi mật khẩu Gmail chỉ vì SMTP key lộ. |
| `GOOGLE_CLIENT_SECRET` | Google Cloud → OAuth client của ứng dụng | Render backend và local dùng cùng client. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary → API credentials | Render backend và mọi công cụ upload dùng cùng credential. Ảnh Cloudinary demo đã upload không phụ thuộc file seed local. |
| `REDIS_URL` | Nhà cung cấp Redis/Render Key Value | Mọi app đang dùng cùng Redis; nếu chia sẻ với project khác thì cập nhật cả project đó. |
| `OPENAI_API_KEY` | OpenAI project chứa API key | Các backend dùng cùng key, không đưa lên frontend. |
| `PAYOS_API_KEY` / `PAYOS_CHECKSUM_KEY`, `MOMO_SECRET_KEY` | Dashboard cổng thanh toán tương ứng | Mọi backend/webhook dùng cùng tài khoản cấu hình. |
| `AUTH_OTP_SECRET` | Tự tạo chuỗi ngẫu nhiên mới | Mọi backend instance; OTP cũ chưa hết hạn sẽ không còn hợp lệ, người dùng cần xin mã mới. |
| Mật khẩu admin/user thật dùng lại mật khẩu đã lộ | Chức năng đổi/đặt lại mật khẩu của ứng dụng | Đăng xuất các phiên đang mở của tài khoản đó. |

Không có một thao tác đổi `IDENTITY_ENCRYPTION_KEY` nào tự đổi các secret trên.
Không dùng khóa mới lại ở nhiều project/nhà cung cấp khác nhau.
