# Chi phí và công nợ

Các route vẫn được khai báo trong `expenses.controller.ts`. Controller gọi trực tiếp service phụ trách nghiệp vụ; module đăng ký các provider trong `expenses.module.ts`.

| File                              | Trách nhiệm                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `expenses.service.ts`             | Tạo, sửa, hủy, liệt kê khoản chi và đọc lịch sử điều chỉnh.                                           |
| `expense-participants.service.ts` | Danh sách người tham gia, thêm/rời người ngoài app và danh sách nhà trong lịch sử công nợ.            |
| `expense-balances.service.ts`     | Tính số dư, gợi ý chuyển tiền và chốt quyết toán.                                                     |
| `expense-payments.service.ts`     | Ghi thanh toán, xác nhận, từ chối, hủy và đọc danh sách thanh toán.                                   |
| `expense-receipts.service.ts`     | Xử lý, lưu và đọc ảnh biên nhận riêng tư.                                                             |
| `expense-access.service.ts`       | Đọc khoản chi theo quyền hiện tại/lịch sử, kiểm tra người được sửa, phiên bản và thanh toán đang chờ. |
| `expense-events.service.ts`       | Ghi lịch sử trước/sau và phát tín hiệu SSE trong transaction.                                         |
| `expense-views.ts`                | Các Prisma select/include và hàm tạo dữ liệu trả về, dùng chung giữa service.                         |
| `expense-calculations.ts`         | Chia tiền VNĐ nguyên và tính gợi ý bù trừ.                                                            |

Các thao tác ghi giữ transaction và khóa hàng nhà bằng `HouseAccessService.lock` trước khi kiểm tra lại quyền. Truyền cùng `tx` cho các service dùng chung, gồm `ExpenseBalancesService.calculate`, để số dư, giữ chỗ thanh toán, lịch sử và SSE được xử lý cùng transaction. Giữ nguyên clientId, phiên bản và hash nội dung khi retry; phần tách service không thay đổi API hoặc schema.
