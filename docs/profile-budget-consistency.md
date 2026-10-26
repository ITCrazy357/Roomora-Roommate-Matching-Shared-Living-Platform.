# Ngân sách hồ sơ và cập nhật đồng thời

`PATCH /api/v1/profiles/me` khóa bản ghi `profiles` trong transaction trước khi
đọc hai cận ngân sách, kiểm tra và cập nhật. Hai yêu cầu sửa riêng `budgetMin`
và `budgetMax` sẽ lần lượt kiểm tra trên dữ liệu mới nhất. Nếu yêu cầu sau làm
cận dưới lớn hơn cận trên, API trả `400 BUDGET_RANGE_INVALID` và không lưu các
trường khác của yêu cầu đó. Các chỉnh sửa độc lập vẫn có thể cùng thành công.

Hai cận được phép bằng nhau. `null` biểu thị chưa đặt cận và vẫn được chấp nhận.
Không giữ transaction trong lúc tải ảnh hoặc gọi dịch vụ bên ngoài.

## Triển khai

Sao lưu database theo [runbook vận hành](operations.md), rồi kiểm tra số hồ sơ
đang có khoảng ngân sách sai:

```sql
SELECT count(*) AS invalid_budget_count
FROM profiles
WHERE budget_min > budget_max;
```

Nếu kết quả khác 0, đối chiếu và sửa từng hồ sơ theo giá trị đã được xác nhận.
Không tự đổi thứ tự hai cận, đặt một cận thành `null` hay xóa hồ sơ để vượt qua
migration. Bản vá không thể suy ra ngân sách người dùng thực sự muốn đặt.

Sau khi dữ liệu hợp lệ, chạy trong `backend` với cấu hình database triển khai:

```powershell
npm run prisma:migrate:deploy -- --config prisma7.config.ts
```

- `20261026110000_profile_budget_range_check` thêm CHECK
  `profiles_budget_range_valid` với `NOT VALID`, chặn các ghi mới sai mà không
  quét hoặc sửa dữ liệu cũ.
- `20261026110100_validate_profile_budget_range` xác nhận dữ liệu đã lưu phù hợp
  với ràng buộc; bước này thất bại nếu vẫn còn khoảng sai.

Nếu validation thất bại, giữ CHECK đã thêm, đối chiếu dữ liệu và xử lý migration
thất bại theo quy trình Prisma trước khi thử lại. Không đánh dấu migration đã
hoàn thành khi ràng buộc chưa được validate. Khi rollback ứng dụng, giữ CHECK;
mọi thay đổi schema tiếp theo phải qua migration mới.

## Kiểm chứng local ngày 26/10/2026

PostgreSQL 17 test riêng đã chạy 48 migration nền, sau đó nâng cấp bằng hai
migration mới. Ca HTTP chạy đồng thời được tái hiện thất bại trước bản vá và qua
sau bản vá: `[200, 200]` thành `[200, 400]`. Bộ profile budget/auth-profile/avatar/
people có 25 test qua, gồm SQL ghi trực tiếp bị chặn và thử migration trên bảng
tạm có ngân sách cũ sai. Bảng tạm được rollback sau kiểm thử; không sửa database
ứng dụng. Kết quả này là kiểm chứng local, không phải bằng chứng triển khai.
