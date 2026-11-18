// Save orchestration for locally selected Vocabulary images.
// Pure apart from the injected `deps`, so every failure path is unit-testable.
//
// Order: upload new images -> write the vocabulary set -> clean up superseded
// managed images that nothing references any more. Until the set write
// succeeds, the published record and its existing images are untouched.

export const COVER_KEY = "cover";
const MANAGED_IMAGE_PATH = /^vocabulary\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\/image-[0-9]+\.webp$/;
const clone = (value) => JSON.parse(JSON.stringify(value));

export function isManagedImagePath(path) { return typeof path === "string" && MANAGED_IMAGE_PATH.test(path); }

function clearItemImageMeta(item) { delete item.imageStoragePath; delete item.imageGenerated; delete item.imageSource; }

/** Apply uploaded/removed images to a copy of the set. `uploads` maps key -> { imageUrl, imageStoragePath }. */
export function applyImageChanges(set, pending, uploads) {
  const next = clone(set);
  const cover = pending.get(COVER_KEY);
  if (cover?.kind === "upload") {
    const saved = uploads.get(COVER_KEY);
    next.coverImage = saved.imageUrl; next.coverImageStoragePath = saved.imageStoragePath; next.coverImageGenerated = false;
  } else if (cover?.kind === "remove") {
    next.coverImage = null; next.coverImageStoragePath = null; next.coverImageGenerated = false;
  }
  // Items that follow the Set Cover keep following it (existing behaviour for cover URL edits).
  if (cover) next.items.filter((item) => item.imageSource === "set-cover").forEach((item) => { item.image = next.coverImage; });
  next.items.forEach((item) => {
    const change = pending.get(item.id);
    if (change?.kind === "upload") {
      const saved = uploads.get(item.id);
      clearItemImageMeta(item);
      item.image = saved.imageUrl; item.imageStoragePath = saved.imageStoragePath; item.imageSource = "upload";
    } else if (change?.kind === "remove") {
      clearItemImageMeta(item);
      item.image = null;
    }
  });
  return next;
}

/** Managed Storage objects referenced by a set: [{ path, url }]. */
export function managedImagesOf(set) {
  if (!set) return [];
  const refs = [];
  if (isManagedImagePath(set.coverImageStoragePath) && set.coverImage) refs.push({ path: set.coverImageStoragePath, url: set.coverImage });
  (set.items || []).forEach((item) => { if (isManagedImagePath(item.imageStoragePath) && item.image) refs.push({ path: item.imageStoragePath, url: item.image }); });
  return refs;
}

function urlsOf(set) {
  const urls = new Set();
  if (set?.coverImage) urls.add(set.coverImage);
  (set?.items || []).forEach((item) => { if (item.image) urls.add(item.image); });
  return urls;
}

/** Managed images that the previous version referenced but the saved version no longer does. */
export function supersededImages(previousSet, savedSet) {
  const stillUsedPaths = new Set(managedImagesOf(savedSet).map((ref) => ref.path));
  const stillUsedUrls = urlsOf(savedSet);
  const seen = new Set();
  return managedImagesOf(previousSet).filter((ref) => {
    if (stillUsedPaths.has(ref.path) || stillUsedUrls.has(ref.url) || seen.has(ref.path)) return false;
    seen.add(ref.path); return true;
  });
}

/** Keep any image whose URL or path is still used by another published set. */
export function unreferencedImages(candidates, otherSets, currentSetId) {
  const others = otherSets.filter((set) => set.id !== currentSetId);
  return candidates.filter((ref) => !others.some((set) => urlsOf(set).has(ref.url) || managedImagesOf(set).some((other) => other.path === ref.path)));
}

export function friendlySaveError(error, phase) {
  const code = String(error?.code || "");
  if (/unauthenticated|unauthorized|permission-denied/i.test(code)) return "Your sign-in has expired or this account is not authorised. Sign in again, then choose Save set. Nothing was published.";
  if (error?.name === "UploadTimeoutError" || /timeout|retry-limit-exceeded/i.test(code)) return "Upload timed out. Check the connection and choose Save set to try again. Nothing was published.";
  if (/canceled/i.test(code)) return "Upload was cancelled. Choose Save set to try again.";
  if (phase === "upload") return "Upload failed. Please try again.";
  return error?.message && !/^FirebaseError/i.test(error.message) ? `${error.message} Your published set is unchanged.` : "The set could not be saved. Your published set is unchanged; choose Save set to try again.";
}

/**
 * @param {object} args
 * @param {object} args.set        editor set (already reflecting text edits)
 * @param {object|null} args.previousSet  set as originally loaded (null for new sets)
 * @param {string|null} args.originalId
 * @param {Map} args.pending       key -> { kind: "upload", blob } | { kind: "remove" }
 * @param {object} args.deps       { upload(setId, key, blob, onProgress), saveSet(set, originalId), deleteImage(path), listSetsStrict() }
 * @param {(event:object)=>void} [args.onStatus]
 */
export async function saveSetWithImages({ set, previousSet = null, originalId = null, pending = new Map(), deps, onStatus = () => {} }) {
  const uploadKeys = [...pending.entries()].filter(([key, change]) => change.kind === "upload" && (key === COVER_KEY || set.items.some((item) => item.id === key))).map(([key]) => key);
  const uploads = new Map();
  try {
    for (let index = 0; index < uploadKeys.length; index += 1) {
      const key = uploadKeys[index];
      onStatus({ phase: "upload", index, total: uploadKeys.length, key, percent: 0 });
      const storageKey = key === COVER_KEY ? "cover" : key;
      uploads.set(key, await deps.upload(set.id, storageKey, pending.get(key).blob, (percent) => onStatus({ phase: "upload", index, total: uploadKeys.length, key, percent })));
    }
  } catch (error) {
    await rollback(uploads, deps);
    return { ok: false, phase: "upload", error, message: friendlySaveError(error, "upload") };
  }
  const nextSet = applyImageChanges(set, pending, uploads);
  onStatus({ phase: "save" });
  let saved;
  try { saved = await deps.saveSet(nextSet, originalId); }
  catch (error) {
    await rollback(uploads, deps);
    return { ok: false, phase: "save", error, message: friendlySaveError(error, "save") };
  }
  const cleanup = await cleanUpSuperseded(previousSet, saved || nextSet, deps);
  onStatus({ phase: "done" });
  return { ok: true, set: saved || nextSet, uploaded: [...uploads.values()], cleanup };
}

async function rollback(uploads, deps) {
  await Promise.allSettled([...uploads.values()].map((entry) => deps.deleteImage(entry.imageStoragePath)));
}

export async function cleanUpSuperseded(previousSet, savedSet, deps) {
  const candidates = supersededImages(previousSet, savedSet);
  if (!candidates.length) return { deleted: [], retained: [] };
  let otherSets;
  try { otherSets = await deps.listSetsStrict(); }
  catch (error) {
    console.warn("[Vocabulary images] Reference check unavailable; superseded images retained for safety.", error);
    return { deleted: [], retained: candidates.map((ref) => ref.path) };
  }
  const removable = unreferencedImages(candidates, otherSets, savedSet.id);
  const results = await Promise.allSettled(removable.map((ref) => deps.deleteImage(ref.path)));
  const deleted = removable.filter((_, index) => results[index].status === "fulfilled").map((ref) => ref.path);
  return { deleted, retained: candidates.map((ref) => ref.path).filter((path) => !deleted.includes(path)) };
}
