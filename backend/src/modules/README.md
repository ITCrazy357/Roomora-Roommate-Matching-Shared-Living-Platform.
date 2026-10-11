# Cấu trúc service

Các service lớn dùng một service chính làm đầu mối cho controller. Service chính inject các service phụ qua constructor và chuyển lời gọi đến đúng nhiệm vụ. Mỗi service phụ giữ phần xử lý của nhiệm vụ đó.

```text
Controller → Service chính → Service phụ → Prisma / service dùng chung
```

| Service chính          | Service phụ theo nhiệm vụ                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExpensesService`      | `ExpenseRecordsService`, `ExpenseCorrectionsService` (điều chỉnh sau chốt), `ExpenseParticipantsService`, `ExpenseBalancesService`, `ExpensePaymentsService`, `ExpenseReceiptsService`, `ExpensePromisesService` |
| `AuthService`          | `AuthAccountsService` (đăng ký/đăng nhập/tài khoản), `AuthVerificationService` (xác minh email), `AuthRecoveryService` (khôi phục mật khẩu), `SessionService` (phiên đăng nhập) |
| `HousesService`        | `HouseDetailsService` (thông tin nhà), `HouseMembershipsService` (tạo/chuyển trưởng nhà/rời nhà), `HouseInvitesService` (lời mời), `HouseAnnouncementsService` (thông báo nhà)  |
| `HouseChatService`     | `HouseChatMessagesService` (tin nhắn/tệp), `HouseChatPollsService` (bình chọn)                                                                                                  |
| `ConversationsService` | `ConversationQueriesService` (danh sách/chi tiết hội thoại), `ConversationMessagesService` (tin nhắn/tệp/đã đọc/đang gõ), `ConversationAppointmentsService` (lịch hẹn)          |
| `PeopleService`        | `PeopleDiscoveryService` (tìm/xem người), `PeopleConnectionsService` (kết nối), `PeopleSafetyService` (chặn/báo cáo)                                                            |
| `ListingsService`      | `ListingQueriesService` (đọc/tìm/lọc), `ListingManagementService` (tạo/sửa/trạng thái/kiểm duyệt/lưu tin), `ListingPhotosService` (ảnh tin đăng)                                |
| `HouseholdService`     | `HouseActivitiesService`, `RecurringRulesService`, `RecurringDraftsService`, `HouseReportsService`; worker `RecurringSchedulerService` do Nest quản lý vòng đời. |

Các phần dùng chung giữ trong service phụ trợ: `AuthSupportService`, `HouseMembershipAccessService`, `ConversationAccessService`, `PeopleAccessService`, `PeopleViewsService`, `ListingRulesService` và các service quyền/lịch sử/nhắc nợ của expenses. Các file `*-views.ts` chứa select/include và kiểu dữ liệu dùng chung. Chat chung dùng lại phần dựng response, phát sự kiện và giới hạn gửi của `HouseChatMessagesService` cho bình chọn.

Service phụ có thể inject service phụ khác khi cần dùng lại một nhiệm vụ hoặc kiểm tra chung; không inject ngược service chính. Giữ nguyên transaction, thứ tự khóa, kiểm tra quyền/phiên bản, hash retry, response, thông báo và vòng đời worker. Không tạo thêm transaction ở service chính chỉ để chuyển lời gọi.

Các service đã có nhiệm vụ rõ như profile, locations, cloudinary, mail, password, session, Google OAuth, notifications và updates giữ nguyên. `GoogleAuthService` là đầu mối riêng cho các route Google và tiếp tục dùng giới hạn truy cập chung qua `AuthService`. Notifications và updates giữ đầu mối riêng cho thông báo/SSE trong `CommunicationsController`.

Chi tiết chi phí và công nợ: [expenses/README.md](expenses/README.md).
Chi tiết sinh hoạt và báo cáo: [household/README.md](household/README.md).
Thống nhất cách chia chi phí tháng: [cost-sharing/README.md](cost-sharing/README.md), facade `CostSharingService` gọi `CostSharingPeriodsService`, `CostSharingBallotsService`, `CostSharingRulesService`; scheduler do Nest quản lý.
