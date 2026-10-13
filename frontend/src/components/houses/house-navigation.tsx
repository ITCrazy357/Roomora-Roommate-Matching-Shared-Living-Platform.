"use client";

import Link from "next/link";
import { Select } from "../ui";
import { HouseholdIcon, type HouseholdIconName } from "./household-ui";

export type HouseTab =
  | "overview"
  | "members"
  | "info"
  | "chat"
  | "expenses"
  | "balances"
  | "sharing"
  | "chores"
  | "shopping"
  | "recurring"
  | "reports";
const groups: {
  label: string;
  items: { key: HouseTab; label: string; icon: HouseholdIconName }[];
}[] = [
  {
    label: "Không gian chung",
    items: [
      { key: "overview", label: "Tổng quan", icon: "report" },
      { key: "chat", label: "Chat chung", icon: "people" },
    ],
  },
  {
    label: "Chi tiêu",
    items: [
      { key: "expenses", label: "Chi phí", icon: "wallet" },
      { key: "balances", label: "Công nợ & Quyết toán", icon: "check" },
      { key: "recurring", label: "Chi phí định kỳ", icon: "calendar" },
      { key: "sharing", label: "Thống nhất chia phí", icon: "people" },
      { key: "reports", label: "Báo cáo", icon: "report" },
    ],
  },
  {
    label: "Sinh hoạt",
    items: [
      { key: "chores", label: "Việc nhà", icon: "chores" },
      { key: "shopping", label: "Mua chung", icon: "shopping" },
    ],
  },
  {
    label: "Nhà của bạn",
    items: [
      { key: "members", label: "Thành viên", icon: "people" },
      { key: "info", label: "Thông tin nhà", icon: "home" },
    ],
  },
];

export function HouseNavigation({
  tab,
  onTab,
}: {
  tab: HouseTab;
  onTab: (tab: HouseTab) => void;
}) {
  return (
    <>
      <div className="house-mobile-navigation">
        <Select
          id="house-section"
          label="Mục quản lý nhà"
          value={tab}
          onChange={(event) => onTab(event.target.value as HouseTab)}
        >
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      <aside className="house-sidebar">
        <nav aria-label="Quản lý nhà chung">
          {groups.map((group) => (
            <div className="house-nav-group" key={group.label}>
              <span className="house-nav-label">{group.label}</span>
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  aria-current={tab === item.key ? "page" : undefined}
                  onClick={() => onTab(item.key)}
                >
                  <HouseholdIcon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <Link className="house-history-link" href="/nha-chung/lich-su">
          <HouseholdIcon name="clock" /> Lịch sử công nợ ↗
        </Link>
      </aside>
    </>
  );
}
