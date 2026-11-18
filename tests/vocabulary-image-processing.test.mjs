import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_PRESETS, MAX_OUTPUT_BYTES, isWebPBytes, sniffImageFormat, targetDimensions, validateImageFile } from "../js/vocabulary-image-processing.js";

const bytes = (...b) => { const out = new Uint8Array(16); out.set(b); return out; };
test("format sniffing uses magic bytes", () => {
  assert.equal(sniffImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0)), "jpeg");
  assert.equal(sniffImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "png");
  assert.equal(sniffImageFormat(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)), "webp");
  assert.equal(sniffImageFormat(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)), null, "RIFF/WAVE is not WebP");
  assert.equal(sniffImageFormat(bytes(0x47, 0x49, 0x46, 0x38)), null);
  assert.equal(sniffImageFormat(new Uint8Array(4)), null);
  assert.ok(!isWebPBytes(bytes(0x89, 0x50, 0x4e, 0x47)), "Safari PNG fallback is detected as not-WebP");
});
test("dimensions preserve aspect ratio and never upscale", () => {
  assert.deepEqual(targetDimensions(4032, 3024, 1200), { width: 1200, height: 900, scaled: true });
  assert.deepEqual(targetDimensions(1500, 2400, 800), { width: 500, height: 800, scaled: true });
  assert.deepEqual(targetDimensions(300, 200, 1200), { width: 300, height: 200, scaled: false });
  assert.deepEqual(targetDimensions(10000, 1, 800), { width: 800, height: 1, scaled: true });
});
test("presets match the specification", () => {
  assert.deepEqual({ ...IMAGE_PRESETS.cover }, { maxEdge: 1200, targetBytes: 300 * 1024 });
  assert.deepEqual({ ...IMAGE_PRESETS.item }, { maxEdge: 800, targetBytes: 150 * 1024 });
  assert.ok(MAX_OUTPUT_BYTES < 2 * 1024 * 1024, "stays below the Storage rule limit");
});
test("file validation rejects oversize and fake files before decoding", async () => {
  const fake = (size, head) => ({ size, slice: () => new Blob([head]) });
  await assert.rejects(validateImageFile(fake(10 * 1024 * 1024 + 1, bytes(0xff, 0xd8, 0xff))), { code: "too-large", message: "Image file is too large." });
  await assert.rejects(validateImageFile(fake(5000, new TextEncoder().encode("hello world, not an image"))), { code: "unsupported", message: "Unsupported image format." });
  assert.equal(await validateImageFile(fake(5000, bytes(0xff, 0xd8, 0xff, 0xe1))), "jpeg");
});
