"use client";

import { useState } from "react";
import { houseDate, type House } from "@/lib/houses";
import { type HouseReport } from "@/lib/household";
import { money } from "@/lib/expenses";
import { Button, Card, ErrorState, Input, LoadingState } from "../ui";
import {
  DashboardBars,
  DashboardDonut,
  DashboardStatusBars,
} from "../dashboard-charts";
import { HouseholdIcon } from "./household-ui";
import { useHouseholdData } from "./use-household-data";
import { vietnamDate } from "./repayment-promise-form";
import { HouseOverviewTasks } from "./house-overview-tasks";
import { PersonAvatar } from "../person-avatar";

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
  const [chartMode, setChartMode] = useState<"cumulative" | "days" | "categories">("cumulative");
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
          <h2>Tổng quan nhà chung</h2>
          <p>Chi tiêu rõ ràng, sinh hoạt nhẹ nhàng.</p>
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
            <Card className="dashboard-metric house-spending-summary">
              <span className="dashboard-metric-label">
                <span className="dashboard-icon-tile">
                  <HouseholdIcon name="wallet" />
                </span>{" "}
                Tổng chi tiêu · {monthNumber}/{year}
              </span>
              <strong>{money(data.total)}</strong>
              <div className="dashboard-metric-bottom">
                <small>Gồm điều chỉnh trong kỳ</small>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => onTab("expenses")}
                >
                  Xem chi phí ↗
                </button>
              </div>
            </Card>
            <button
              className="dashboard-metric"
              type="button"
              onClick={() => onTab("expenses")}
            >
              <span className="dashboard-metric-label">
                <span className="dashboard-icon-tile">
                  <HouseholdIcon name="report" />
                </span>{" "}
                Khoản chi / điều chỉnh
              </span>
              <strong>{data.count}</strong>
              <small>
                Ghi nhận trong tháng {monthNumber}/{year}
              </small>
            </button>
            <button
              className="dashboard-metric dashboard-featured house-pending-summary"
              type="button"
              onClick={() => onTab("balances")}
            >
              <span className="dashboard-metric-label">
                <HouseholdIcon name="clock" /> Thanh toán chờ xác nhận
              </span>
              <strong>{data.ledger.pendingCount}</strong>
              <small>Sổ công nợ hiện tại của cả nhà</small>
              <span className="dashboard-featured-link">
                Mở đối soát <span aria-hidden="true">↗</span>
              </span>
            </button>
          </div>
          <div
            className="dashboard-quick-actions house-overview-actions"
            aria-label="Thao tác nhanh trong nhà"
          >
            <Button onClick={() => onTab("expenses")}>
              <HouseholdIcon name="wallet" /> Quản lý chi phí
            </Button>
            <Button variant="secondary" onClick={() => onTab("chat")}>
              <HouseholdIcon name="people" /> Chat chung
            </Button>
            <Button variant="secondary" onClick={() => onTab("reports")}>
              <HouseholdIcon name="report" /> Báo cáo & xuất file
            </Button>
          </div>
          <div className="dashboard-chart-grid house-overview-charts">
            <Card className="dashboard-panel dashboard-trend">
              <div className="dashboard-panel-heading">
                <div>
                  <h3>
                    {chartMode !== "categories"
                      ? "Chi tiêu trong tháng"
                      : "Chi phí theo danh mục"}
                  </h3>
                  <p>
                    {chartMode !== "categories"
                      ? chartMode === "cumulative" ? "Tổng chi đến từng ngày, gồm điều chỉnh" : "Theo ngày phát sinh và ngày điều chỉnh"
                      : "Tổng tiền của từng nhóm chi phí"}
                  </p>
                </div>
                <div
                  className="house-chart-switch"
                  role="group"
                  aria-label="Cách xem chi tiêu"
                >
                  <button
                    type="button"
                    aria-pressed={chartMode === "cumulative"}
                    onClick={() => setChartMode("cumulative")}
                  >
                    Lũy kế
                  </button>
                  <button
                    type="button"
                    aria-pressed={chartMode === "days"}
                    onClick={() => setChartMode("days")}
                  >
                    Ngày
                  </button>
                  <button
                    type="button"
                    aria-pressed={chartMode === "categories"}
                    onClick={() => setChartMode("categories")}
                  >
                    Danh mục
                  </button>
                </div>
              </div>
              {chartMode !== "categories" ? (
                <DashboardBars key={`${month}-${chartMode}`} rows={days} format={money} cumulative={chartMode === "cumulative"} />
              ) : (
                <DashboardStatusBars
                  key={month}
                  rows={data.categories
                    .filter((row) => row.count > 0)
                    .map((row) => ({ label: row.label, amount: row.amount }))}
                  format={money}
                />
              )}
            </Card>
            <Card className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div>
                  <h3>Chi tiêu vào đâu?</h3>
                  <p>
                    Phân bổ chi phí tháng {monthNumber}/{year}
                  </p>
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
          <div className="house-dashboard-living-grid">
            <Card className="dashboard-panel house-overview-expenses">
              <div className="dashboard-panel-heading">
                <div>
                  <h3>Khoản chi gần đây</h3>
                  <p>Trong tháng đang xem</p>
                </div>
                <button
                  className="dashboard-view-link"
                  type="button"
                  aria-label="Xem toàn bộ chi phí"
                  onClick={() => onTab("expenses")}
                >
                  ↗
                </button>
              </div>
              {data.expenses.length === 0 ? (
                <div className="house-dashboard-empty">
                  <HouseholdIcon name="wallet" />
                  <strong>Tháng này chưa có khoản chi</strong>
                  <p>Các khoản được ghi nhận sẽ xuất hiện tại đây.</p>
                </div>
              ) : (
                <div className="house-dashboard-expense-list">
                  {data.expenses
                    .slice(-3)
                    .reverse()
                    .map((expense) => (
                      <div key={expense.id}>
                        <span className="dashboard-icon-tile">
                          <HouseholdIcon name="wallet" />
                        </span>
                        <div>
                          <strong>{expense.title}</strong>
                          <small>
                            {expense.payer.displayName} ·{" "}
                            {houseDate(expense.spentOn)}
                          </small>
                        </div>
                        <strong>{money(expense.amount)}</strong>
                      </div>
                    ))}
                </div>
              )}
              <button
                className="house-widget-footer"
                type="button"
                onClick={() => onTab("expenses")}
              >
                Xem toàn bộ chi phí <span aria-hidden="true">↗</span>
              </button>
            </Card>
            <HouseOverviewTasks
              houseId={house.id}
              onOpen={() => onTab("chores")}
            />
          </div>
          <div
            className="house-dashboard-members"
            aria-label="Thành viên trong nhà"
          >
            <span>Cùng sống trong nhà</span>
            <div>
              {house.members.slice(0, 4).map((member) => (
                <span className="house-dashboard-person" key={member.userId}>
                  <PersonAvatar person={member} />
                  <span>{member.displayName}</span>
                </span>
              ))}
            </div>
            <button
              type="button"
              className="text-link"
              onClick={() => onTab("members")}
            >
              Xem {house.members.length} thành viên ↗
            </button>
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
