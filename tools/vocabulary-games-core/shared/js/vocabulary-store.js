import { firebaseConfig } from "./firebase-config.js";
import { getFirebaseServices } from "./firebase.js";

const COLLECTION = "vocabularySets";
const CACHE_SCHEMA_VERSION = 3;
const clone = (value) => JSON.parse(JSON.stringify(value));

function normaliseProjectId(projectId) {
  const value = String(projectId || "unknown-project").trim().toLowerCase();
  return value.replace(/[^a-z0-9-]/g, "-") || "unknown-project";
}

export function resolveVocabularyCachePolicy(projectId = firebaseConfig.projectId) {
  const resolvedProjectId = normaliseProjectId(projectId);
  return Object.freeze({
    projectId: resolvedProjectId,
    storageKey: `mandarin-room-vocabulary-cache-v${CACHE_SCHEMA_VERSION}:${resolvedProjectId}`
  });
}

const cachePolicy = resolveVocabularyCachePolicy();
const STORAGE_KEY = cachePolicy.storageKey;

function publicSet(data) {
  const items = (Array.isArray(data.items) ? data.items : []).map((item) => {
    const cleanItem = { ...item };
    if (cleanItem.audio && typeof cleanItem.audio === "object") {
      cleanItem.audio = { ...cleanItem.audio };
      delete cleanItem.audio.teacherAudioUrl;
    }
    return cleanItem;
  });
  return clone({
    id: data.id,
    yearLevel: data.yearLevel,
    title: data.title,
    chineseTitle: data.chineseTitle || "",
    description: data.description || "",
    coverImage: data.coverImage || null,
    coverImageStoragePath: data.coverImageStoragePath || null,
    coverImageGenerated: data.coverImageGenerated === true,
    items
  });
}

function cleanCachedSet(set) {
  const cleaned = publicSet(set);
  cleaned.items = cleaned.items.map((item) => {
    if (item.alignment === undefined && item.segments === undefined) return item;
    const cleanItem = { ...item };
    delete cleanItem.alignment;
    delete cleanItem.segments;
    return cleanItem;
  });
  return cleaned;
}

function localSets() {
  if (typeof localStorage === "undefined") return [];
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.schemaVersion !== CACHE_SCHEMA_VERSION || saved?.projectId !== cachePolicy.projectId || !Array.isArray(saved.sets)) return [];
    return saved.sets.map(cleanCachedSet);
  } catch (_) {
    return [];
  }
}

function writeCache(sets) {
  if (typeof localStorage === "undefined") return;
  const payload = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    projectId: cachePolicy.projectId,
    refreshedAt: new Date().toISOString(),
    sets: sets.map(publicSet)
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }
  catch (error) { console.warn("[Vocabulary Cache] Could not update the local fallback.", error); }
}

function cacheSet(nextSet, originalId = null) {
  const sets = localSets();
  const index = originalId ? sets.findIndex((set) => set.id === originalId) : sets.findIndex((set) => set.id === nextSet.id);
  if (index >= 0) sets[index] = publicSet(nextSet); else sets.push(publicSet(nextSet));
  writeCache(sets);
}

function removeCachedSet(id) {
  writeCache(localSets().filter((set) => set.id !== id));
}

function authoritativeSets(snapshot) {
  return snapshot.docs
    .map((document) => document.data())
    .filter((set) => set?.published === true && set?.deleted !== true)
    .map(publicSet);
}

export async function getSets() {
  try {
    const services = await getFirebaseServices();
    const ref = services.firestoreSdk.query(services.firestoreSdk.collection(services.db, COLLECTION), services.firestoreSdk.where("published", "==", true));
    const snapshot = await services.firestoreSdk.getDocs(ref);
    const sets = authoritativeSets(snapshot);
    writeCache(sets);
    return sets;
  } catch (error) {
    console.warn(`[Vocabulary Cloud:${cachePolicy.projectId}] Using the last successful project cache.`, error);
    return localSets();
  }
}

export async function getSet(id) {
  if (!id) return null;
  try {
    const services = await getFirebaseServices();
    const snapshot = await services.firestoreSdk.getDoc(services.firestoreSdk.doc(services.db, COLLECTION, id));
    const data = snapshot.exists() ? snapshot.data() : null;
    if (!data || data.deleted === true || data.published !== true) {
      removeCachedSet(id);
      return null;
    }
    const set = publicSet(data);
    cacheSet(set);
    return set;
  } catch (error) {
    console.warn(`[Vocabulary Cloud:${cachePolicy.projectId}] Using the last successful project cache for ${id}.`, error);
    return localSets().find((set) => set.id === id) || null;
  }
}

export async function saveSet(nextSet, originalId = null) {
  const services = await getFirebaseServices();
  if (!services.auth.currentUser) throw new Error("Sign in with an authorised teacher account before saving.");
  const duplicate = (await getSets()).some((set) => set.id === nextSet.id && set.id !== originalId);
  if (duplicate) throw new Error("That stable ID is already in use.");
  const cleanSet = publicSet(nextSet);
  const payload = { ...cleanSet, published: true, updatedAt: services.firestoreSdk.serverTimestamp(), updatedBy: services.auth.currentUser.uid };
  await services.firestoreSdk.setDoc(services.firestoreSdk.doc(services.db, COLLECTION, cleanSet.id), payload);
  if (originalId && originalId !== cleanSet.id) await services.firestoreSdk.deleteDoc(services.firestoreSdk.doc(services.db, COLLECTION, originalId));
  cacheSet(cleanSet, originalId);
  return cleanSet;
}

export async function deleteSet(id) {
  const services = await getFirebaseServices();
  if (!services.auth.currentUser) throw new Error("Sign in with an authorised teacher account before deleting.");
  await services.firestoreSdk.setDoc(services.firestoreSdk.doc(services.db, COLLECTION, id), { id, deleted: true, published: true, updatedAt: services.firestoreSdk.serverTimestamp(), updatedBy: services.auth.currentUser.uid });
  removeCachedSet(id);
}

export async function watchSets(onChange, onError = () => {}) {
  const services = await getFirebaseServices();
  const ref = services.firestoreSdk.query(services.firestoreSdk.collection(services.db, COLLECTION), services.firestoreSdk.where("published", "==", true));
  return services.firestoreSdk.onSnapshot(ref, (snapshot) => {
    const sets = authoritativeSets(snapshot);
    writeCache(sets);
    onChange(sets);
  }, (error) => {
    const fallback = localSets();
    if (fallback.length) onChange(fallback);
    onError(error);
  });
}

export async function watchSet(id, onChange, onError = () => {}) {
  const services = await getFirebaseServices();
  const ref = services.firestoreSdk.doc(services.db, COLLECTION, id);
  return services.firestoreSdk.onSnapshot(ref, (snapshot) => {
    const data = snapshot.exists() ? snapshot.data() : null;
    if (!data || data.deleted === true || data.published !== true) {
      removeCachedSet(id);
      onChange(null);
      return;
    }
    const set = publicSet(data);
    cacheSet(set);
    onChange(set);
  }, (error) => {
    const fallback = localSets().find((set) => set.id === id) || null;
    if (fallback) onChange(fallback);
    onError(error);
  });
}
