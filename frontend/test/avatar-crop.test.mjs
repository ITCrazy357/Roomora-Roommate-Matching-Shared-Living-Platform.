import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avatarGeometry,
  initialAvatarCrop,
  validAvatarBytes,
} from "../src/lib/avatar-crop.ts";

test("Portrait/landscape drag is clamped so the square never exposes an empty edge", () => {
  for (const [width, height] of [
    [1600, 400],
    [400, 1600],
    [640, 640],
    [901, 507],
  ]) {
    for (const rotation of [0, 90, 180, 270]) {
      for (const zoom of [0.1, 1, 1.7, 4, 10]) {
        for (const direction of [-1, 1]) {
          const geometry = avatarGeometry(width, height, {
            zoom,
            rotation,
            x: 100 * direction,
            y: -100 * direction,
          });
          const sideways = rotation % 180 !== 0;
          const halfWidth = ((sideways ? height : width) * geometry.scale) / 2;
          const halfHeight = ((sideways ? width : height) * geometry.scale) / 2;
          assert.ok(geometry.x - halfWidth <= -0.5 + 1e-10);
          assert.ok(geometry.x + halfWidth >= 0.5 - 1e-10);
          assert.ok(geometry.y - halfHeight <= -0.5 + 1e-10);
          assert.ok(geometry.y + halfHeight >= 0.5 - 1e-10);
          assert.ok(geometry.zoom >= 1 && geometry.zoom <= 4);
        }
      }
    }
  }
});

test("A quarter turn switches the axis available for positioning", () => {
  assert.deepEqual(
    avatarGeometry(800, 400, { ...initialAvatarCrop, x: 1, y: 1 }),
    { scale: 1 / 400, zoom: 1, x: 0.5, y: 0 },
  );
  assert.deepEqual(
    avatarGeometry(800, 400, {
      ...initialAvatarCrop,
      rotation: 90,
      x: 1,
      y: 1,
    }),
    { scale: 1 / 400, zoom: 1, x: 0, y: 0.5 },
  );
});

test("Rejects SVG/GIF/invalid bytes renamed as JPG before decoding", async () => {
  const file = (bytes) =>
    new File([bytes], "image.jpg", { type: "image/jpeg" });
  assert.equal(
    await validAvatarBytes(
      file("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
    ),
    false,
  );
  assert.equal(await validAvatarBytes(file("GIF89a")), false);
  assert.equal(
    await validAvatarBytes(file(new Uint8Array([0xff, 0xd8, 0xff]))),
    true,
  );
  assert.equal(
    await validAvatarBytes(
      file(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ),
    true,
  );
  assert.equal(await validAvatarBytes(file("RIFF1234WEBP")), true);
});
