"use client";

import Link from "next/link";
import { adminLinks } from "@/lib/admin";
import { DashboardDonut } from "../dashboard-charts";
import { HouseholdIcon, type HouseholdIconName } from "../houses/household-ui";
import { Card } from "../ui";
import { AdminResults } from "./admin-results";

export interface AdminSummary {
  pendingListings: number;
  openReports: number;
  lockedUsers: number;
  activeAnnouncements: number;
  pendingRefunds: number;
  generatedAt: string;
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

const metrics: {
  label: string;
  detail: string;
  icon: HouseholdIconName;
  key:
    | "pendingListings"
    | "lockedUsers"
    | "openReports"
    | "activeAnnouncements"
    | "pendingRefunds";
}[] = [
  {
    label: "Tin chờ duyệt",
    detail: "Ưu tiên kiểm tra trước khi công khai",
    icon: "home",
    key: "pendingListings",
  },
  {
    label: "Tài khoản bị khóa",
    detail: "Theo dõi vi phạm",
    icon: "people",
    key: "lockedUsers",
  },
  {
    label: "Báo cáo chờ xử lý",
    detail: "Kiểm tra bằng chứng",
    icon: "report",
    key: "openReports",
  },
  {
    label: "Thông báo đang phát",
    detail: "Hiển thị toàn hệ thống",
    icon: "calendar",
    key: "activeAnnouncements",
  },
  {
    label: "Hoàn tiền cần xử lý",
    detail: "Xác minh và đối soát",
    icon: "wallet",
    key: "pendingRefunds",
  },
];

export function AdminOverview({
  data,
  reload,
}: {
  data?: AdminSummary;
  reload: () => void;
}) {
  const queues = data
    ? [
        { label: "Tin chờ duyệt", amount: data.pendingListings },
        { label: "Báo cáo vi phạm", amount: data.openReports },
        { label: "Hoàn tiền dịch vụ", amount: data.pendingRefunds },
      ]
    : [];
  const total = queues.reduce((sum, row) => sum + row.amount, 0);
  return (
    <section
      className="dashboard admin-dashboard"
      aria-label="Tình hình vận hành"
    >
      <div className="dashboard-heading">
        <div>
          <h2>Nhịp vận hành hôm nay</h2>
          <p>Hàng chờ hiện tại và kết quả xử lý trên toàn hệ thống.</p>
        </div>
        <button
          className="button button-secondary dashboard-refresh"
          type="button"
          onClick={reload}
        >
          <HouseholdIcon name="clock" /> Cập nhật số liệu
        </button>
      </div>
      <div className="dashboard-metrics admin-dashboard-metrics">
        {metrics.map((metric, index) => (
          <Link
            key={metric.key}
            href={adminLinks[index].href}
            className={`dashboard-metric${index === 0 ? " dashboard-featured" : ""}`}
          >
            <span className="dashboard-metric-label">
              <HouseholdIcon name={metric.icon} />
              {metric.label}
            </span>
            <strong>{data?.[metric.key] ?? "—"}</strong>
            <small>{metric.detail}</small>
            {index === 0 && (
              <span className="dashboard-featured-link">
                Mở hàng chờ <span aria-hidden="true">↗</span>
              </span>
            )}
          </Link>
        ))}
      </div>
      {data && <AdminResults data={data} />}
      {data && (
        <div className="dashboard-chart-grid admin-dashboard-charts">
          <Card className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <div>
                <h3>Cơ cấu hàng chờ</h3>
              </div>
              <span className="dashboard-period">{total} mục</span>
            </div>
            <DashboardDonut
              rows={queues}
              label="Cần xử lý"
              value={String(total)}
              format={(amount) => String(amount)}
            />
          </Card>
          <Card className="dashboard-panel dashboard-priorities">
            <div className="dashboard-panel-heading">
              <div>
                <h3>Đi đến công việc</h3>
              </div>
              <HouseholdIcon name="chores" />
            </div>
            {queues.map((row, index) => (
              <Link key={row.label} href={adminLinks[[0, 2, 4][index]].href}>
                <span className="dashboard-priority-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <span>
                  <strong>{row.label}</strong>
                  <small>
                    {
                      [
                        "Duyệt nội dung trước khi hiển thị",
                        "Xem bằng chứng và phản hồi",
                        "Kiểm tra giao dịch và trạng thái",
                      ][index]
                    }
                  </small>
                </span>
                <span className="dashboard-priority-count">
                  {row.amount} <span aria-hidden="true">↗</span>
                </span>
              </Link>
            ))}
            <p className="dashboard-caption">
              Số liệu tại thời điểm tải. Mỗi quyết định xử lý đều được lưu lịch
              sử.
            </p>
          </Card>
        </div>
      )}
    </section>
  );
}
