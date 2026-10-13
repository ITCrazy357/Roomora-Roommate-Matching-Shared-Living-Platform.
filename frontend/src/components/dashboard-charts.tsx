"use client";

import { useCallback, useMemo, useState } from "react";
import { graphic, type EChartsCoreOption } from "echarts/core";
import { DashboardChart, chartColor, chartTooltip } from "./dashboard-chart";

export const dashboardColors = [
  "var(--chart-coral)", "var(--chart-blue)", "var(--chart-amber)",
  "var(--chart-green)", "var(--chart-violet)", "var(--chart-peach)", "var(--chart-brown)",
];
export type DashboardRow = { label: string; amount: number; color?: string };
const compactNumber = (amount: number) => new Intl.NumberFormat("vi-VN", {
  notation: "compact", maximumFractionDigits: 1,
}).format(amount);

function axes() {
  return {
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: {
      type: "category", axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: chartColor("var(--muted)"), fontSize: 11, margin: 16 },
    },
    yAxis: {
      type: "value", splitNumber: 3,
      axisLabel: { color: chartColor("var(--muted)"), fontSize: 11, formatter: compactNumber },
      splitLine: { lineStyle: { color: chartColor("var(--border)"), type: "dashed" } },
    },
  };
}

export function DashboardDonut({ rows, label, value, format }: {
  rows: DashboardRow[]; label: string; value: string; format: (amount: number) => string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const active = rows.find((row) => row.label === selected);
  const positive = useMemo(() => rows.filter((row) => row.amount > 0), [rows]);
  const option = useCallback((): EChartsCoreOption => ({
    tooltip: chartTooltip(positive, format, "item"),
    series: [{
      type: "pie", radius: ["74%", "94%"], center: ["50%", "50%"],
      startAngle: 90, padAngle: positive.length > 1 ? 2 : 0,
      label: { show: false }, labelLine: { show: false },
      itemStyle: { borderRadius: 5 },
      emphasis: { scale: true, scaleSize: 5 },
      data: positive.map((row) => ({
        name: row.label, value: row.amount,
        itemStyle: {
          color: chartColor(row.color ?? dashboardColors[rows.indexOf(row) % dashboardColors.length]),
          opacity: !selected || selected === row.label ? 1 : 0.22,
        },
      })),
    }],
  }), [rows, positive, selected, format]);
  return (
    <div className="dashboard-distribution">
      <div className="dashboard-donut">
        {total > 0 ? <DashboardChart option={option} rows={positive} format={format}
          label={`${label}: ${value}`} onSelect={(index) => {
            const name = positive[index]?.label;
            if (name) setSelected(selected === name ? null : name);
          }} /> : <div className="dashboard-empty-ring" aria-hidden="true" />}
        <div className="dashboard-donut-center" aria-live="polite">
          <small>{active?.label ?? label}</small>
          <strong>{active ? format(active.amount) : value}</strong>
          <span>{active && total ? `${(Math.max(0, active.amount) / total * 100).toFixed(1)}%` : "Tổng cộng"}</span>
        </div>
      </div>
      <div className="dashboard-legend" aria-label="Chi tiết biểu đồ">
        {rows.map((row, index) => (
          <button key={row.label} type="button" className={row.amount <= 0 ? "dashboard-legend-zero" : undefined} aria-pressed={selected === row.label}
            onClick={() => setSelected(selected === row.label ? null : row.label)}>
            <i style={{ background: row.color ?? dashboardColors[index % dashboardColors.length] }} aria-hidden="true" />
            <span>{row.label}</span><strong>{format(row.amount)}</strong>
            <small>{total ? (Math.max(0, row.amount) / total * 100).toFixed(1) : "0"}%</small>
            <div className="dashboard-legend-track" aria-hidden="true">
              <div style={{ width: `${total ? Math.max(0, row.amount) / total * 100 : 0}%`, background: row.color ?? dashboardColors[index % dashboardColors.length] }} />
            </div>
          </button>
        ))}
        {total === 0 && <p className="dashboard-chart-empty">Chưa có dữ liệu để thể hiện tỷ trọng.</p>}
      </div>
    </div>
  );
}

export function DashboardBars({ rows, format, cumulative = false }: {
  rows: DashboardRow[]; format: (amount: number) => string; cumulative?: boolean;
}) {
  const data = useMemo(() => rows.reduce<DashboardRow[]>((result, row) => [
    ...result, { ...row, amount: cumulative ? (result.at(-1)?.amount ?? 0) + row.amount : row.amount },
  ], []), [rows, cumulative]);
  const option = useCallback((): EChartsCoreOption => {
    const base = axes();
    const coral = chartColor("var(--chart-coral)");
    return {
      ...base,
      xAxis: { ...base.xAxis, boundaryGap: !cumulative, data: rows.map((_, index) => String(index + 1)) },
      tooltip: chartTooltip(data, format, "axis", cumulative ? rows : undefined),
      series: [cumulative ? {
        type: "line", step: "end", data: data.map((row) => row.amount),
        symbol: "circle", symbolSize: 7, showSymbol: false,
        lineStyle: { color: coral, width: 3 }, itemStyle: { color: coral },
        areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: chartColor("var(--primary-soft)") },
          { offset: 1, color: chartColor("var(--surface)") },
        ]), opacity: 0.8 },
        emphasis: { focus: "series" },
      } : {
        type: "bar", barMaxWidth: 24, barWidth: "65%", barMinHeight: 0,
        data: rows.map((row) => ({ value: row.amount, itemStyle: {
          color: row.amount < 0 ? chartColor("var(--chart-blue)") : coral,
          borderRadius: row.amount < 0 ? [0, 0, 5, 5] : [5, 5, 0, 0],
        } })),
        emphasis: { itemStyle: { opacity: 0.8 } },
      }],
    };
  }, [rows, data, format, cumulative]);
  return (
    <div className="dashboard-bars">
      {cumulative && <div className="dashboard-chart-total">
        <strong>{format(data.at(-1)?.amount ?? 0)}</strong>
        <span><i aria-hidden="true" /> Chi tiêu lũy kế</span>
      </div>}
      <div className="dashboard-plot">
        <DashboardChart option={option} rows={data} format={format}
          label={cumulative ? "Chi tiêu lũy kế từng ngày" : "Chi phí và điều chỉnh theo ngày"} />
      </div>
      <p className="dashboard-caption">{cumulative
        ? "Đơn vị: đồng · Cộng dồn khoản chi và điều chỉnh đến từng ngày."
        : "Đơn vị: đồng · Cột xanh âm là phần giảm chi phí."}</p>
    </div>
  );
}

