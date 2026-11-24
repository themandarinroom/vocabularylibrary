import { getFirebaseServices } from "./firebase.js";

const UPLOAD_TIMEOUT_MS = 60_000;
export const teacherVoicePath = (setId, itemId, revision) => `vocabulary/${setId}/${itemId}/teacher-voice-${revision}`;
export const teacherVoiceDocId = (setId, itemId) => `${setId}--${itemId}`;
export function cacheSafeAudioUrl(metadata) {
  if (!metadata?.teacherAudioUrl) return "";
  return `${metadata.teacherAudioUrl}${metadata.teacherAudioUrl.includes("?") ? "&" : "?"}revision=${encodeURIComponent(metadata.revision || "latest")}`;
}
export async function getTeacherVoice(setId, itemId) {
  const services = await getFirebaseServices();
  const ref = services.firestoreSdk.doc(services.db, "vocabularyTeacherVoices", teacherVoiceDocId(setId, itemId));
  const snapshot = await services.firestoreSdk.getDoc(ref);
  return snapshot.exists() ? snapshot.data() : null;
}
export async function watchTeacherVoice(setId, itemId, onChange, onError = () => {}) {
  const services = await getFirebaseServices();
  const ref = services.firestoreSdk.doc(services.db, "vocabularyTeacherVoices", teacherVoiceDocId(setId, itemId));
  return services.firestoreSdk.onSnapshot(ref, (snapshot) => onChange(snapshot.exists() ? snapshot.data() : null), onError);
}
export async function uploadTeacherVoice(setId, itemId, blob, onProgress = () => {}) {
  const services = await getFirebaseServices();
  const user = services.auth.currentUser;
  if (!user) throw Object.assign(new Error("Sign in is required."), { code: "storage/unauthenticated" });
  await user.getIdToken(true);
  const metadataRef = services.firestoreSdk.doc(services.db, "vocabularyTeacherVoices", teacherVoiceDocId(setId, itemId));
  const previousSnapshot = await services.firestoreSdk.getDoc(metadataRef);
  const previous = previousSnapshot.exists() ? previousSnapshot.data() : null;
  const revision = Date.now();
  const storagePath = teacherVoicePath(setId, itemId, revision);
  const audioRef = services.storageSdk.ref(services.storage, storagePath);
  const task = services.storageSdk.uploadBytesResumable(audioRef, blob, { contentType: blob.type || "audio/webm", cacheControl: "no-store, max-age=0" });
  const uploaded = await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { task.cancel(); reject(Object.assign(new Error("upload-timeout"), { code: "storage/upload-timeout" })); }, UPLOAD_TIMEOUT_MS);
    task.on("state_changed", (snapshot) => onProgress(snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0), (error) => { window.clearTimeout(timeout); reject(error); }, async () => { window.clearTimeout(timeout); try { resolve(await services.storageSdk.getDownloadURL(task.snapshot.ref)); } catch (error) { reject(error); } });
  });
  const metadata = { setId, itemId, teacherAudioUrl: uploaded, storagePath, contentType: blob.type || "audio/webm", revision, updatedAt: services.firestoreSdk.serverTimestamp() };
  try { await services.firestoreSdk.setDoc(metadataRef, metadata); }
  catch (error) { try { await services.storageSdk.deleteObject(audioRef); } catch (cleanupError) { console.error("[Vocabulary Teacher Voice cleanup]", cleanupError); } throw error; }
  if (previous?.storagePath && previous.storagePath !== storagePath) { try { await services.storageSdk.deleteObject(services.storageSdk.ref(services.storage, previous.storagePath)); } catch (error) { if (error.code !== "storage/object-not-found") console.error("[Vocabulary Teacher Voice old recording cleanup]", error); } }
  return { ...metadata, updatedAt: new Date() };
}
export async function deleteTeacherVoice(setId, itemId) {
  const services = await getFirebaseServices();
  const metadataRef = services.firestoreSdk.doc(services.db, "vocabularyTeacherVoices", teacherVoiceDocId(setId, itemId));
  const snapshot = await services.firestoreSdk.getDoc(metadataRef);
  const path = snapshot.exists() ? snapshot.data().storagePath : "";
  if (path) { try { await services.storageSdk.deleteObject(services.storageSdk.ref(services.storage, path)); } catch (error) { if (error.code !== "storage/object-not-found") throw error; } }
  await services.firestoreSdk.deleteDoc(metadataRef);
}
