"use client";

import { useReportWebVitals } from "next/web-vitals";
import { apiUrl } from "@/lib/api";
import { performanceRoute } from "@/lib/web-vitals";

type Metric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

// Stable callback: registering a new function can replay previously reported metrics.
function report(metric: Metric) {
  if (
    process.env.NODE_ENV !== "production" ||
    navigator.webdriver ||
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  )
    return;
  // Bind each metric to its navigation, including late callbacks after a route change.
  const pathname = new URL(
    metric.navigationURL || location.href,
    location.origin,
  ).pathname;
  const route = performanceRoute(pathname);
  if (!route) return;
  try {
    void fetch(apiUrl("/telemetry/web-vitals"), {
      method: "POST",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: metric.id,
        name: metric.name,
        value: metric.value,
        route,
        device: matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
      }),
    }).catch(() => {});
  } catch {
    /* Metrics must never affect the application. */
  }
}

export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
