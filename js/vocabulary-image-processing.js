// Local image preparation for Vocabulary Library (set covers and item images).
//
// The WebP path deliberately mirrors Unit Library's verified Worked Examples
// pipeline (units commit c873ea3): try the browser's native Canvas WebP encoder,
// verify the RIFF/WEBP bytes, and fall back to the vendored libwebp encoder when
// the browser silently returns PNG instead (Safari / older iPadOS).
import { encodeWebP } from "../vendor/jsquash-webp/encode.js?v=units-c873ea3";

export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
// Storage rules accept vocabulary images below 2 MiB; stay comfortably under it.
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024 - 1024;
export const IMAGE_PRESETS = Object.freeze({
  cover: Object.freeze({ maxEdge: 1200, targetBytes: 300 * 1024 }),
  item: Object.freeze({ maxEdge: 800, targetBytes: 150 * 1024 })
});
export const SUPPORTED_FORMATS_LABEL = "JPG, PNG or WebP · up to 10 MB";
export const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const QUALITY_STEPS = [0.82, 0.7, 0.58];
const MIN_EDGE_AFTER_SHRINK = 320;

export class ImagePreparationError extends Error {
  constructor(code, message) { super(message); this.name = "ImagePreparationError"; this.code = code; }
}

// Identify the real encoded format from the file's first bytes. The MIME type
// and file extension are only hints and are never trusted on their own.
export function sniffImageFormat(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  if (isWebPBytes(bytes)) return "webp";
  return null;
}

export function isWebPBytes(bytes) {
  return Boolean(bytes && bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50);
}

export async function hasWebPSignature(blob) {
  if (!blob?.slice || blob.size < 12) return false;
  return isWebPBytes(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
}

// Preserve aspect ratio; never upscale small images.
export function targetDimensions(width, height, maxEdge) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scaled: scale < 1 };
}

export async function validateImageFile(file) {
  if (!file || typeof file.size !== "number") throw new ImagePreparationError("unsupported", "Unsupported image format.");
  if (file.size > MAX_SOURCE_BYTES) throw new ImagePreparationError("too-large", "Image file is too large.");
  if (file.size < 12) throw new ImagePreparationError("unsupported", "Unsupported image format.");
  const format = sniffImageFormat(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!format) throw new ImagePreparationError("unsupported", "Unsupported image format.");
  return format;
}

function decodeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => { URL.revokeObjectURL(url); image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new ImagePreparationError("corrupt", "This image could not be read. Try another file.")); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new ImagePreparationError("corrupt", "This image could not be read. Try another file.")); };
    image.src = url;
  });
}

let nativeWebPWorks = null; // learned once per page so Safari does not re-encode PNGs on every attempt

function nativeCanvasBlob(canvas, quality) {
  return new Promise((resolve) => {
    try { canvas.toBlob((blob) => resolve(blob || null), "image/webp", quality); }
    catch { resolve(null); }
  });
}

async function canvasWebPBlob(canvas, context, quality) {
  if (nativeWebPWorks !== false) {
    const nativeBlob = await nativeCanvasBlob(canvas, quality);
    if (await hasWebPSignature(nativeBlob)) { nativeWebPWorks = true; return { blob: nativeBlob, encoder: "native" }; }
    nativeWebPWorks = false;
  }
  try {
    const encoded = await encodeWebP(context.getImageData(0, 0, canvas.width, canvas.height), quality);
    const fallbackBlob = new Blob([encoded], { type: "image/webp" });
    if (await hasWebPSignature(fallbackBlob)) return { blob: fallbackBlob, encoder: "libwebp" };
  } catch (error) {
    console.info("[Vocabulary Images] Native WebP encoding unavailable; libwebp fallback failed.", error);
  }
  throw new ImagePreparationError("encoder", "This browser could not create a WebP image. Update the browser or try current Chrome or Safari.");
}

function drawToCanvas(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new ImagePreparationError("encoder", "This browser could not prepare the image.");
  context.clearRect(0, 0, width, height); // keep transparency: never paint a background
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return { canvas, context };
}

function releaseCanvas(canvas) { canvas.width = 0; canvas.height = 0; } // frees memory promptly on older iPads

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Validate, resize and encode a teacher-selected image as WebP.
 * @param {File} file
 * @param {{maxEdge:number,targetBytes:number}} preset
 * @param {(stage:"preparing"|"optimising")=>void} onStage
 */
export async function prepareVocabularyImage(file, preset = IMAGE_PRESETS.item, onStage = () => {}) {
  onStage("preparing");
  const sourceFormat = await validateImageFile(file);
  await yieldToBrowser();
  const image = await decodeImage(file);
  onStage("optimising");
  await yieldToBrowser();
  let { width, height } = targetDimensions(image.naturalWidth, image.naturalHeight, preset.maxEdge);
  let best = null;
  for (let shrink = 0; shrink < 4; shrink += 1) {
    const { canvas, context } = drawToCanvas(image, width, height);
    try {
      for (const quality of QUALITY_STEPS) {
        const result = await canvasWebPBlob(canvas, context, quality);
        best = { ...result, width, height, quality };
        if (result.blob.size <= preset.targetBytes) break;
        await yieldToBrowser();
      }
    } finally { releaseCanvas(canvas); }
    // The size target is an optimisation goal, not a rejection rule; only shrink
    // further when the result would exceed the Storage rule's hard limit.
    if (best.blob.size <= MAX_OUTPUT_BYTES || Math.max(width, height) <= MIN_EDGE_AFTER_SHRINK) break;
    width = Math.max(1, Math.round(width * 0.8));
    height = Math.max(1, Math.round(height * 0.8));
  }
  if (!best || best.blob.size > MAX_OUTPUT_BYTES) throw new ImagePreparationError("too-large", "Image file is too large.");
  if (!await hasWebPSignature(best.blob)) throw new ImagePreparationError("encoder", "The prepared image is not a genuine WebP file.");
  return {
    blob: best.blob,
    width: best.width,
    height: best.height,
    bytes: best.blob.size,
    quality: best.quality,
    encoder: best.encoder,
    sourceFormat,
    sourceBytes: file.size,
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight,
    fileName: String(file.name || "image").slice(0, 120),
    withinTarget: best.blob.size <= preset.targetBytes
  };
}

// Test hook: lets the browser pipeline test force the Safari (libwebp) path in Chrome.
export function __setNativeWebPForTesting(value) { nativeWebPWorks = value; }
