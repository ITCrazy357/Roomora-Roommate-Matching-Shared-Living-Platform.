import { chromium, devices } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const site = new URL(
  process.env.PERF_SITE_URL || "https://roomora-blond.vercel.app",
);
const allowed = ["roomora-blond.vercel.app", "localhost", "127.0.0.1"];
if (
  !allowed.includes(site.hostname) ||
  (site.protocol !== "https:" &&
    !(
      site.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(site.hostname)
    )) ||
  site.username ||
  site.password ||
  site.search ||
  site.hash ||
  site.pathname !== "/"
)
  throw new Error("Invalid measurement origin");
const runs = Number(process.env.PERF_RUNS || 3);
if (!Number.isInteger(runs) || runs < 1 || runs > 5)
  throw new Error("Bounded runs required");
const routeNames = (process.env.PERF_ROUTES || "home,listings,listing").split(
  ",",
);
if (
  !routeNames.length ||
  routeNames.some((name) => !["home", "listings", "listing"].includes(name))
)
  throw new Error("Invalid measurement routes");
const proxyValue = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const proxyUrl = proxyValue ? new URL(proxyValue) : null;
const proxy = proxyUrl
  ? {
      server: proxyUrl.origin,
      bypass: "localhost,127.0.0.1",
      ...(proxyUrl.username
        ? {
            username: decodeURIComponent(proxyUrl.username),
            password: decodeURIComponent(proxyUrl.password),
          }
        : {}),
    }
  : undefined;
const browser = await chromium.launch({ proxy });
const samples = [];
let apiAvailable = false;
try {
  const lookup = await browser.newContext();
  let first = null;
  try {
    const response = await lookup.request.get(
      new URL("/api/v1/listings?limit=1", site).href,
      { timeout: 60000 },
    );
    if (response.ok()) {
      const body = await response.json();
      apiAvailable = Array.isArray(body.items);
      first = body.items?.[0]?.id ?? null;
    }
  } catch {
    /* Still measure home/search when the API is unavailable. */
  }
  await lookup.close();
  const paths = [
    ["home", "/"],
    ["listings", "/tim-phong"],
    ...(first ? [["listing", `/phong/${first}`]] : []),
  ].filter(([route]) => routeNames.includes(route));
  if (!paths.length) throw new Error("No eligible public routes to measure");
  for (const [route, path] of paths)
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({ ...devices["Pixel 7"] });
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send("Network.enable");
      await session.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 1600000 / 8,
        uploadThroughput: 750000 / 8,
      });
      await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.addInitScript(() => {
        window.__lab = { lcpMs: null, cls: 0, maxInteractionMs: null };
        let start = 0,
          last = 0,
          total = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            window.__lab.lcpMs = e.startTime;
            window.__lab.lcpElement = {
              tag: e.element?.tagName,
              className: e.element?.className,
              image: e.url ? new URL(e.url).pathname : null,
              imageSource: e.url
                ? new URL(
                    new URL(e.url).searchParams.get("url") || e.url,
                    location.origin,
                  ).pathname
                : null,
              loadTime: e.loadTime,
              renderTime: e.renderTime,
            };
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue;
            if (
              !start ||
              e.startTime - last > 1000 ||
              e.startTime - start > 5000
            ) {
              start = e.startTime;
              total = 0;
            }
            last = e.startTime;
            total += e.value;
            window.__lab.cls = Math.max(window.__lab.cls, total);
          }
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            if (e.interactionId)
              window.__lab.maxInteractionMs = Math.max(
                window.__lab.maxInteractionMs || 0,
                e.duration,
              );
        }).observe({ type: "event", buffered: true, durationThreshold: 16 });
      });
      let pageErrors = 0;
      page.on("pageerror", () => pageErrors++);
      try {
        const navigation = await page.goto(new URL(path, site).href, {
          waitUntil: "load",
          timeout: 60000,
        });
        await page.waitForTimeout(5000);
        if (route === "listings") {
          await page
            .getByRole("button", { name: "Tìm tin", exact: true })
            .click();
          await page.waitForTimeout(500);
        }
        const sample = await page.evaluate(() => ({
          ...window.__lab,
          ttfbMs:
            performance.getEntriesByType("navigation")[0]?.responseStart ??
            null,
          resources: performance
            .getEntriesByType("resource")
            .filter((x) =>
              ["css", "script", "img", "link"].includes(x.initiatorType),
            )
            .map((x) => ({
              path: new URL(x.name).pathname,
              type: x.initiatorType,
              ms: Math.round(x.duration),
              bytes: x.transferSize,
              startMs: Math.round(x.startTime),
            })),
          overflow: document.documentElement.scrollWidth > innerWidth,
        }));
        samples.push({
          route,
          run: run + 1,
          status: navigation.status(),
          pageErrors,
          ...sample,
        });
      } catch {
        samples.push({ route, run: run + 1, failed: true });
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
}
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? null;
const report = {
  measuredAt: new Date().toISOString(),
  host: site.hostname,
  kind: "synthetic_mobile_lab",
  apiAvailable,
  profile: {
    device: "Pixel 7 emulation",
    latencyMs: 150,
    downloadMbps: 1.6,
    cpuSlowdown: 4,
    runs,
    routes: routeNames,
  },
  // maxInteractionMs is an Event Timing lab observation, not field INP.
  fieldCoreWebVitalsVerified: false,
  samples,
  routes: [...new Set(samples.map((x) => x.route))].map((route) => {
    const rows = samples.filter((x) => x.route === route && !x.failed);
    return {
      route,
      samples: rows.length,
      lcpP75Ms: percentile(
        rows.map((x) => x.lcpMs).filter(Number.isFinite),
        0.75,
      ),
      clsP75: percentile(rows.map((x) => x.cls).filter(Number.isFinite), 0.75),
      ttfbP75Ms: percentile(
        rows.map((x) => x.ttfbMs).filter(Number.isFinite),
        0.75,
      ),
    };
  }),
};
if (process.env.PERF_OUTPUT) {
  await mkdir(dirname(process.env.PERF_OUTPUT), { recursive: true });
  await writeFile(process.env.PERF_OUTPUT, JSON.stringify(report, null, 2), {
    flag: "wx",
  });
}
console.log(JSON.stringify(report, null, 2));
if (
  !report.apiAvailable ||
  samples.some(
    (x) => x.failed || x.status !== 200 || x.pageErrors || x.overflow,
  )
)
  process.exitCode = 1;
