"use client";

import Link from "next/link";
import { money } from "@/lib/expenses";
import { Card, Input } from "../ui";
import { HouseholdIcon } from "../houses/household-ui";
import { AdminResults } from "./admin-results";

export interface AdminSummary {
  pendingListings: number;
  openReports: number;
  lockedUsers: number;
  activeAnnouncements: number;
  pendingRefunds: number;
  generatedAt: string;
  period: { month: string; timeZone: string; from: string; to: string };
  currentQueues: {
    pendingListings: number;
    openReports: number;
    pendingRefunds: number;
  };
  revenue: { receivedAmount: number; refundAmount: number; netAmount: number };
  processed: {
    listings: number;
    reports: number;
    refunds: number;
    total: number;
  };
  listings: { approved: number; rejected: number };
  reports: { resolved: number; dismissed: number };
  refunds: {
    pending: number;
    approved: number;
    processing: number;
    completed: number;
    rejected: number;
    failed: number;
    completedAmount: number;
  };
  payments: {
    paid: number;
    paidAmount: number;
    pending: number;
    failed: number;
    cancelled: number;
    expired: number;
  };
}

export function AdminOverview({
  data,
  reload,
  expanded = false,
  month,
  onMonth,
}: {
  data?: AdminSummary;
  reload: () => void;
  expanded?: boolean;
  month: string;
  onMonth: (month: string) => void;
}) {
  const queues = [
    {
      label: "Tin chờ duyệt",
      count: expanded
        ? data?.pendingListings
        : data?.currentQueues.pendingListings,
      href: "/admin/tin-dang",
      icon: "home" as const,
    },
    {
      label: "Báo cáo chờ xử lý",
      count: expanded ? data?.openReports : data?.currentQueues.openReports,
      href: "/admin/bao-cao",
      icon: "report" as const,
    },
    {
      label: "Hoàn tiền cần xử lý",
      count: expanded
        ? data?.pendingRefunds
        : data?.currentQueues.pendingRefunds,
      href: "/admin/hoan-tien",
      icon: "wallet" as const,
    },
  ];
  if (!expanded)
    return (
      <div className="admin-queue-strip" aria-label="Tóm tắt hàng chờ">
        {queues.map((row) => (
          <Link key={row.href} href={row.href}>
            <HouseholdIcon name={row.icon} />
            <span>{row.label}</span>
            <strong>{row.count ?? "—"}</strong>
          </Link>
        ))}
        <Link className="admin-open-dashboard" href="/admin/tong-quan">
          <HouseholdIcon name="report" /> Xem tổng quan{" "}
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  return (
    <section
      className="dashboard admin-dashboard"
      aria-label="Tổng quan vận hành"
    >
      <div className="dashboard-heading">
        <div>
          <p className="dashboard-breadcrumb">
            Quản trị <span aria-hidden="true">/</span> Tổng quan
          </p>
          <h1>Tổng quan vận hành</h1>
          <p>Doanh thu dịch vụ, hoàn tiền và kết quả xử lý theo tháng.</p>
        </div>
        <div className="dashboard-heading-actions">
          <Input
            id="admin-summary-month"
            label="Tháng thống kê"
            type="month"
            min="2000-01"
            max="2100-12"
            required
            value={month}
            onChange={(event) => {
              if (
                /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(event.target.value) &&
                event.target.validity.valid
              )
                onMonth(event.target.value);
            }}
          />
          <button
            type="button"
            className="button button-secondary dashboard-refresh"
            onClick={reload}
          >
            <HouseholdIcon name="clock" /> Cập nhật
          </button>
        </div>
      </div>
      <div className="admin-summary-grid">
        <Card className="dashboard-metric admin-revenue-summary">
          <span className="dashboard-metric-label">
            <span className="dashboard-icon-tile">
              <HouseholdIcon name="wallet" />
            </span>{" "}
            Doanh thu dịch vụ sau hoàn tiền
          </span>
          <strong>{data ? money(data.revenue.netAmount) : "—"}</strong>
          <div className="dashboard-metric-bottom">
            <span className="dashboard-status-pill">
              {data?.payments.paid ?? "—"} đơn đã thanh toán
            </span>
            <small>Đã trừ tiền hoàn tất trong tháng</small>
          </div>
          <div className="admin-net-revenue">
            <span>Tiền dịch vụ đã nhận</span>
            <strong>{data ? money(data.revenue.receivedAmount) : "—"}</strong>
          </div>
        </Card>
        <Card className="dashboard-metric admin-refunded-summary">
          <span className="dashboard-metric-label">
            <span className="dashboard-icon-tile">
              <HouseholdIcon name="wallet" />
            </span>{" "}
            Hoàn tiền trong tháng
          </span>
          <strong>{data ? money(data.revenue.refundAmount) : "—"}</strong>
          <div className="dashboard-metric-bottom">
            <span>{data?.refunds.completed ?? "—"} yêu cầu hoàn tất</span>
            <Link href="/admin/hoan-tien">Đối soát ↗</Link>
          </div>
          <small>Chỉ tính các khoản đã hoàn tất</small>
        </Card>
        <Card className="dashboard-metric dashboard-featured admin-processed-summary">
          <span className="dashboard-metric-label">
            <HouseholdIcon name="check" /> Đã xử lý trong tháng
          </span>
          <strong>
            {data?.processed.total ?? "—"}
            <small> mục</small>
          </strong>
          <span className="dashboard-processed-note">
            {data?.processed.listings ?? "—"} tin ·{" "}
            {data?.processed.reports ?? "—"} báo cáo ·{" "}
            {data?.processed.refunds ?? "—"} hoàn tiền
          </span>
          <a href="#admin-results" className="dashboard-featured-link">
            Xem kết quả xử lý <span aria-hidden="true">↗</span>
          </a>
        </Card>
      </div>
      {data && <AdminResults data={data} />}
      <Card className="dashboard-panel admin-operations-panel">
        <div className="dashboard-panel-heading">
          <div>
            <h3>Công việc đang chờ</h3>
            <p>Hàng chờ phát sinh trong tháng đang xem.</p>
          </div>
          <HouseholdIcon name="chores" />
        </div>
        <div className="admin-operation-links">
          {queues.map((row) => (
            <Link key={row.href} href={row.href}>
              <span className="dashboard-icon-tile">
                <HouseholdIcon name={row.icon} />
              </span>
              <span>
                {row.label}
                <strong>{row.count ?? "—"}</strong>
              </span>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
        <div className="admin-system-summary">
          <Link href="/admin/nguoi-dung">
            {data?.lockedUsers ?? "—"} tài khoản bị khóa trong tháng ↗
          </Link>
          <Link href="/admin/thong-bao">
            {data?.activeAnnouncements ?? "—"} thông báo phát trong tháng ↗
          </Link>
          <small>
            {data
              ? `Cập nhật lúc ${new Date(data.generatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}`
              : "Đang lấy số liệu…"}
          </small>
        </div>
      </Card>
    </section>
  );
}
