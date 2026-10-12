"use client";

import { useState } from "react";
import { type House } from "@/lib/houses";
import { type HouseReport } from "@/lib/household";
import { money } from "@/lib/expenses";
import { Button, Card, ErrorState, Input, LoadingState } from "../ui";
import { DashboardBars, DashboardDonut } from "../dashboard-charts";
import { HouseholdIcon } from "./household-ui";
import { useHouseholdData } from "./use-household-data";
import { vietnamDate } from "./repayment-promise-form";

export function HouseOverview({
  house,
  onTab,
}: {
  house: House;
  onTab: (
    tab: "expenses" | "balances" | "reports" | "members" | "chores" | "chat",
  ) => void;
}) {
  const [month, setMonth] = useState(() => vietnamDate().slice(0, 7));
  const { data, error, reload } = useHouseholdData<HouseReport>(
    `/houses/${house.id}/household/reports?month=${month}`,
  );
  const [year, monthNumber] = month.split("-").map(Number);
  const days = Array.from(
    { length: new Date(year, monthNumber, 0).getDate() },
    (_, index) => ({
      label: `Ngày ${index + 1}/${monthNumber}`,
      date: `${month}-${String(index + 1).padStart(2, "0")}`,
      amount: 0,
    }),
  );
  if (data) {
    for (const expense of data.expenses) {
      const day = days.find((day) => day.date === expense.spentOn.slice(0, 10));
      if (day) day.amount += expense.amount;
    }
    for (const correction of data.corrections) {
      const day = days.find(
        (day) => day.date === correction.recordedOn.slice(0, 10),
      );
      if (day) day.amount += correction.amountDelta;
    }
  }
  return (
    <div className="dashboard house-overview-dashboard">
      <div className="dashboard-heading">
        <div>
          <h2>Một góc nhìn, cả nhà rõ ràng.</h2>
          <p>Chi tiêu trong tháng và những việc cần theo dõi.</p>
        </div>
        <Input
          id="overview-month"
          label="Tháng chi tiêu"
          type="month"
          min="2000-01"
          max="2100-12"
          required
          value={month}
          onChange={(event) => {
            if (
              /^\d{4}-\d{2}$/.test(event.target.value) &&
              event.target.validity.valid
            )
              setMonth(event.target.value);
          }}
        />
      </div>
      {error && (
        <ErrorState
          message={error}
          action={<Button onClick={reload}>Tải lại số liệu</Button>}
        />
      )}
      {!data && !error && <LoadingState message="Đang tổng hợp chi tiêu…" />}
      {data && (
        <>
          <div className="dashboard-metrics house-dashboard-metrics">
            <Card className="dashboard-metric dashboard-featured">
              <span className="dashboard-metric-label">
                <HouseholdIcon name="wallet" /> Tổng chi tiêu · {monthNumber}/
                {year}
              </span>
              <strong>{money(data.total)}</strong>
              <small>{data.count} khoản chi / điều chỉnh trong tháng</small>
              <button type="button" onClick={() => onTab("expenses")}>
                Xem các khoản chi <span aria-hidden="true">↗</span>
              </button>
            </Card>
            <button
              className="dashboard-metric"
              type="button"
              onClick={() => onTab("members")}
            >
              <span className="dashboard-metric-label">
                <HouseholdIcon name="people" /> Thành viên hiện tại
              </span>
              <strong>{house.members.length}</strong>
              <small>Cùng chia sẻ cuộc sống</small>
            </button>
            <button
              className="dashboard-metric"
              type="button"
              onClick={() => onTab("balances")}
            >
              <span className="dashboard-metric-label">
                <HouseholdIcon name="clock" /> Thanh toán chờ xác nhận
              </span>
              <strong>{data.ledger.pendingCount}</strong>
              <small>Công nợ hiện tại của cả nhà</small>
            </button>
          </div>
          <div className="dashboard-chart-grid">
            <Card className="dashboard-panel dashboard-trend">
              <div className="dashboard-panel-heading">
                <div>
                  <h3>Chi phí theo ngày</h3>
                </div>
                <span className="dashboard-period">
                  {monthNumber}/{year}
                </span>
              </div>
              <DashboardBars key={month} rows={days} format={money} />
            </Card>
            <Card className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div>
                  <h3>Chi tiêu vào đâu?</h3>
                </div>
                <HouseholdIcon name="shopping" />
              </div>
              <DashboardDonut
                key={month}
                rows={data.categories
                  .filter((row) => row.count > 0)
                  .map((row) => ({ label: row.label, amount: row.amount }))}
                label="Tổng chi"
                value={money(data.total)}
                format={money}
              />
              {data.corrections.length > 0 && (
                <p className="dashboard-caption">
                  Tổng gồm điều chỉnh. Tỷ trọng chỉ tính số tiền dương của từng
                  danh mục.
                </p>
              )}
            </Card>
          </div>
          <div
            className="dashboard-quick-actions"
            aria-label="Thao tác nhanh trong nhà"
          >
            <Button variant="secondary" onClick={() => onTab("expenses")}>
              <HouseholdIcon name="wallet" /> Ghi khoản chi
            </Button>
            <Button variant="secondary" onClick={() => onTab("chores")}>
              <HouseholdIcon name="chores" /> Xem việc nhà
            </Button>
            <Button variant="secondary" onClick={() => onTab("chat")}>
              <HouseholdIcon name="people" /> Chat chung
            </Button>
            <Button variant="secondary" onClick={() => onTab("reports")}>
              <HouseholdIcon name="report" /> Báo cáo & xuất file
            </Button>
          </div>
          <p className="dashboard-caption">
            Chi phí tính theo ngày phát sinh, gồm khoản đã quyết toán và điều
            chỉnh; không gồm nháp, khoản đã hủy hay tiền trả nợ. Công nợ hiển
            thị trạng thái hiện tại, không giới hạn theo tháng.
          </p>
        </>
      )}
    </div>
  );
}
