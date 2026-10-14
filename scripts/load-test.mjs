import { writeFile } from "node:fs/promises";
import { availableParallelism, cpus, totalmem } from "node:os";

const base = new URL(
  process.env.LOAD_BASE_URL ?? "http://127.0.0.1:5000/api/v1",
);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 10);
const requests = Number(process.env.LOAD_REQUESTS ?? 200);
const cookie = process.env.LOAD_COOKIE;
const paths = (
  process.env.LOAD_PATHS ?? "/health/ready,/listings?limit=12"
).split(",");
if (
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password
)
  throw new Error("Invalid base URL");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
  process.env.LOAD_ALLOW_REMOTE !== "true"
) {
  throw new Error(
    "Set LOAD_ALLOW_REMOTE=true only for a server you are authorized to load test",
  );
}
if (
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 100 ||
  !Number.isInteger(requests) ||
  requests < concurrency ||
  requests > 10000 ||
  paths.some((path) => !path.startsWith("/") || path.startsWith("//"))
)
  throw new Error("Invalid load limits or paths");

const samples = paths.map((path) => ({
  path: path.split("?")[0],
  durations: [],
  statuses: {},
  errors: 0,
}));
let next = 0;
async function run(index, measured) {
  const route = index % paths.length;
  const started = performance.now();
  let status = "network_error";
  try {
    const response = await fetch(
      `${base.href.replace(/\/$/, "")}${paths[route]}`,
      {
        headers: cookie ? { Cookie: cookie } : {},
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      },
    );
    // Include transfer time, rather than measuring time to headers only.
    await response.arrayBuffer();
    status = String(response.status);
    if (measured && !response.ok) samples[route].errors++;
  } catch {
    if (measured) samples[route].errors++;
  }
  if (measured) {
    samples[route].durations.push(performance.now() - started);
    samples[route].statuses[status] =
      (samples[route].statuses[status] ?? 0) + 1;
  }
}
// Warm connections and code paths before the measured run.
for (let i = 0; i < Math.max(paths.length, concurrency); i++)
  await run(i, false);
const started = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < requests) await run(next++, true);
  }),
);
const elapsedMs = performance.now() - started;
const percentile = (rows, value) =>
  Math.round(rows[Math.ceil(rows.length * value) - 1] ?? 0);
const report = {
  generatedAt: new Date().toISOString(),
  host: base.host,
  concurrency,
  requests,
  elapsedMs: Math.round(elapsedMs),
  requestsPerSecond: Math.round((requests / elapsedMs) * 1000 * 10) / 10,
  environment: {
    node: process.version,
    cpu: cpus()[0]?.model,
    cores: availableParallelism(),
    memoryGiB: Math.round(totalmem() / 2 ** 30),
  },
  routes: samples.map(({ path, durations, statuses, errors }) => {
    durations.sort((a, b) => a - b);
    return {
      path,
      requests: durations.length,
      errors,
      statuses,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99),
      maxMs: Math.round(durations.at(-1) ?? 0),
    };
  }),
};
const json = JSON.stringify(report, null, 2);
if (process.env.LOAD_REPORT)
  await writeFile(process.env.LOAD_REPORT, `${json}\n`, { flag: "wx" });
console.log(json);
if (report.routes.some((route) => route.errors)) process.exitCode = 1;
