/**
 * Thin browser wrapper around the Apache-2.0 @jsquash/webp 1.5.0 encoder.
 * The generated libwebp module and licences live beside this file.
 */
import createWebPEncoder from "./codec/enc/webp_enc.js";
import { defaultOptions } from "./meta.js";

let encoderPromise;

function getEncoder() {
  if (!encoderPromise) {
    encoderPromise = createWebPEncoder({
      noInitialRun: true,
      locateFile: file => new URL(`./codec/enc/${file}`, import.meta.url).href
    });
  }
  return encoderPromise;
}

export async function encodeWebP(imageData, quality = .86) {
  const encoder = await getEncoder();
  const result = encoder.encode(imageData.data, imageData.width, imageData.height, {
    ...defaultOptions,
    quality: Math.round(quality * 100),
    method: 4,
    use_sharp_yuv: 1
  });
  if (!result) throw new Error("The fallback WebP encoder could not encode this image.");
  return new Uint8Array(result).slice();
}
