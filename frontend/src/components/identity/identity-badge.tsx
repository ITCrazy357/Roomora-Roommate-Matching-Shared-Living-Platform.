import { identityStatuses, type IdentityStatus } from "@/lib/identity";
import { ProfileIcon } from "../profile-icon";

export function IdentityBadge({ status }: { status?: IdentityStatus | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-sm text-muted"
      title="Hồ sơ tự khai phục vụ demo, chưa xác thực qua RAR. Không bảo đảm khả năng thanh toán hoặc an toàn giao dịch."
    >
      <ProfileIcon
        name={status === "APPROVED" ? "check" : "shield"}
        width={16}
        height={16}
        aria-hidden="true"
      />
      {status ? identityStatuses[status] : "Chưa khai báo danh tính"}
    </span>
  );
}
