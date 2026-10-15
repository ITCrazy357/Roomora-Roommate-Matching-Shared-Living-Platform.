"use client";
import Link from "next/link";
import type { IdentityRecord } from "@/lib/identity";
import { useAdminPage } from "../admin/admin-shared";
import { IdentityBadge } from "./identity-badge";

export function IdentityNotice() {
  const { data, error } = useAdminPage<{ declaration: IdentityRecord | null }>(
    "/identity/status",
  );
  return (
    <div className="listing-privacy">
      {data !== undefined && (
        <IdentityBadge status={data.declaration?.status} />
      )}
      <p>
        {error
          ? "Chưa tải được trạng thái khai báo."
          : "Cần nộp đủ hồ sơ demo trước khi tạo/vào nhà chung hoặc gửi tin cho thuê. Bạn có thể tiếp tục ngay sau khi nộp, không cần chờ duyệt."}
      </p>
      <Link className="text-link" href="/tai-khoan/danh-tinh">
        {data?.declaration
          ? "Xem / cập nhật hồ sơ khai báo"
          : "Khai báo hồ sơ demo"}{" "}
        →
      </Link>
    </div>
  );
}
