import { getFirebaseServices } from "./firebase.js";

const stableId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertIds(setId, itemId) {
  if (!stableId.test(setId) || !stableId.test(itemId)) throw new Error("Save valid stable set and item IDs before adding images.");
}

function base64ToBlob(base64, contentType) {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: contentType });
}

export async function generateVocabularyImage(setId, itemId, { replaceExisting = false, english = "", chinese = "" } = {}) {
  assertIds(setId, itemId);
  const services = await getFirebaseServices();
  if (!services.auth.currentUser) throw new Error("Sign in with an authorised teacher account before generating images.");
  const generate = services.functionsSdk.httpsCallable(services.functions, "generateVocabularyImage", { timeout: 120000 });
  const response = await generate({ setId, itemId, replaceExisting: replaceExisting === true, english: String(english).slice(0, 120), chinese: String(chinese).slice(0, 80) });
  const data = response.data || {};
  if (!data.imageBase64 || !String(data.contentType || "").startsWith("image/")) throw new Error("The image service returned an invalid result.");
  return { blob: base64ToBlob(data.imageBase64, data.contentType), concept: data.concept || "", requestId: data.requestId || "", contentType: data.contentType };
}

export async function uploadApprovedVocabularyImage(setId, itemId, blob, onProgress = () => {}) {
  assertIds(setId, itemId);
  const services = await getFirebaseServices();
  if (!services.auth.currentUser) throw new Error("Sign in with an authorised teacher account before saving images.");
  const revision = Date.now();
  const storagePath = `vocabulary/${setId}/${itemId}/image-${revision}.webp`;
  const imageRef = services.storageSdk.ref(services.storage, storagePath);
  const task = services.storageSdk.uploadBytesResumable(imageRef, blob, { contentType: "image/webp", cacheControl: "public,max-age=31536000,immutable" });
  await new Promise((resolve, reject) => task.on("state_changed", (snapshot) => onProgress(snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0), reject, resolve));
  return { imageUrl: await services.storageSdk.getDownloadURL(imageRef), imageStoragePath: storagePath };
}

export async function deleteGeneratedVocabularyImage(storagePath) {
  if (!storagePath || !/^vocabulary\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\/image-[0-9]+\.webp$/.test(storagePath)) return;
  const services = await getFirebaseServices();
  try { await services.storageSdk.deleteObject(services.storageSdk.ref(services.storage, storagePath)); }
  catch (error) { if (error.code !== "storage/object-not-found") throw error; }
}
