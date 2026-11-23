// Listening Core: playback lifecycle around the shared Vocabulary Library audio functions.
// Same order and timing as Bingo Solo's iPad-verified player (tools/bingo-board/audio.mjs):
// Teacher Voice first; AI Voice (speech synthesis) only as a fallback when the item allows it.
// Status messages are game-neutral (no stars or other game rules).
export const AUDIO_MESSAGES = Object.freeze({
  loading: 'Getting this word ready…',
  teacher: 'Preparing Teacher Voice…',
  ai: 'Preparing AI Voice…',
  teacherPlaying: 'Teacher Voice is playing.',
  aiPlaying: 'AI Voice is playing.',
  ready: 'Tap Listen to hear it again.',
  error: 'The sound did not play. Tap Listen to try again, check the volume, or ask your teacher.'
});

// AI Voice that "ends" this soon after starting was not audible: a school iPad 7 reported
// 68 ms of silent speech for a two-syllable word, which takes well over half a second to say.
export const MIN_AI_SPEECH_MS = 300;

export function createAudioPlayer({ getVoice, playTeacherVoice, speakMandarin, canUseAiVoice,
  stopAi = () => {}, onStatus = () => {}, onPlaybackStart = () => {}, messages = AUDIO_MESSAGES,
  schedule = setTimeout, unschedule = clearTimeout, now = () => Date.now() }) {
  const cache = new Map();
  // Definite lookup results for this page ('' = no Teacher Voice recording). Failed or timed-out
  // lookups are not stored, so they are retried.
  const known = new Map();
  let generation = 0, activeAudio = null, watchdog = null;
  const clearWatchdog = () => { if (watchdog !== null) unschedule(watchdog); watchdog = null; };
  function cancel() { generation++; clearWatchdog(); activeAudio?.pause(); activeAudio = null; stopAi(); }
  async function prepare(entry) {
    if (!entry) return '';
    if (!cache.has(entry.key)) {
      let timer;
      const timeout = new Promise(resolve => { timer = schedule(() => resolve(''), 8000); });
      const request = Promise.resolve().then(() => getVoice(entry))
        .then(url => { known.set(entry.key, url || ''); return url; }).catch(() => '');
      cache.set(entry.key, Promise.race([request, timeout]).then(url => {
        unschedule(timer);
        if (!url) cache.delete(entry.key);
        return url;
      }));
    }
    return cache.get(entry.key);
  }
  // A known lookup result starts audio inside the tap itself: iPad Safari silently drops speech
  // started after a network wait, so only unknown results wait for the lookup.
  const isReady = entry => Boolean(entry) && known.has(entry.key);
  async function play(entry) {
    cancel(); const turn = generation;
    if (!entry) return;
    let url;
    if (known.has(entry.key)) {
      url = known.get(entry.key);
      if (!url) prepare(entry); // Re-check in the background so a newly published recording is used next time.
    } else {
      onStatus({ kind: 'loading', message: messages.loading });
      url = await prepare(entry);
      if (turn !== generation) return;
    }
    let settled = false, fallingBack = false, aiAttempted = false;
    const report = (kind, message) => { if (turn === generation) onStatus({ kind, message }); };
    const finish = () => { if (turn !== generation || settled) return; settled = true; clearWatchdog(); report('ready', messages.ready); };
    const fail = () => { if (turn !== generation || settled) return; settled = true; clearWatchdog(); cache.delete(entry.key); if (url || !aiAttempted) known.delete(entry.key); activeAudio?.pause(); stopAi(); report('error', messages.error); };
    const fallback = () => {
      if (turn !== generation || settled || fallingBack) return;
      fallingBack = true; clearWatchdog(); activeAudio?.pause(); activeAudio = null;
      if (!entry.aiEnabled || !canUseAiVoice()) { fail(); return; }
      watchdog = schedule(fail, 12000); aiAttempted = true; let aiStartedAt = null;
      report('loading', messages.ai);
      try { speakMandarin(entry.chinese, { onStart: () => { if (turn !== generation || settled) return; aiStartedAt = now(); onPlaybackStart('ai'); report('playing', messages.aiPlaying); clearWatchdog(); watchdog = schedule(fail, 45000); }, onEnd: () => { if (aiStartedAt !== null && now() - aiStartedAt >= MIN_AI_SPEECH_MS) finish(); else fail(); }, onUnavailable: fail, onError: fail }); }
      catch { fail(); }
    };
    if (!url) { fallback(); return; }
    report('loading', messages.teacher);
    watchdog = schedule(fallback, 12000);
    try {
      const audio = playTeacherVoice(url, {
        onStart: () => { if (turn !== generation || fallingBack || settled) return; onPlaybackStart('teacher'); report('playing', messages.teacherPlaying); clearWatchdog(); watchdog = schedule(fallback, 45000); },
        onEnd: () => { if (!fallingBack) finish(); }, onUnavailable: fallback, onError: fallback
      });
      if (turn === generation && !fallingBack && !settled) activeAudio = audio;
      else audio?.pause();
    } catch { fallback(); }
  }
  return { prepare, play, cancel, isReady };
}
