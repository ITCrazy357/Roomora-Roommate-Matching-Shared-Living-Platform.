import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function requestError(error) {
  if (["TimeoutError", "AbortError"].includes(error?.name)) return "TIMEOUT";
  if (error instanceof SyntaxError) return "INVALID_JSON";
  return "NETWORK_ERROR";
}

export async function checkProduction({ site, api, timeoutMs = 20000 }) {
  const frontend = new URL(site);
  const backend = new URL(api);
  for (const url of [frontend, backend]) {
    const local = ["127.0.0.1", "localhost"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("Invalid origin");
  }
  async function readiness(url) {
    const started = performance.now();
    let status = null;
    try {
      const r = await fetch(url, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = r.status;
      const body = await r.json();
      return {
        status,
        elapsedMs: Math.round(performance.now() - started),
        ready:
          r.status === 200 &&
          body?.status === "ok" &&
          body?.service === "roomora-api" &&
          body?.database === "up" &&
          body?.schema === "up" &&
          ["up", "disabled"].includes(body?.redis),
      };
    } catch (error) {
      return {
        status,
        ready: false,
        elapsedMs: Math.round(performance.now() - started),
        error: requestError(error),
      };
    }
  }
  const [direct, proxy, home] = await Promise.all([
    readiness(new URL("/api/v1/health/ready", backend)),
    readiness(new URL("/api/v1/health/ready", frontend)),
    (async () => {
      const started = performance.now();
      let status = null;
      try {
        const r = await fetch(frontend, {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        status = r.status;
        await r.arrayBuffer();
        return {
          status,
          elapsedMs: Math.round(performance.now() - started),
          csp: /script-src[^;]*'nonce-[^']+'/.test(
            r.headers.get("content-security-policy") || "",
          ),
        };
      } catch (error) {
        return {
          status,
          csp: false,
          elapsedMs: Math.round(performance.now() - started),
          error: requestError(error),
        };
      }
    })(),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    direct,
    proxy,
    home,
    healthy: direct.ready && proxy.ready && home.status === 200 && home.csp,
  };
}

export async function checkProductionWithRetries({
  site,
  api,
  timeoutMs = 20000,
  retryDelayMs = 5000,
}) {
  const attempts = [];
  // At most 5 * 20s + 4 * 5s = 120s for health checks. A recovered service
  // must pass all checks in the same attempt; earlier success cannot mask failure.
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await checkProduction({ site, api, timeoutMs });
    attempts.push(result);
    if (result.healthy || attempt === 4) return { ...result, attempts };
    await new Promise((ok) => setTimeout(ok, retryDelayMs));
  }
}

export async function backupArtifactFresh({
  repository,
  token,
  maxAgeHours = 26,
}) {
  if (
    !/^[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*$/.test(repository || "") ||
    !token
  )
    throw new Error("Invalid GitHub configuration");
  const path = repository.split("/").map(encodeURIComponent).join("/");
  async function github(resource) {
    const response = await fetch(
      `https://api.github.com/repos/${path}/actions/${resource}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("Backup metadata lookup failed");
    return response.json();
  }
  const [body, runs] = await Promise.all([
    github("artifacts?per_page=100"),
    github(
      "workflows/database-backup.yml/runs?branch=main&status=success&per_page=100",
    ),
  ]);
  // A failed drill still retains its recovery file. It must not make monitoring green.
  const successfulRuns = new Set(
    (runs.workflow_runs || [])
      .filter(
        (run) =>
          run.status === "completed" &&
          run.conclusion === "success" &&
          run.head_branch === "main",
      )
      .map((run) => run.id),
  );
  const dates = (body.artifacts || [])
    .filter(
      (x) =>
        successfulRuns.has(x.workflow_run?.id) &&
        x.workflow_run.head_branch === "main" &&
        x.name === `database-encrypted-${x.workflow_run.id}` &&
        !x.expired &&
        x.size_in_bytes > 0,
    )
    .map((x) => Date.parse(x.created_at))
    .filter(Number.isFinite);
  const age = dates.length ? (Date.now() - Math.max(...dates)) / 3600000 : null;
  return {
    backupArtifactAgeHours: age,
    backupArtifactFresh: age !== null && age >= 0 && age <= maxAgeHours,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await checkProductionWithRetries({
      site: process.env.SITE_URL,
      api: process.env.API_ORIGIN,
    });
    const backup =
      process.env.CHECK_BACKUP_ARTIFACT === "true"
        ? await backupArtifactFresh({
            repository: process.env.GITHUB_REPOSITORY,
            token: process.env.GITHUB_TOKEN,
          })
        : null;
    console.log(JSON.stringify({ ...result, ...backup }));
    process.exitCode =
      result.healthy && (!backup || backup.backupArtifactFresh) ? 0 : 1;
  } catch {
    console.error(
      JSON.stringify({ healthy: false, error: "PRODUCTION_CHECK_FAILED" }),
    );
    process.exitCode = 1;
  }
}