export function DashboardStatusBars({ rows, format = String }: {
  rows: DashboardRow[]; format?: (amount: number) => string;
}) {
  const option = useCallback((): EChartsCoreOption => {
    const base = axes();
    return {
      ...base,
      grid: { left: 4, right: 60, top: 4, bottom: 8, containLabel: true },
      xAxis: { ...base.yAxis, minInterval: rows.every((row) => Number.isInteger(row.amount)) ? 1 : undefined },
      yAxis: { ...base.xAxis, inverse: true, data: rows.map((row) => row.label),
        axisLabel: { ...base.xAxis.axisLabel, width: 105, overflow: "truncate", margin: 12 } },
      tooltip: chartTooltip(rows, format, "axis"),
      series: [{
        type: "bar", barWidth: 14,
        data: rows.map((row, index) => ({ value: row.amount, itemStyle: {
          color: chartColor(row.color ?? dashboardColors[index % dashboardColors.length]),
          borderRadius: row.amount < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0],
        } })),
        label: { show: true, position: "right", color: chartColor("var(--foreground)"), fontWeight: 600,
          formatter: (params: { value: unknown }) => {
            const amount = Number(params.value);
            return Math.abs(amount) >= 10000 ? compactNumber(amount) : format(amount);
          } },
      }],
    };
  }, [rows, format]);
  return <div className="dashboard-status-chart">
    <div className="dashboard-status-plot" style={{ height: Math.max(180, rows.length * 48) }}>
      <DashboardChart option={option} rows={rows} format={format} label="So sánh theo danh mục" />
    </div>
  </div>;
}
