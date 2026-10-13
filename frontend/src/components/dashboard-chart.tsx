"use client";

import { useEffect, useRef, useState } from "react";
import { init, use as registerCharts, type EChartsCoreOption, type EChartsType } from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { DashboardRow } from "./dashboard-charts";

registerCharts([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer]);

// Resolve nested theme variables to concrete colors for the SVG renderer.
export function chartColor(value: string): string {
  const theme = getComputedStyle(document.documentElement);
  let result = value;
  for (let depth = 0; depth < 8 && result.startsWith("var("); depth++) {
    result = theme.getPropertyValue(result.slice(4, -1)).trim();
  }
  return result;
}

export function chartTooltip(rows: DashboardRow[], format: (amount: number) => string,
  trigger: "item" | "axis", daily?: DashboardRow[]) {
  return {
    trigger, confine: true, backgroundColor: "transparent", borderWidth: 0, padding: 0,
    extraCssText: "box-shadow:none;z-index:10;",
    axisPointer: { type: "line", lineStyle: { color: chartColor("var(--border-strong)"), type: "dashed" } },
    formatter: (input: unknown) => {
      const point = (Array.isArray(input) ? input[0] : input) as { dataIndex: number };
      const row = rows[point.dataIndex];
      const box = document.createElement("div");
      box.className = "dashboard-tooltip";
      if (!row) return box;
      const label = document.createElement("span");
      label.textContent = row.label;
      const amount = document.createElement("strong");
      amount.textContent = format(row.amount);
      box.append(label, amount);
      if (daily) {
        const detail = document.createElement("small");
        detail.textContent = `Trong ngày: ${format(daily[point.dataIndex].amount)}`;
        box.append(detail);
      }
      return box;
    },
  };
}

export function DashboardChart({ option, rows, format, label, onSelect }: {
  option: () => EChartsCoreOption; rows: DashboardRow[];
  format: (amount: number) => string; label: string; onSelect?: (index: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<EChartsType | null>(null);
  const description = `${label}. Dùng phím mũi tên để xem từng giá trị.`;
  const current = useRef({ option, rows, format, onSelect, description });
  const position = useRef(-1);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => { current.current = { option, rows, format, onSelect, description }; }, [option, rows, format, onSelect, description]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => instance.current?.setOption({
      ...current.current.option(),
      textStyle: { fontFamily: getComputedStyle(element).fontFamily },
      aria: { enabled: true, label: { description: current.current.description } }, animation: !motion.matches,
      animationDuration: 1100, animationEasing: "cubicOut",
      animationDurationUpdate: motion.matches ? 0 : 300,
    }, { notMerge: true });
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || instance.current) return;
      instance.current = init(element, undefined, { renderer: "svg" });
      instance.current.on("click", (event) => {
        if (typeof event.dataIndex === "number") current.current.onSelect?.(event.dataIndex);
      });
      update();
      observer.disconnect();
    }, { threshold: 0.1 });
    const resize = new ResizeObserver(() => instance.current?.resize());
    resize.observe(element);
    observer.observe(element);
    motion.addEventListener("change", update);
    const theme = new MutationObserver(update);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect(); resize.disconnect(); theme.disconnect(); motion.removeEventListener("change", update);
      instance.current?.dispose(); instance.current = null;
    };
  }, []);
  useEffect(() => {
    if (!instance.current || !host.current) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    instance.current.setOption({ ...option(),
      textStyle: { fontFamily: getComputedStyle(host.current).fontFamily },
      aria: { enabled: true, label: { description } }, animation: !reduced,
      animationDuration: 1100, animationEasing: "cubicOut", animationDurationUpdate: reduced ? 0 : 300,
    }, { replaceMerge: ["series"] });
    position.current = -1;
  }, [option, description]);
  return <>
    <div ref={host} className="dashboard-echart" role="group" tabIndex={rows.length ? 0 : undefined}
      aria-label={description}
      onBlur={() => instance.current?.dispatchAction({ type: "hideTip" })}
      onKeyDown={(event) => {
        if (!rows.length) return;
        if (event.key === "Escape") {
          instance.current?.dispatchAction({ type: "hideTip" }); return;
        }
        if ((event.key === "Enter" || event.key === " ") && position.current >= 0 && onSelect) {
          event.preventDefault(); onSelect(position.current); return;
        }
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
        const index = position.current < 0 ? (direction > 0 ? 0 : rows.length - 1)
          : (position.current + direction + rows.length) % rows.length;
        position.current = index;
        instance.current?.dispatchAction({ type: "downplay", seriesIndex: 0 });
        instance.current?.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: index });
        instance.current?.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: index });
        setAnnouncement(`${rows[index].label}: ${format(rows[index].amount)}`);
      }} />
    <span className="sr-only" aria-live="polite">{announcement}</span>
    <ul className="sr-only">{rows.map((row) => <li key={row.label}>{row.label}: {format(row.amount)}</li>)}</ul>
  </>;
}
