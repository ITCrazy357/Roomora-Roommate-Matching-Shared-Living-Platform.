"use client";
import { useState } from "react";
import { apiUrl, ApiError } from "@/lib/api";
import { categories, householdError, type HouseReport } from "@/lib/household";
import { expenseLabels, money } from "@/lib/expenses";
import { houseDate } from "@/lib/houses";
import { Button, Card, ErrorState, Input, LoadingState } from "../ui";
import { useHouseholdData } from "./use-household-data";
import { vietnamDate } from "./repayment-promise-form";
import { AiInsightPanel } from "../ai/ai-insight";
import {
  HouseholdHero,
  HouseholdMetric,
  HouseholdIcon,
  HouseholdPerson,
  HouseholdEmpty,
} from "./household-ui";

function CategoryChart({ data }: { data: HouseReport }) {
  const rows = data.categories.filter((row) => row.count > 0);
  const positiveTotal = rows.reduce(
    (sum, row) => sum + Math.max(0, row.amount),
    0,
  );
  return (
    <Card className="house-panel household-report-categories">
      <div className="household-section-heading">
        <div>
          <h2>Theo danh mục</h2>
        </div>
        <span className="household-status household-tone-neutral">
          {rows.length} danh mục
        </span>
      </div>
      {data.count === 0 ? (
        <HouseholdEmpty
          title="Tháng này chưa có khoản chi."
          description="Các khoản chi được ghi nhận sẽ xuất hiện trong báo cáo của tháng phát sinh."
          icon="report"
        />
      ) : (
        <>
          <div className="household-donut">
            <svg
              viewBox="0 0 200 200"
              role="img"
              aria-label={`Tỷ trọng ${rows.length} danh mục chi phí. Chi tiết ở danh sách bên dưới.`}
            >
              <circle
                cx="100"
                cy="100"
                r="70"
                fill="none"
                stroke="var(--surface-muted)"
                strokeWidth="22"
              />
              {rows.map((row, index) => {
                const length = positiveTotal
                  ? (Math.max(0, row.amount) / positiveTotal) * 100
                  : 0;
                const start = positiveTotal
                  ? (rows
                      .slice(0, index)
                      .reduce(
                        (sum, item) => sum + Math.max(0, item.amount),
                        0,
                      ) /
                      positiveTotal) *
                    100
                  : 0;
                return (
                  <circle
                    key={row.category}
                    className={`category-${row.category.toLowerCase()}`}
                    cx="100"
                    cy="100"
                    r="70"
                    pathLength="100"
                    fill="none"
                    stroke="var(--category-color)"
                    strokeWidth="22"
                    strokeDasharray={`${length} ${100 - length}`}
                    strokeDashoffset={-start}
                    transform="rotate(-90 100 100)"
                  >
                    <title>
                      {row.label}: {money(row.amount)} ({length.toFixed(1)}%)
                    </title>
                  </circle>
                );
              })}
            </svg>
            <div>
              <small>Tổng trong tháng</small>
              <strong>{money(data.total)}</strong>
              <span>{data.count} khoản chi / điều chỉnh</span>
            </div>
          </div>
          <div className="household-category-legend">
            {rows.map((row) => (
              <div
                className={`report-category category-${row.category.toLowerCase()}`}
                key={row.category}
              >
                <div className="household-category-row">
                  <span>
                    <i aria-hidden="true" />
                    {row.label}
                    <small>{row.count} khoản</small>
                  </span>
                  <strong>{money(row.amount)}</strong>
                </div>
                <div className="report-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${positiveTotal ? (Math.max(0, row.amount) / positiveTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {data.corrections.length > 0 && (
            <p className="text-muted">
              Tổng đã gồm chênh lệch điều chỉnh sau chốt. Biểu đồ tỷ trọng chỉ
              thể hiện số tiền dương.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export function HouseReports({ houseId }: { houseId: string }) {
  const [month, setMonth] = useState(vietnamDate().slice(0, 7));
  const path = `/houses/${houseId}/household/reports`;
  const {
    data,
    error: loadError,
    reload,
  } = useHouseholdData<HouseReport>(`${path}?month=${month}`);
  const [pending, setPending] = useState<"pdf" | "csv" | null>(null),
    [error, setError] = useState("");
  async function download(format: "pdf" | "csv") {
    if (pending) return;
    setPending(format);
    setError("");
    try {
      const response = await fetch(
        apiUrl(`${path}/${format === "pdf" ? "pdf" : "export"}?month=${month}`),
        { credentials: "include", cache: "no-store" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          code?: string;
        };
        throw new ApiError("Export failed", "http", response.status, body.code);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `Roomora-${month}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(householdError(error));
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="house-stack household-screen">
      <HouseholdHero
        title="Báo cáo hằng tháng"
        icon="report"
        description="Chi tiêu rõ ràng, chia sẻ nhẹ nhàng. Xem các khoản chi trong tháng và tải bảng quyết toán để cả nhà cùng đối chiếu."
      >
        <div className="household-report-controls">
          <Input
            id="report-month"
            label="Tháng báo cáo"
            type="month"
            min="2000-01"
            max="2100-12"
            value={month}
            required
            onChange={(event) => {
              if (event.target.value) setMonth(event.target.value);
            }}
          />
          <div className="finance-actions">
            <Button
              disabled={!!pending || !data}
              onClick={() => void download("pdf")}
            >
              <HouseholdIcon name="download" />
              {pending === "pdf" ? "Đang xuất PDF…" : "Tải bảng quyết toán PDF"}
            </Button>
            <Button
              variant="secondary"
              disabled={!!pending || !data}
              onClick={() => void download("csv")}
            >
              {pending === "csv"
                ? "Đang xuất CSV…"
                : "Xuất bảng quyết toán CSV"}
            </Button>
          </div>
        </div>
      </HouseholdHero>
      {error && <ErrorState message={error} />}
      {loadError && (
        <ErrorState
          message={loadError}
          action={<Button onClick={reload}>Thử lại</Button>}
        />
      )}
      {!data && !loadError && <LoadingState />}
      {data && (
        <>
          <AiInsightPanel
            key={`${houseId}:${month}:${data.generatedAt}`}
            kind="summary"
            id={houseId}
            month={month}
          />
          <div className="household-metrics">
            <HouseholdMetric
              label="Tổng chi phí tháng"
              value={money(data.total)}
              icon="wallet"
              detail={`Kỳ ${data.month.split("-").reverse().join("/")}`}
            />
            <HouseholdMetric
              label="Khoản chi / điều chỉnh"
              value={data.count}
              icon="report"
              tone="info"
              detail="Không gồm khoản đã hủy"
            />
            <HouseholdMetric
              label="Danh mục chi tiêu"
              value={data.categories.filter((row) => row.count > 0).length}
              icon="shopping"
              tone="warning"
              detail="Phân bổ theo loại chi phí"
            />
            <HouseholdMetric
              label="Người có chi phí"
              value={
                data.members.filter((row) => row.paid !== 0 || row.owed !== 0)
                  .length
              }
              icon="people"
              tone="success"
              detail="Có trả trước hoặc được chia"
            />
          </div>
          <p className="household-help">
            <HouseholdIcon name="calendar" />
            Tính theo ngày phát sinh, gồm khoản đang ghi nhận và đã quyết toán.
            Nháp định kỳ và thanh toán trả nợ không tính vào chi phí tháng.
          </p>
          <div className="household-report-grid">
            <CategoryChart data={data} />
            <Card className="house-panel">
              <div className="household-section-heading">
                <div>
                  <h2>Theo thành viên</h2>
                </div>
                <span className="household-icon-tile household-tone-info">
                  <HouseholdIcon name="people" />
                </span>
              </div>
              <div
                className="household-table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Chi phí theo thành viên"
              >
                <table className="household-table household-member-table">
                  <caption>Tiền đã trả trước và phần chịu trong tháng</caption>
                  <thead>
                    <tr>
                      <th>Thành viên</th>
                      <th>Đã chi</th>
                      <th>Phần chịu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map((row) => (
                      <tr key={row.participantId}>
                        <th scope="row">
                          <HouseholdPerson
                            name={row.displayName}
                            avatarUrl={row.avatarUrl}
                            detail={row.isGuest ? "Ngoài app" : undefined}
                          />
                        </th>
                        <td>
                          <strong>{money(row.paid)}</strong>
                          <div className="report-bar" aria-hidden="true">
                            <span
                              style={{
                                width: `${data.total > 0 ? Math.min(100, Math.max(0, (row.paid / data.total) * 100)) : 0}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td>{money(row.owed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="household-report-note">
                <HouseholdIcon name="wallet" />
                <p>
                  “Đã chi” là tiền trả trước, “Phần chịu” là số tiền được chia
                  trong tháng. Công nợ sau bù trừ nằm bên dưới.
                </p>
              </div>
            </Card>
          </div>
          <Card className="house-panel">
            <div className="household-section-heading">
              <div>
                <h2>Khoản chi trong kỳ</h2>
              </div>
              <span className="household-status household-tone-brand">
                {data.count} khoản chi / điều chỉnh
              </span>
            </div>
            {data.count === 0 ? (
              <p className="text-muted">Chưa có khoản chi trong kỳ này.</p>
            ) : (
              <div
                className="household-table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Các khoản chi trong tháng"
              >
                <table className="household-table">
                  <caption>
                    Tháng {data.month.split("-").reverse().join("/")} ·{" "}
                    {data.houseName}
                  </caption>
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th>Khoản chi</th>
                      <th>Danh mục</th>
                      <th>Người trả</th>
                      <th>Số tiền</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.map((row) => (
                      <tr key={row.id}>
                        <td>{houseDate(row.spentOn)}</td>
                        <th scope="row">{row.title}</th>
                        <td>
                          <span
                            className={`household-category-chip category-${row.category.toLowerCase()}`}
                          >
                            {categories[row.category]}
                          </span>
                        </td>
                        <td>{row.payer.displayName}</td>
                        <td className="household-money">{money(row.amount)}</td>
                        <td>
                          <span
                            className={`household-status household-tone-${row.status === "SETTLED" ? "success" : "warning"}`}
                          >
                            {expenseLabels[row.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {data.corrections.map((row) => (
                      <tr key={row.id}>
                        <td>{houseDate(row.recordedOn)}</td>
                        <th scope="row">
                          Điều chỉnh #{row.version}: {row.expense.title}
                          <p className="text-muted">{row.reason}</p>
                        </th>
                        <td>{categories[row.expense.category]}</td>
                        <td>Ghi bởi {row.createdByName}</td>
                        <td className="household-money">
                          {row.amountDelta > 0 ? "+" : ""}
                          {money(row.amountDelta)}
                        </td>
                        <td>
                          {row.settledAt ? "Đã quyết toán" : "Chưa quyết toán"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={4}>
                        Tổng chi phí tháng
                      </th>
                      <td className="household-money">{money(data.total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
          <Card className="house-panel household-ledger">
            <div className="household-section-heading">
              <div>
                <h2>Công nợ tại thời điểm báo cáo</h2>
              </div>
              <span
                className={`household-status household-tone-${data.ledger.isSettled ? "success" : "warning"}`}
              >
                {data.ledger.isSettled ? "Đã chốt" : "Chưa chốt"}
              </span>
            </div>
            <p className="text-muted">
              Số dư tính từ toàn bộ sổ, gồm nợ tháng trước và thanh toán đã xác
              nhận. Xuất báo cáo không chốt sổ hoặc xác nhận trả tiền.
            </p>
            <div className="household-balance-grid">
              {data.ledger.balances.map((row) => (
                <div
                  className={`household-balance household-tone-${row.balance > 0 ? "success" : row.balance < 0 ? "danger" : "neutral"}`}
                  key={row.id}
                >
                  <HouseholdPerson
                    name={row.displayName}
                    avatarUrl={row.avatarUrl}
                    detail={row.isGuest ? "Ngoài app" : undefined}
                  />
                  <span>
                    {row.balance > 0
                      ? "Cần nhận"
                      : row.balance < 0
                        ? "Cần trả"
                        : "Cân bằng"}
                  </span>
                  <strong>{money(Math.abs(row.balance))}</strong>
                </div>
              ))}
            </div>
            <div className="household-report-note household-tone-warning">
              <HouseholdIcon name="clock" />
              <p>
                Hiện có{" "}
                <strong>{data.ledger.pendingCount} thanh toán chờ</strong>. Gợi
                ý bù trừ chưa trừ phần đang chờ; kiểm tra tab Công nợ trước khi
                trả tiền.
              </p>
            </div>
            <h3 className="household-transfer-title">Gợi ý bù trừ</h3>
            {data.ledger.transfers.length === 0 ? (
              <p className="text-muted">Hiện không có khoản cần bù trừ.</p>
            ) : (
              <div className="household-transfer-list">
                {data.ledger.transfers.map((row) => (
                  <div
                    className="household-transfer"
                    key={`${row.payerId}:${row.recipientId}`}
                  >
                    <span>
                      {row.payerName} <span className="text-muted">→</span>{" "}
                      {row.recipientName}
                    </span>
                    <strong>{money(row.amount)}</strong>
                  </div>
                ))}
              </div>
            )}
            <p className="household-generated">
              Dữ liệu lúc{" "}
              {new Intl.DateTimeFormat("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(data.generatedAt))}{" "}
              (UTC+7)
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
