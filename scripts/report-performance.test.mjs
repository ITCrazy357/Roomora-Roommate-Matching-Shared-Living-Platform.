import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizePerformance } from "./report-performance.mjs";

test("p75 deduplicates metric updates, separates devices and does not claim sparse samples pass", () => {
  const rows = Array.from({ length: 100 }, (_, id) => ({
    event: "web_vital",
    id: String(id),
    name: "LCP",
    value: (id + 1) * 100,
    route: "home",
    device: "mobile",
  }));
  rows.push({ ...rows[0], value: 50 });
  rows.push({
    message: {
      event: "web_vital",
      id: "desktop",
      name: "CLS",
      value: 0.05,
      route: "home",
      device: "desktop",
    },
  });
  rows.push({
    event: "http_request",
    route: "/listings",
    durationMs: 500,
    status: 200,
  });
  rows.push({
    event: "http_request",
    route: "/updates",
    durationMs: 99999,
    status: 200,
    streaming: true,
  });
  const report = summarizePerformance(rows);
  assert.equal(report.webVitals[0].samples, 100);
  assert.equal(report.webVitals[0].p75, 7500);
  assert.equal(report.webVitals[0].status, "needs_improvement");
  assert.equal(report.webVitals[1].status, "insufficient_samples");
  assert.equal(report.http.p95Ms, 500);
  assert.equal(report.webVitals[1].device, "desktop");
  assert.equal(summarizePerformance([]).http.p95Ms, null);
});
