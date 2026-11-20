import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { Counter, Rate } from "k6/metrics";

// 1. Configure the API and the exact FRONTEND_ORIGIN accepted by OriginGuard.
const base = (__ENV.LOAD_BASE_URL || "http://127.0.0.1:5000/api/v1").replace(
  /\/$/,
  "",
);
const origin = __ENV.FRONTEND_ORIGIN;
const authority = "(?:\\[[0-9a-f:]+\\]|[a-z0-9.-]+)(?::[0-9]{1,5})?";
if (!new RegExp(`^https?://${authority}/api/v1$`, "i").test(base)) {
  throw new Error(
    "LOAD_BASE_URL must be an HTTP(S) URL ending in /api/v1, without credentials or query parameters.",
  );
}
if (!origin || !new RegExp(`^https?://${authority}$`, "i").test(origin)) {
  throw new Error(
    "Set FRONTEND_ORIGIN to the backend configured origin, without a trailing slash.",
  );
}
if (
  !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/api\/v1$/i.test(
    base,
  ) &&
  __ENV.LOAD_ALLOW_REMOTE !== "true"
) {
  throw new Error(
    "Remote tests require LOAD_ALLOW_REMOTE=true and authorization to test the target.",
  );
}

function integer(name, fallback, maximum) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

const vus = integer("TEST_VUS", 1, 50);
const meReads = integer("TEST_ME_READS", 1, 60);
const loginP95 = integer("LOGIN_P95_MS", 2000, 60000);
const meP95 = integer("ME_P95_MS", 1000, 60000);

// 2. One distinct, existing, verified password account per virtual user.
// open() resolves this path relative to this script, not the terminal directory.
const users = new SharedArray("login accounts", () => {
  const rows = JSON.parse(
    open(__ENV.USERS_FILE || "../../.verification/k6-users.json"),
  );
  if (!Array.isArray(rows) || rows.length < vus) {
    throw new Error("The users file must contain at least TEST_VUS accounts.");
  }
  const emails = new Set();
  for (const row of rows) {
    if (
      !row ||
      typeof row.email !== "string" ||
      !row.email.includes("@") ||
      typeof row.password !== "string" ||
      !row.password.length ||
      row.password.length > 128
    ) {
      throw new Error(
        "Every account needs an email and a nonempty password of at most 128 characters.",
      );
    }
    row.email = row.email.trim().toLowerCase();
    if (emails.has(row.email))
      throw new Error("Use distinct accounts, one per virtual user.");
    emails.add(row.email);
  }
  return rows;
});

const loginSuccess = new Rate("login_success");
const sessionSuccess = new Rate("session_success");
const journeySuccess = new Rate("journey_success");
const loginRateLimited = new Rate("login_rate_limited");
const completed = new Counter("completed_journeys");

// 3. Each VU runs ONE journey. A duration loop would repeatedly hit login limits.
export const options = {
  scenarios: {
    login_burst: {
      executor: "per-vu-iterations",
      vus,
      iterations: 1,
      maxDuration: "5m",
      gracefulStop: "30s",
    },
  },
  maxRedirects: 0,
  summaryTrendStats: ["avg", "min", "med", "max", "p(95)", "p(99)"],
  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate==0"],
    login_success: ["rate==1"],
    session_success: ["rate==1"],
    journey_success: ["rate==1"],
    login_rate_limited: ["rate==0"],
    completed_journeys: [`count==${vus}`],
    "http_req_duration{step:login}": [`p(95)<${loginP95}`],
    "http_req_duration{step:me}": [`p(95)<${meP95}`],
  },
};

function params(step) {
  return {
    headers: { "Content-Type": "application/json", Origin: origin },
    tags: { step, name: `auth/${step}` },
    timeout: "10s",
  };
}

function userFrom(response) {
  try {
    return response.json("user");
  } catch {
    return undefined;
  }
}

function reportFailure(step, response) {
  // Never log credentials, cookies, or response bodies.
  console.error(
    `VU ${exec.vu.idInTest}: ${step} failed (HTTP ${response.status}). See README.md.`,
  );
}

export default function () {
  const user = users[exec.vu.idInTest - 1];
  let authenticated = false;
  let validSession = false;
  let loggedOut = false;
  try {
    // 4. POST login. k6 stores Set-Cookie in this VU's own cookie jar.
    const login = http.post(
      `${base}/auth/login`,
      JSON.stringify({
        email: user.email,
        password: user.password,
      }),
      params("login"),
    );
    const identity = userFrom(login);
    const loginOk = check(login, {
      "login: HTTP 200": (r) => r.status === 200,
      "login: correct account": () =>
        Boolean(identity?.id && identity.email === user.email),
    });
    // Even a malformed 200 response might have created a session; try logout.
    authenticated = login.status === 200;
    loginSuccess.add(loginOk);
    loginRateLimited.add(login.status === 429);
    if (!loginOk) {
      sessionSuccess.add(false);
      reportFailure("login", login);
      return;
    }

    // 5. Check the saved cookie and the account identity on every read.
    validSession = true;
    for (let i = 0; i < meReads; i++) {
      const me = http.get(`${base}/auth/me`, params("me"));
      const current = userFrom(me);
      const meOk = check(me, {
        "me: HTTP 200": (r) => r.status === 200,
        "me: same user as login": () =>
          Boolean(current?.id === identity.id && current?.email === user.email),
      });
      sessionSuccess.add(meOk);
      validSession = validSession && meOk;
      if (!meOk) {
        reportFailure("me", me);
        break;
      }
      if (i + 1 < meReads) sleep(1);
    }
  } finally {
    // 6. Revoke only the session created by this VU, including after failed checks.
    if (authenticated) {
      const logout = http.post(`${base}/auth/logout`, null, params("logout"));
      loggedOut = check(logout, {
        "logout: HTTP 204": (r) => r.status === 204,
      });
      if (!loggedOut) reportFailure("logout", logout);
    }
    journeySuccess.add(authenticated && validSession && loggedOut);
    completed.add(1);
  }
}
