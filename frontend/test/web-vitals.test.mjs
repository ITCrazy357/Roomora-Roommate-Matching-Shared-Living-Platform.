import { test } from "node:test";
import assert from "node:assert/strict";
import { performanceRoute } from "../src/lib/web-vitals.ts";

test("performance labels exclude private routes and strip public listing identifiers", () => {
  assert.equal(performanceRoute("/phong/fixture-id"), "listing");
  assert.equal(performanceRoute("/tim-phong"), "listings");
  for (const path of [
    "/tin-nhan/private",
    "/nha-chung/private",
    "/tai-khoan/ho-so",
    "/dat-lai-mat-khau",
    "/admin",
  ])
    assert.equal(performanceRoute(path), null);
});
