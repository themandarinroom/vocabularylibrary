import { getSets } from './shared/js/vocabulary-store.js';
import { getTeacherVoice, cacheSafeAudioUrl } from './shared/js/teacher-voice-cloud.js';
import { catalogueFromSets } from './vocabulary.mjs';
import { imagesFromSets } from './display.mjs';

export async function loadCatalogue() {
  // Existing API returns only published, non-deleted sets (or its same-project cache).
  // Nothing is seeded, saved, edited or uploaded here. Item images are read alongside (v0.1.1 Visual option);
  // the shared catalogue adapter itself is unchanged.
  const sources = await getSets();
  return { ...catalogueFromSets(sources), images: imagesFromSets(sources) };
}
export async function loadVoice(entry) {
  const metadata = await getTeacherVoice(entry.setId, entry.id);
  return teacherVoiceUrl(entry, metadata);
}

// Bound the Solo UI wait; a late shared read may refresh its existing public cache,
// but cannot replace the timed-out request's catalogue/selection.
export async function loadCatalogueWithTimeout({ load = loadCatalogue, timeoutMs = 15000,
  schedule = setTimeout, unschedule = clearTimeout } = {}) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(load),
      new Promise((_, reject) => { timer = schedule(() => reject(new Error('Vocabulary loading timed out.')), timeoutMs); })
    ]);
  } finally { unschedule(timer); }
}

// Teacher Voice references must not silently cross environments in this Solo build.
export function teacherVoiceUrl(entry, metadata) {
  if (!metadata) return '';
  const expected = `vocabulary/${entry.setId}/${entry.id}/teacher-voice-${metadata.revision}`;
  let url;
  try { url = new URL(metadata.teacherAudioUrl); } catch { throw new Error('Teacher Voice reference is unavailable.'); }
  if (metadata.setId !== entry.setId || metadata.itemId !== entry.id || !Number.isInteger(metadata.revision) ||
      metadata.storagePath !== expected || url.origin !== 'https://firebasestorage.googleapis.com' ||
      decodeURIComponent(url.pathname) !== `/v0/b/the-mandarin-room.firebasestorage.app/o/${expected}` ||
      url.username || url.password) throw new Error('Teacher Voice reference does not match the Production source.');
  return cacheSafeAudioUrl(metadata);
}
