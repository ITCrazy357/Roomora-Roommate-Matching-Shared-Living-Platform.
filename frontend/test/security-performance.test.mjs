import assert from "node:assert/strict";
import { test } from "node:test";
import { contentSecurityPolicy } from "../src/lib/security.ts";
import {
  publicImageLoader,
  isPublicCloudinaryImage,
} from "../src/lib/public-image.ts";

test("production CSP permits nonce scripts and configured API without unsafe eval", () => {
  const policy = contentSecurityPolicy("random-nonce", {
    apiBase: "https://api.example.test/api/v1",
    development: false,
    https: true,
  });
  assert.match(
    policy,
    /script-src 'self' 'nonce-random-nonce' 'strict-dynamic';/,
  );
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.match(policy, /connect-src 'self' https:\/\/api.example.test;/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /upgrade-insecure-requests/);
});

test("local development CSP allows debugging without forcing HTTPS", () => {
  const policy = contentSecurityPolicy("dev-nonce", {
    development: true,
    https: false,
    apiBase: "/api/v1",
  });
  assert.match(policy, /unsafe-eval/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
  assert.throws(() =>
    contentSecurityPolicy("n", {
      development: false,
      https: true,
      apiBase: "https://user:secret@example.test",
    }),
  );
});

test("public images receive responsive Cloudinary transforms", () => {
  const src =
    "https://res.cloudinary.com/demo/image/upload/v123/roomora/photo.jpg";
  assert.equal(isPublicCloudinaryImage(src), true);
  assert.equal(
    publicImageLoader({ src, width: 640, quality: 75 }),
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_75,c_limit,w_640/v123/roomora/photo.jpg",
  );
  assert.match(publicImageLoader({ src, width: 3840 }), /w_1600/);
});

test("private, signed and foreign image URLs retain their original access path", () => {
  for (const src of [
    "/api/v1/conversations/private/attachments/1",
    "blob:private-image",
    "https://example.test/image.jpg",
    "https://res.cloudinary.com/demo/image/upload/s--signed--/private.jpg",
  ]) {
    assert.equal(isPublicCloudinaryImage(src), false);
    assert.equal(publicImageLoader({ src, width: 640 }), src);
  }
});
