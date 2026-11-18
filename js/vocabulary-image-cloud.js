import { getFirebaseServices } from "./firebase.js";

const stableId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertIds(setId, itemId) {
  if (!stableId.test(setId) || !stableId.test(itemId)) throw new Error("Save valid stable set and item IDs before adding images.");
}

function base64ToBlob(base64, contentType) {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: contentType });
}

function generatedImageResult(data) {
  if (!data.imageBase64 || !String(data.contentType || "").startsWith("image/")) throw new Error("The image service returned an invalid result.");
  return { blob: base64ToBlob(data.imageBase64, data.contentType), concept: data.concept || "", composition: data.composition || "single", noteApplied: data.noteApplied === true, requestId: data.requestId || "", contentType: data.contentType };
}

export async function generateVocabularyImage(setId, itemId, { replaceExisting = false, english = "", chinese = "", imageType = "auto", imageGenerationNote = "" } = {}) {
  assertIds(setId, itemId);
  const services = await getFirebaseServices();
  if (!services.auth.currentUser) throw new Error("Sign in with an authorised teacher account before generating images.");
  const generate = services.functionsSdk.httpsCallable(services.functions, "generateVocabularyImage", { timeout: 120000 });
  const response = await generate({ setId, itemId, replaceExisting: replaceExisting === true, english: String(english).slice(0, 120), chinese: String(chinese).slice(0, 80), imageType: ["single", "group"].includes(imageType) ? imageType : "auto", imageGenerationNote: String(imageGenerationNote).slice(0, 300) });
  return generatedImageResult(response.data || {});
}

export async function generateVocabularySetCover(setId, { replaceExisting = false } = {}) {
  assertIds(setId, "set-cover");
  const services = await getFirebaseServices();
  if (!services.auth.currentUser) throw new Error("Sign in with an authorised teacher account before generating a set cover.");
  const generate = services.functionsSdk.httpsCallable(services.functions, "generateVocabularyImage", { timeout: 120000 });
  const response = await generate({ setId, target: "set-cover", replaceExisting: replaceExisting === true });
  return generatedImageResult(response.data || {});
}

const UPLOAD_TIMEOUT_MS = 120000;
let lastRevision = 0;
const nextRevision = () => { lastRevision = Math.max(Date.now(), lastRevision + 1); return lastRevision; };

class UploadTimeoutError extends Error { constructor() { super("Upload timed out."); this.name = "UploadTimeoutError"; this.code = "storage/timeout"; } }

async function isGenuineWebP(blob) {
  if (!blob?.slice || blob.size < 12) return false;
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
}

export async function uploadApprovedVocabularyImage(setId, itemId, blob, onProgress = () => {}, { timeoutMs = UPLOAD_TIMEOUT_MS } = {}) {
  assertIds(setId, itemId);
  const services = await getFirebaseServices();
  if (!services.auth.currentUser) throw Object.assign(new Error("Sign in with an authorised teacher account before saving images."), { code: "storage/unauthenticated" });
  if (!await isGenuineWebP(blob)) throw new Error("Upload stopped because the prepared image is not a genuine WebP file.");
  const revision = nextRevision();
  const storagePath = `vocabulary/${setId}/${itemId}/image-${revision}.webp`;
  const imageRef = services.storageSdk.ref(services.storage, storagePath);
  const task = services.storageSdk.uploadBytesResumable(imageRef, blob, { contentType: "image/webp", cacheControl: "public,max-age=31536000,immutable" });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => { task.cancel(); reject(new UploadTimeoutError()); }, timeoutMs);
      task.on("state_changed", (snapshot) => onProgress(snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0), reject, resolve);
    });
  } finally { clearTimeout(timer); }
  try { return { imageUrl: await services.storageSdk.getDownloadURL(imageRef), imageStoragePath: storagePath }; }
  catch (error) { await deleteGeneratedVocabularyImage(storagePath).catch(() => {}); throw error; }
}

export async function deleteGeneratedVocabularyImage(storagePath) {
  if (!storagePath || !/^vocabulary\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\/image-[0-9]+\.webp$/.test(storagePath)) return;
  const services = await getFirebaseServices();
  try { await services.storageSdk.deleteObject(services.storageSdk.ref(services.storage, storagePath)); }
  catch (error) { if (error.code !== "storage/object-not-found") throw error; }
}
