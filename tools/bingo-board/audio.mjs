// Playback lifecycle wraps the shared Vocabulary Library audio functions.
// AI Voice that "ends" this soon after starting was not audible: a school iPad 7 reported
// 68 ms of silent speech for a two-syllable word, which takes well over half a second to say.
export const MIN_AI_SPEECH_MS = 300;

export function createAudioPlayer({ getVoice, playTeacherVoice, speakMandarin, canUseAiVoice,
  stopAi = () => {}, onStatus = () => {}, onPlaybackStart = () => {}, schedule = setTimeout, unschedule = clearTimeout, now = () => Date.now() }) {
  const cache = new Map();
  // Definite lookup results for this page ('' = no Teacher Voice recording). Failed or timed-out
  // lookups are not stored, so they are retried as before.
  const known = new Map();
  let generation = 0, activeAudio = null, watchdog = null;
  const clearWatchdog = () => { if (watchdog !== null) unschedule(watchdog); watchdog = null; };
  function cancel() { generation++; clearWatchdog(); activeAudio?.pause(); activeAudio = null; stopAi(); }
  async function prepare(entry) {
    if (!cache.has(entry.key)) {
      let timer;
      const timeout = new Promise(resolve => { timer = schedule(() => resolve(''), 8000); });
      const request = Promise.resolve().then(() => getVoice(entry))
        .then(url => { known.set(entry.key, url || ''); return url; }).catch(() => '');
      cache.set(entry.key, Promise.race([request, timeout]).then(url => {
        unschedule(timer);
        if (!url) cache.delete(entry.key); // Retry transient metadata failures on the next Listen.
        return url;
      }));
    }
    return cache.get(entry.key);
  }
  async function play(entry) {
    cancel(); const turn = generation;
    // A known result starts audio inside the Listen tap itself. iPad Safari silently drops
    // speech started after the Firestore lookup (H3.2), so only unknown results wait for it.
    let url;
    if (known.has(entry.key)) {
      url = known.get(entry.key);
      // Re-check in the background, as S1 did on every tap, so a newly published recording is used next time.
      if (!url) prepare(entry);
    } else {
      onStatus({ kind: 'loading', message: 'Getting this word ready…' });
      url = await prepare(entry);
      if (turn !== generation) return;
    }
    let settled = false, fallingBack = false, aiAttempted = false;
    const report = (kind, message) => { if (turn === generation) onStatus({ kind, message }); };
    const finish = () => { if (turn !== generation || settled) return; settled = true; clearWatchdog(); report('ready', 'Tap Listen Word to replay. If you heard no audio, retry or ask your teacher. Replays cost no stars.'); };
    const fail = () => { if (turn !== generation || settled) return; settled = true; clearWatchdog(); cache.delete(entry.key); if (url || !aiAttempted) known.delete(entry.key); activeAudio?.pause(); stopAi(); report('error', 'Teacher Voice is unavailable or could not play, and no working fallback was confirmed. Tap Listen Word to retry. Check your connection or ask your teacher for help. You have lost no stars.'); };
    const fallback = () => {
      if (turn !== generation || settled || fallingBack) return;
      fallingBack = true; clearWatchdog(); activeAudio?.pause(); activeAudio = null;
      if (!entry.aiEnabled || !canUseAiVoice()) { fail(); return; }
      watchdog = schedule(fail, 12000); aiAttempted = true; let aiStartedAt = null;
      report('loading', 'Preparing AI Voice…');
      try { speakMandarin(entry.chinese, { onStart: () => { if (turn !== generation || settled) return; aiStartedAt = now(); onPlaybackStart(); report('playing', 'AI Voice playback started. If you hear nothing, check your volume or retry.'); clearWatchdog(); watchdog = schedule(fail, 45000); }, onEnd: () => { if (aiStartedAt !== null && now() - aiStartedAt >= MIN_AI_SPEECH_MS) finish(); else fail(); }, onUnavailable: fail, onError: fail }); }
      catch { fail(); }
    };
    if (!url) { fallback(); return; }
    report('loading', 'Preparing Teacher Voice…');
    watchdog = schedule(fallback, 12000);
    try {
      const audio = playTeacherVoice(url, {
        onStart: () => { if (turn !== generation || fallingBack || settled) return; onPlaybackStart(); report('playing', 'Teacher Voice playback started. If you hear nothing, check your volume or retry.'); clearWatchdog(); watchdog = schedule(fallback, 45000); },
        onEnd: () => { if (!fallingBack) finish(); }, onUnavailable: fallback, onError: fallback
      });
      if (turn === generation && !fallingBack && !settled) activeAudio = audio;
      else audio?.pause();
    } catch { fallback(); }
  }
  return { prepare, play, cancel };
}
