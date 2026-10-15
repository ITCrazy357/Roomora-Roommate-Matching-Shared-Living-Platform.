"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { adminLinks } from "@/lib/admin";
import { ListingAccess } from "../listings/listing-access";
import { useAdminPage } from "./admin-shared";
import { AdminOverview, type AdminSummary } from "./admin-overview";
import { HouseholdIcon, type HouseholdIconName } from "../houses/household-ui";

const navigation = [
  {
    href: "/admin/tong-quan",
    label: "Tổng quan",
    hint: "Giao dịch và kết quả xử lý",
  },
  ...adminLinks,
];
const icons: HouseholdIconName[] = [
  "report",
  "home",
  "people",
  "chores",
  "people",
  "calendar",
  "wallet",
  "chores",
  "wallet",
  "report",
];

function Workspace({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [month, setMonth] = useState(() =>
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7),
  );
  const { data, error, reload } = useAdminPage<AdminSummary>(
    `/admin/summary?month=${month}`,
  );
  return (
    <div className="container admin-workspace">
      <aside className="admin-sidebar">
        <div className="admin-workspace-label">
          <span className="dashboard-small-dot" aria-hidden="true" /> Không gian
          quản trị
        </div>
        <nav aria-label="Chức năng quản trị">
          {navigation.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={path === link.href ? "page" : undefined}
            >
              <HouseholdIcon name={icons[index]} />
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
        <AdminOverview
          data={data}
          reload={reload}
          expanded={path === "/admin/tong-quan"}
          month={month}
          onMonth={setMonth}
        />
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
