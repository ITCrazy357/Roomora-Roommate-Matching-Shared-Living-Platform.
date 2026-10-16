"use client";

import { useAdminPage } from "./admin-shared";
import { Button, Card, ErrorState, LoadingState } from "../ui";
import { DashboardBars } from "../dashboard-charts";
import { HouseholdIcon } from "../houses/household-ui";

interface AiTotals {
  requests: number;
  measuredRequests: number;
  pricedRequests: number;
  unpricedRequests: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  estimatedCostUsd: string | null;
}
interface AiCosts extends AiTotals {
  month: string;
  completed: number;
  failed: number;
  pending: number;
  features: (AiTotals & { feature: string; label: string })[];
  models: (AiTotals & { model: string })[];
  daily: { day: string; requests: number; estimatedCostUsd: string | null }[];
}
const count = (value: number) => value.toLocaleString("vi-VN");
const usd = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
const cost = (value: string | null) =>
  value === null ? "Chưa tính được" : usd(Number(value));

export function AdminAiCosts({ month, refreshKey }: { month: string; refreshKey: number }) {
  const { data, error, reload } = useAdminPage<AiCosts>(
    `/admin/ai-costs?month=${month}`, refreshKey,
  );
  const [year, number] = month.split("-").map(Number);
  const days = Array.from(
    { length: new Date(year, number, 0).getDate() },
    (_, index) => {
      const day = `${month}-${String(index + 1).padStart(2, "0")}`;
      return {
        label: `Ngày ${index + 1}/${number}`,
        amount: Number(
          data?.daily.find((row) => row.day === day)?.estimatedCostUsd ?? 0,
        ),
      };
    },
  );
  return (
    <Card className="dashboard-panel admin-ai-costs">
      <div className="dashboard-panel-heading">
        <div>
          <h3>Chi phí sử dụng AI</h3>
          <p>
            OpenAI · Tháng {number}/{year} · Theo giờ Việt Nam
          </p>
        </div>
        <HouseholdIcon name="report" />
      </div>
      {error && (
        <ErrorState
          message={error}
          action={
            <Button variant="secondary" onClick={reload}>
              Tải lại chi phí AI
            </Button>
          }
        />
      )}
      {!data && !error && <LoadingState message="Đang tổng hợp chi phí AI…" />}
      {data && (
        <>
          {data.requests === 0 ? (
            <p className="dashboard-chart-empty">
              Chưa có lượt gọi AI được ghi nhận trong tháng này.
            </p>
          ) : (
            <>
              <dl className="admin-ai-metrics">
                <div>
                  <dt>Chi phí ước tính đã ghi nhận</dt>
                  <dd>{cost(data.estimatedCostUsd)}</dd>
                  <small>
                    {count(data.pricedRequests)}/{count(data.requests)} lượt có
                    đủ dữ liệu tính phí
                  </small>
                </div>
                <div>
                  <dt>Lượt gọi AI</dt>
                  <dd>{count(data.requests)}</dd>
                  <small>
                    {count(data.completed)} phản hồi hoàn tất ·{" "}
                    {count(data.failed)} lỗi · {count(data.pending)} chưa xác
                    định
                  </small>
                </div>
                <div>
                  <dt>Token đã ghi nhận</dt>
                  <dd>{count(data.inputTokens + data.outputTokens)}</dd>
                  <small>
                    {count(data.inputTokens)} đầu vào ·{" "}
                    {count(data.outputTokens)} đầu ra ·{" "}
                    {count(data.cachedTokens)} đầu vào cache
                  </small>
                </div>
              </dl>
              {data.unpricedRequests > 0 && (
                <p className="admin-ai-warning" role="status">
                  {count(data.unpricedRequests)} lượt chưa đủ token hoặc đơn giá
                  để tính phí; tổng dưới đây chưa bao gồm những lượt này.
                </p>
              )}
              <div className="admin-ai-details">
                <div>
                  <h4>Chi phí theo ngày</h4>
                  {data.pricedRequests > 0 ? (
                    <DashboardBars
                      key={month}
                      rows={days}
                      format={usd}
                      axisFormat={usd}
                      chartLabel="Chi phí AI đã tính được theo ngày"
                      caption="Đơn vị: USD · Chỉ gồm phần chi phí đã có token và đơn giá."
                    />
                  ) : (
                    <p className="dashboard-chart-empty">
                      Chưa đủ dữ liệu để vẽ biểu đồ chi phí.
                    </p>
                  )}
                </div>
                <div className="admin-ai-features">
                  <h4>Theo chức năng</h4>
                  {data.features.map((row) => (
                    <div key={row.feature}>
                      <div>
                        <strong>{row.label}</strong>
                        <small>
                          {count(row.requests)} lượt ·{" "}
                          {count(row.inputTokens + row.outputTokens)} token
                          {row.unpricedRequests > 0
                            ? ` · ${count(row.unpricedRequests)} lượt chưa tính phí`
                            : ""}
                        </small>
                      </div>
                      <span>{cost(row.estimatedCostUsd)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="admin-ai-models">
                <h4>Theo model</h4>
                {data.models.map((row) => (
                  <div key={row.model}>
                    <span>{row.model}</span>
                    <span>{count(row.requests)} lượt</span>
                    <strong>{cost(row.estimatedCostUsd)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="dashboard-caption">
            Chi phí ước tính từ token OpenAI trả về và đơn giá lưu tại lúc gọi,
            gồm cả phản hồi lỗi có token. Không phải hóa đơn thanh toán; không
            bao gồm dữ liệu trước khi bật ghi nhận. Chatbot trả lời nội bộ không
            gọi AI thì không phát sinh lượt. Chi phí này được theo dõi riêng với
            doanh thu dịch vụ.
          </p>
        </>
      )}
    </Card>
  );
}
