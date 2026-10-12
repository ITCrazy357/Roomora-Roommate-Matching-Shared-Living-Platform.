"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminLinks } from "@/lib/admin";
import { ListingAccess } from "../listings/listing-access";
import { useAdminPage } from "./admin-shared";
import { AdminOverview, type AdminSummary } from "./admin-overview";

function Workspace({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data, error, reload } = useAdminPage<AdminSummary>("/admin/summary");
  return (
    <div className="container admin-workspace">
      <aside className="admin-sidebar">
        <span className="eyebrow">ROOMORA ADMIN</span>
        <h2>
          Vận hành
          <br />& kiểm duyệt
        </h2>
        <p>
          Giữ cộng đồng an toàn,
          <br />
          thông tin rõ ràng.
        </p>
        <nav aria-label="Chức năng quản trị">
          {adminLinks.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={path === link.href ? "page" : undefined}
            >
              <span className="admin-nav-number" aria-hidden="true">
                0{index + 1}
              </span>
              <span>
                {link.label}
                <small>{link.hint}</small>
              </span>
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-note">
          Mỗi quyết định xử lý đều được lưu lịch sử để kiểm tra lại.
        </div>
        <Link className="admin-security-link" href="/admin/tai-khoan">
          Bảo mật tài khoản ↗
        </Link>
      </aside>
      <div className="admin-content">
        <AdminOverview data={data} reload={reload} />
        {error && (
          <p className="error-state" role="alert">
            {error}{" "}
            <button type="button" className="nav-button" onClick={reload}>
              Tải lại số liệu
            </button>
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
export function AdminWorkspace({ children }: { children: React.ReactNode }) {
  return (
    <ListingAccess admin>
      <Workspace>{children}</Workspace>
    </ListingAccess>
  );
}
