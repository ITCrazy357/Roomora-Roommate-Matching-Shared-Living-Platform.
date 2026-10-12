import Link from "next/link";
import { money } from "@/lib/expenses";
import { Card } from "../ui";
import { DashboardDonut } from "../dashboard-charts";
import type { AdminSummary } from "./admin-overview";

export function AdminResults({ data }: { data: AdminSummary }) {
  const refunds = [
    { label: "Đã hoàn thành công", amount: data.refunds.completed },
    { label: "Đã từ chối", amount: data.refunds.rejected },
    { label: "Chờ xét duyệt", amount: data.refunds.pending },
    { label: "Đã duyệt, chưa hoàn", amount: data.refunds.approved },
    { label: "Đang thực hiện", amount: data.refunds.processing },
    { label: "Thất bại, cần xử lý lại", amount: data.refunds.failed },
  ];
  const reports = [
    { label: "Đã xử lý vi phạm", amount: data.reports.resolved },
    { label: "Đã bác bỏ báo cáo", amount: data.reports.dismissed },
    { label: "Chờ xử lý", amount: data.openReports },
  ];
  return (
    <section className="admin-results" aria-label="Thống kê kết quả xử lý">
      <div className="dashboard-panel-heading">
        <div>
          <span className="content-label">KẾT QUẢ XỬ LÝ</span>
          <h3>Thống kê toàn thời gian</h3>
        </div>
        <span className="dashboard-period">
          Cập nhật{" "}
          {new Date(data.generatedAt).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Ho_Chi_Minh",
          })}
        </span>
      </div>
      <div className="dashboard-chart-grid admin-results-grid">
        <Card className="dashboard-panel admin-payment-results">
          <div className="dashboard-panel-heading">
            <div>
              <span className="content-label">GIAO DỊCH DỊCH VỤ</span>
              <h3>Thanh toán thành công</h3>
            </div>
            <span className="dashboard-period">{data.payments.paid} đơn</span>
          </div>
          <strong className="admin-result-amount">
            {money(data.payments.paidAmount)}
          </strong>
          <dl className="admin-result-rows">
            <div>
              <dt>Chờ thanh toán</dt>
              <dd>{data.payments.pending}</dd>
            </div>
            <div>
              <dt>Thanh toán thất bại</dt>
              <dd>{data.payments.failed}</dd>
            </div>
            <div>
              <dt>Đã hủy</dt>
              <dd>{data.payments.cancelled}</dd>
            </div>
            <div>
              <dt>Hết hạn</dt>
              <dd>{data.payments.expired}</dd>
            </div>
          </dl>
          <p className="dashboard-caption">
            Tổng tiền các đơn đã thanh toán, bao gồm đơn được hoàn tiền; chưa
            trừ tiền hoàn và phí.
          </p>
        </Card>
        <Card className="dashboard-panel admin-refund-results">
          <div className="dashboard-panel-heading">
            <div>
              <span className="content-label">HOÀN TIỀN DỊCH VỤ</span>
              <h3>Kết quả hoàn tiền</h3>
            </div>
            <Link className="text-link" href="/admin/hoan-tien">
              Quản lý ↗
            </Link>
          </div>
          <div className="admin-result-money">
            <span>Tiền đã hoàn thành công</span>
            <strong>{money(data.refunds.completedAmount)}</strong>
          </div>
          <DashboardDonut
            rows={refunds}
            label="Yêu cầu"
            value={String(refunds.reduce((sum, row) => sum + row.amount, 0))}
            format={String}
          />
          <p className="dashboard-caption">
            Chỉ cộng số tiền đã hoàn thành công. Các yêu cầu mới được duyệt,
            đang chuyển tiền hoặc thất bại vẫn cần tiếp tục xử lý.
          </p>
        </Card>
        <Card className="dashboard-panel admin-listing-results">
          <div className="dashboard-panel-heading">
            <div>
              <span className="content-label">KIỂM DUYỆT NỘI DUNG</span>
              <h3>Tin đã duyệt / từ chối</h3>
            </div>
            <Link className="text-link" href="/admin/tin-dang">
              Quản lý ↗
            </Link>
          </div>
          <div className="admin-result-counts">
            <div className="admin-result-success">
              <strong>{data.listings.approved}</strong>
              <span>Tin từng được duyệt</span>
            </div>
            <div className="admin-result-danger">
              <strong>{data.listings.rejected}</strong>
              <span>Tin từng bị từ chối</span>
            </div>
          </div>
          <p className="dashboard-caption">
            Dựa trên lịch sử kiểm duyệt, mỗi tin tính một lần trong mỗi nhóm, kể
            cả tin đã đóng. Tin bị từ chối rồi duyệt lại có thể thuộc cả hai
            nhóm.
          </p>
        </Card>
        <Card className="dashboard-panel admin-report-results">
          <div className="dashboard-panel-heading">
            <div>
              <h3>Báo cáo vi phạm</h3>
            </div>
            <Link className="text-link" href="/admin/bao-cao">
              Quản lý ↗
            </Link>
          </div>
          <DashboardDonut
            rows={reports}
            label="Báo cáo"
            value={String(reports.reduce((sum, row) => sum + row.amount, 0))}
            format={String}
          />
          <p className="dashboard-caption">
            Báo cáo đã xử lý vi phạm được tách riêng với báo cáo không đủ căn
            cứ.
          </p>
        </Card>
      </div>
    </section>
  );
}
