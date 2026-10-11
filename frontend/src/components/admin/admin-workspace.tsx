"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminLinks } from "@/lib/admin";
import { ListingAccess } from "../listings/listing-access";
import { useAdminPage } from "./admin-shared";

function Workspace({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data, error, reload } = useAdminPage<{
    pendingListings: number;
    openReports: number;
    lockedUsers: number;
    activeAnnouncements: number;
  }>("/admin/summary");
  const counts = [
    data?.pendingListings,
    data?.lockedUsers,
    data?.openReports,
    data?.activeAnnouncements,
  ];
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
        <div className="admin-overview" aria-label="Tình hình vận hành">
          {adminLinks.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              className={`admin-stat admin-stat-${index}`}
            >
              <span>
                {
                  [
                    "Tin chờ duyệt",
                    "Tài khoản bị khóa",
                    "Báo cáo chờ xử lý",
                    "Thông báo đang phát",
                  ][index]
                }
              </span>
              <strong>{counts[index] ?? "—"}</strong>
              <small>
                {index === 0
                  ? "Ưu tiên xử lý"
                  : index === 1
                    ? "Xem và kiểm tra vi phạm"
                    : index === 2
                      ? "Xem bằng chứng và phản hồi"
                      : "Hiển thị trên toàn hệ thống"}
              </small>
            </Link>
          ))}
        </div>
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
