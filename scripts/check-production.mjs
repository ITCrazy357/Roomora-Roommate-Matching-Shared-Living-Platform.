import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    try {
      const r = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await r.json();
      return {
        status: r.status,
        ready:
          r.status === 200 &&
          body.status === "ok" &&
          body.service === "roomora-api" &&
          body.database === "up" &&
          body.schema === "up" &&
          ["up", "disabled"].includes(body.redis),
      };
    } catch {
      return { status: null, ready: false };
    }
  }
  const [direct, proxy, home] = await Promise.all([
    readiness(new URL("/api/v1/health/ready", backend)),
    readiness(new URL("/api/v1/health/ready", frontend)),
    (async () => {
      try {
        const r = await fetch(frontend, {
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        await r.arrayBuffer();
        return {
          status: r.status,
          csp: /script-src[^;]*'nonce-[^']+'/.test(
            r.headers.get("content-security-policy") || "",
          ),
        };
      } catch {
        return { status: null, csp: false };
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
  const response = await fetch(
    `https://api.github.com/repos/${path}/actions/artifacts?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error("Artifact lookup failed");
  const body = await response.json();
  const dates = (body.artifacts || [])
    .filter(
      (x) =>
        x.name.startsWith("database-encrypted-") &&
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
    let result;
    // Retries handle short network failures; no continuous traffic or load test.
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await checkProduction({
        site: process.env.SITE_URL,
        api: process.env.API_ORIGIN,
      });
      if (result.healthy) break;
      if (attempt < 2) await new Promise((ok) => setTimeout(ok, 3000));
    }
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
