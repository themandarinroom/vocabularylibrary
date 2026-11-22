// Listening Core: published vocabulary and Teacher Voice lookups (read-only, anonymous).
// Uses the vendored, Production-locked copy of the Vocabulary Library data layer in ./shared/,
// byte-identical to the copy Bingo Solo ships (tools/bingo-board/shared/).
import { getSets } from './shared/js/vocabulary-store.js';
import { getTeacherVoice, cacheSafeAudioUrl } from './shared/js/teacher-voice-cloud.js';
import { catalogueFromSets } from './vocabulary.mjs';

// The existing API returns only published, non-deleted sets (or its same-project cache).
export async function loadCatalogue() { return catalogueFromSets(await getSets()); }

export async function loadVoice(entry) {
  const metadata = await getTeacherVoice(entry.setId, entry.id);
  return teacherVoiceUrl(entry, metadata);
}

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

// Teacher Voice references must point at the Production recording for exactly this item.
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
