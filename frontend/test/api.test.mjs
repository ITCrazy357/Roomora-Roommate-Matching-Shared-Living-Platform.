import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { apiFetch, ApiError } from "../src/lib/api.ts";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:5000/api/v1/";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalUrl;
});

test("joins the API prefix and reads a successful JSON response", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://localhost:5000/api/v1/health");
    assert.equal(options.headers.get("Accept"), "application/json");
    return Response.json({ status: "ok" });
  };
  assert.deepEqual(await apiFetch("/health"), { status: "ok" });
});

test("preserves HTTP status without exposing the internal response", async () => {
  globalThis.fetch = async () =>
    new Response("secret database error", { status: 503 });
  await assert.rejects(apiFetch("/health/ready"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.kind, "http");
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /secret|database/);
    return true;
  });
});

test("classifies network failures", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(apiFetch("/health"), { kind: "network" });
});

test("aborts a stalled request on timeout", async () => {
  let aborted = false;
  globalThis.fetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(signal.reason);
        },
        { once: true },
      );
    });
  await assert.rejects(apiFetch("/health", { timeoutMs: 10 }), {
    kind: "timeout",
  });
  assert.equal(aborted, true);
});

test("rejects malformed JSON", async () => {
  globalThis.fetch = async () => new Response("not-json");
  await assert.rejects(apiFetch("/health"), { kind: "response" });
});

test("preserves caller cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async (_url, { signal }) => {
    signal.throwIfAborted();
  };
  await assert.rejects(apiFetch("/health", { signal: controller.signal }), {
    name: "AbortError",
  });
});

test("rejects missing configuration before making a request", async () => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  globalThis.fetch = async () => {
    assert.fail("must not send a request");
  };
  await assert.rejects(apiFetch("/health"), { kind: "config" });
});
