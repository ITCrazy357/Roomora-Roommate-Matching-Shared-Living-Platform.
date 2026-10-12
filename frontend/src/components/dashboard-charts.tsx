"use client";

import { useState } from "react";

export const dashboardColors = [
  "var(--chart-coral)",
  "var(--chart-blue)",
  "var(--chart-amber)",
  "var(--chart-green)",
  "var(--chart-violet)",
  "var(--chart-peach)",
  "var(--chart-brown)",
];

export function DashboardDonut({
  rows,
  label,
  value,
  format,
}: {
  rows: { label: string; amount: number }[];
  label: string;
  value: string;
  format: (amount: number) => string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  return (
    <div className="dashboard-distribution">
      <div className="dashboard-donut">
        <svg
          viewBox="0 0 200 200"
          role="img"
          aria-label={`${label}: ${value}. Chi tiết bên cạnh.`}
        >
          <circle
            cx="100"
            cy="100"
            r="76"
            fill="none"
            stroke="var(--surface-muted)"
            strokeWidth="20"
          />
          {rows.map((row, index) => {
            const length = total ? (Math.max(0, row.amount) / total) * 100 : 0;
            const start = total
              ? (rows
                  .slice(0, index)
                  .reduce((sum, item) => sum + Math.max(0, item.amount), 0) /
                  total) *
                100
              : 0;
            return (
              <circle
                key={row.label}
                cx="100"
                cy="100"
                r="76"
                pathLength="100"
                fill="none"
                stroke={dashboardColors[index % dashboardColors.length]}
                strokeWidth="20"
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={-start}
                transform="rotate(-90 100 100)"
                opacity={selected === null || selected === index ? 1 : 0.25}
              >
                <title>
                  {row.label}: {format(row.amount)} ({length.toFixed(1)}%)
                </title>
              </circle>
            );
          })}
        </svg>
        <div className="dashboard-donut-center">
          <small>{label}</small>
          <strong>{value}</strong>
        </div>
      </div>
      <div className="dashboard-legend" aria-label="Chi tiết biểu đồ">
        {rows.map((row, index) => (
          <button
            key={row.label}
            type="button"
            aria-pressed={selected === index}
            onClick={() => setSelected(selected === index ? null : index)}
          >
            <i
              style={{
                background: dashboardColors[index % dashboardColors.length],
              }}
              aria-hidden="true"
            />
            <span>{row.label}</span>
            <strong>{format(row.amount)}</strong>
            <small>
              {total
                ? ((Math.max(0, row.amount) / total) * 100).toFixed(1)
                : "0"}
              %
            </small>
          </button>
        ))}
        {total === 0 && (
          <p className="text-muted">
            Chưa có số liệu dương để thể hiện tỷ trọng.
          </p>
        )}
      </div>
    </div>
  );
}

export function DashboardBars({
  rows,
  format,
}: {
  rows: { label: string; amount: number }[];
  format: (amount: number) => string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const maximum = Math.max(1, ...rows.map((row) => row.amount));
  const minimum = Math.min(0, ...rows.map((row) => row.amount));
  const y = (amount: number) =>
    175 - ((amount - minimum) / (maximum - minimum)) * 140;
  const step = 580 / rows.length;
  const active = selected === null ? null : rows[selected];
  return (
    <div className="dashboard-bars">
      <div className="dashboard-chart-readout" aria-live="polite">
        <span>{active ? active.label : "Chọn một cột để xem số tiền"}</span>
        <strong>{active ? format(active.amount) : "Chi phí theo ngày"}</strong>
      </div>
      <div
        className="dashboard-plot"
        role="region"
        tabIndex={0}
        aria-label="Biểu đồ chi tiêu, có thể cuộn ngang để xem từng ngày"
      >
        <svg
          viewBox="0 0 620 215"
          role="group"
          aria-label="Chi phí và điều chỉnh theo ngày. Chọn cột bằng chuột hoặc bàn phím."
        >
          <text x="20" y="19" fill="var(--muted)" fontSize="11">
            {format(Math.max(0, ...rows.map((row) => row.amount)))}
          </text>
          {[0, 0.5, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1="20"
                x2="600"
                y1={y(minimum + (maximum - minimum) * ratio)}
                y2={y(minimum + (maximum - minimum) * ratio)}
                stroke="var(--border)"
                strokeDasharray="3 4"
              />
            </g>
          ))}
          <line
            x1="20"
            x2="600"
            y1={y(0)}
            y2={y(0)}
            stroke="var(--border-strong)"
          />
          {rows.map((row, index) => (
            <g
              key={row.label}
              role="button"
              tabIndex={0}
              aria-label={`${row.label}: ${format(row.amount)}`}
              aria-pressed={selected === index}
              className="dashboard-bar"
              onMouseEnter={() => setSelected(index)}
              onFocus={() => setSelected(index)}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(index);
                }
              }}
            >
              <rect
                x={20 + index * step}
                y="25"
                width={step}
                height="160"
                fill="transparent"
              />
              <rect
                x={22 + index * step}
                y={Math.min(y(0), y(row.amount)) - (row.amount === 0 ? 2 : 0)}
                width={Math.max(3, step - 5)}
                height={Math.max(2, Math.abs(y(row.amount) - y(0)))}
                rx="3"
                fill={
                  selected === index
                    ? "var(--primary)"
                    : row.amount < 0
                      ? "var(--chart-blue)"
                      : "var(--foreground)"
                }
              />
              {(index % 5 === 0 ||
                selected === index ||
                index === rows.length - 1) && (
                <text
                  x={20 + index * step + step / 2}
                  y="201"
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize="11"
                >
                  {index + 1}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="dashboard-caption">
        Đơn vị: đồng · Cột âm là phần giảm chi phí sau điều chỉnh.
      </p>
    </div>
  );
}
