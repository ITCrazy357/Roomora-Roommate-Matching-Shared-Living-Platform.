import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const targets = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 };
export function summarizePerformance(records) {
  const metrics = new Map();
  const http = [];
  for (const row of records) {
    const entry =
      row?.message && typeof row.message === "object" ? row.message : row;
    if (
      entry?.event === "web_vital" &&
      Object.hasOwn(targets, entry.name) &&
      ["home", "listings", "listing", "people"].includes(entry.route) &&
      ["mobile", "desktop"].includes(entry.device) &&
      typeof entry.id === "string" &&
      Number.isFinite(entry.value) &&
      entry.value >= 0
    )
      metrics.set(
        `${entry.id}:${entry.name}:${entry.route}:${entry.device}`,
        entry,
      );
    if (
      entry?.event === "http_request" &&
      !entry.streaming &&
      typeof entry.route === "string" &&
      !entry.route.includes("health") &&
      !entry.route.includes("telemetry") &&
      Number.isFinite(entry.durationMs) &&
      entry.durationMs >= 0
    )
      http.push(entry);
  }
  const percentile = (values, p) =>
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? null;
  const groups = new Map();
  for (const entry of metrics.values()) {
    const key = `${entry.route}:${entry.device}:${entry.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry.value);
  }
  return {
    source: "application_logs",
    webVitals: [...groups.entries()].map(([key, values]) => {
      const [route, device, name] = key.split(":");
      const p75 = percentile(values, 0.75);
      return {
        route,
        device,
        name,
        samples: values.length,
        p75,
        target: targets[name],
        status:
          values.length < 100
            ? "insufficient_samples"
            : p75 <= targets[name]
              ? "good"
              : "needs_improvement",
      };
    }),
    http: {
      samples: http.length,
      p95Ms: percentile(
        http.map((x) => x.durationMs),
        0.95,
      ),
      errors5xx: http.filter((x) => x.status >= 500).length,
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const records = [];
  for await (const line of createInterface({ input: process.stdin })) {
    try {
      records.push(JSON.parse(line));
    } catch {
      /* Ignore non-JSON log lines. */
    }
  }
  console.log(JSON.stringify(summarizePerformance(records), null, 2));
}
