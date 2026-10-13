import Link from "next/link";
import { Card } from "../ui";
import { DashboardDonut, DashboardStatusBars } from "../dashboard-charts";
import type { AdminSummary } from "./admin-overview";

export function AdminResults({ data }: { data: AdminSummary }) {
  const payments = [
    {
      label: "Thành công",
      amount: data.payments.paid,
      color: "var(--chart-coral)",
    },
    {
      label: "Chờ thanh toán",
      amount: data.payments.pending,
      color: "var(--chart-amber)",
    },
    { label: "Thất bại", amount: data.payments.failed, color: "var(--danger)" },
    {
      label: "Đã hủy",
      amount: data.payments.cancelled,
      color: "var(--chart-brown)",
    },
    {
      label: "Hết hạn",
      amount: data.payments.expired,
      color: "var(--chart-blue)",
    },
  ];
  const refunds = [
    {
      label: "Đã hoàn thành công",
      amount: data.refunds.completed,
      color: "var(--chart-green)",
    },
    {
      label: "Đã từ chối",
      amount: data.refunds.rejected,
      color: "var(--danger)",
    },
    {
      label: "Chờ xét duyệt",
      amount: data.refunds.pending,
      color: "var(--chart-amber)",
    },
    {
      label: "Đã duyệt, chưa hoàn",
      amount: data.refunds.approved,
      color: "var(--chart-blue)",
    },
    {
      label: "Đang thực hiện",
      amount: data.refunds.processing,
      color: "var(--chart-violet)",
    },
    {
      label: "Thất bại",
      amount: data.refunds.failed,
      color: "var(--chart-brown)",
    },
  ];
  const reports = [
    {
      label: "Đã xử lý vi phạm",
      amount: data.reports.resolved,
      color: "var(--chart-coral)",
    },
    {
      label: "Không đủ căn cứ",
      amount: data.reports.dismissed,
      color: "var(--chart-blue)",
    },
    {
      label: "Chờ xử lý",
      amount: data.openReports,
      color: "var(--chart-amber)",
    },
  ];
  const totalPayments = payments.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div
      id="admin-results"
      className="admin-results"
      aria-label="Thống kê kết quả xử lý"
    >
      <div className="dashboard-chart-grid admin-results-grid">
        <Card className="dashboard-panel admin-payment-results">
          <div className="dashboard-panel-heading">
            <div>
              <h3>Giao dịch dịch vụ</h3>
              <p>Thanh toán thành công và đơn mới trong tháng</p>
            </div>
            <span className="dashboard-period">{totalPayments} đơn</span>
          </div>
          <DashboardStatusBars rows={payments} />
          <div className="dashboard-panel-footnote">
            <span className="dashboard-small-dot" aria-hidden="true" /> Tổng
            tiền đã nhận tính theo ngày thanh toán; doanh thu đã trừ khoản hoàn
            tất trong tháng. Trạng thái khác tính theo ngày tạo đơn.
          </div>
        </Card>
        <Card className="dashboard-panel admin-refund-results">
          <div className="dashboard-panel-heading">
            <div>
              <h3>Kết quả hoàn tiền</h3>
              <p>Kết quả xử lý và yêu cầu mới trong tháng</p>
            </div>
            <Link
              className="dashboard-view-link"
              href="/admin/hoan-tien"
              aria-label="Quản lý hoàn tiền"
            >
              ↗
            </Link>
          </div>
          <DashboardDonut
            rows={refunds}
            label="Yêu cầu"
            value={String(refunds.reduce((sum, row) => sum + row.amount, 0))}
            format={String}
          />
          <p className="dashboard-caption">
            Hoàn tất và từ chối tính theo ngày có kết quả; trạng thái khác theo
            ngày gửi yêu cầu. Đã duyệt chưa đồng nghĩa với đã hoàn tiền.
          </p>
        </Card>
        <Card className="dashboard-panel admin-listing-results">
          <div className="dashboard-panel-heading">
            <div>
              <h3>Kiểm duyệt tin đăng</h3>
              <p>Theo ngày duyệt hoặc từ chối trong tháng</p>
            </div>
            <Link
              className="dashboard-view-link"
              href="/admin/tin-dang"
              aria-label="Quản lý tin đăng"
            >
              ↗
            </Link>
          </div>
          <div className="admin-review-totals">
            <span>
              <strong>{data.listings.approved}</strong> đã duyệt trong tháng
            </span>
            <span>
              <strong>{data.listings.rejected}</strong> đã từ chối trong tháng
            </span>
          </div>
          <DashboardStatusBars
            rows={[
              {
                label: "Đã duyệt",
                amount: data.listings.approved,
                color: "var(--primary)",
              },
              {
                label: "Đã từ chối",
                amount: data.listings.rejected,
                color: "var(--chart-blue)",
              },
            ]}
          />
          <p className="dashboard-caption">
            Mỗi tin tính một lần trong mỗi nhóm của tháng, kể cả tin đã đóng.
            Tin được duyệt sau từ chối trong cùng tháng có thể thuộc cả hai
            nhóm.
          </p>
        </Card>
        <Card className="dashboard-panel admin-report-results">
          <div className="dashboard-panel-heading">
            <div>
              <h3>Báo cáo vi phạm</h3>
              <p>Kết quả xử lý và báo cáo mới trong tháng</p>
            </div>
            <Link
              className="dashboard-view-link"
              href="/admin/bao-cao"
              aria-label="Quản lý báo cáo vi phạm"
            >
              ↗
            </Link>
          </div>
          <DashboardDonut
            rows={reports}
            label="Báo cáo"
            value={String(reports.reduce((sum, row) => sum + row.amount, 0))}
            format={String}
          />
          <p className="dashboard-caption">
            Kết quả theo ngày xử lý; báo cáo đang chờ theo ngày gửi trong tháng.
            Đã xử lý vi phạm và không đủ căn cứ được thống kê riêng.
          </p>
        </Card>
      </div>
    </div>
  );
}
