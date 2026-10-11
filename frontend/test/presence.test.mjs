import assert from "node:assert/strict";
import { test } from "node:test";
import { presenceStatus } from "../src/lib/presence.ts";

test("green status expires at three minutes even before the next API refresh", () => {
  const now = Date.parse("2026-10-11T10:00:00Z");
  const active = { online: true, lastActiveAt: new Date(now - 179000).toISOString() };
  assert.equal(presenceStatus(active, now).online, true);
  assert.deepEqual(presenceStatus(active, now + 1000), { online: false, label: "Hoạt động 3 phút trước" });
  assert.equal(presenceStatus({ ...active, online: false }, now).online, false);
});

test("shows minutes, hours and days without inventing activity for missing data", () => {
  const now = Date.parse("2026-10-11T10:00:00Z");
  for (const [minutes, label] of [[0, "Vừa hoạt động"], [3, "Hoạt động 3 phút trước"], [60, "Hoạt động 1 giờ trước"], [1440, "Hoạt động 1 ngày trước"]])
    assert.equal(presenceStatus({ online: false, lastActiveAt: new Date(now - minutes * 60000).toISOString() }, now).label, label);
  assert.equal(presenceStatus(undefined, now).online, false);
  assert.equal(presenceStatus({ online: true, lastActiveAt: "invalid" }, now).label, "Chưa có thông tin hoạt động");
});
