let activeUtterance = null;

// Name a standard Mandarin voice instead of passing only lang "zh-CN". On a school iPad 7
// (iPadOS 18) the lang-only default landed on one of Apple's novelty voices (Eddy, Grandma…)
// and "played" for 68 ms in silence; naming Tingting was audible on both the iPad 7 and the
// iPad 9 (iPadOS 27). Evidence: AI Voice Compatibility Test on Staging, 23 Nov 2026.
const NOVELTY_VOICE_NAMES = /^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
const isMandarinVoice = (voice) => /^(zh|cmn)[-_](cn|hans)/i.test(voice?.lang || "");
const isNoveltyVoice = (voice) => NOVELTY_VOICE_NAMES.test(voice?.name || "") || /eloquence|novelty/i.test(voice?.voiceURI || "");

export function chooseMandarinVoice(voices) {
  const standard = (Array.isArray(voices) ? voices : []).filter((voice) => isMandarinVoice(voice) && !isNoveltyVoice(voice));
  return standard.find((voice) => /ting-?ting/i.test(voice.name || "")) || standard.find((voice) => voice.localService) || standard[0] || null;
}

function availableVoices() {
  try { return window.speechSynthesis.getVoices() || []; } catch { return []; }
}

export function canUseAiVoice() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function speakMandarin(text, callbacks = {}) {
  if (!canUseAiVoice()) {
    if (callbacks.onUnavailable) callbacks.onUnavailable();
    return;
  }
  window.speechSynthesis.cancel();
  const voice = chooseMandarinVoice(availableVoices());
  activeUtterance = new SpeechSynthesisUtterance(text);
  activeUtterance.lang = voice?.lang || "zh-CN";
  if (voice) activeUtterance.voice = voice;
  activeUtterance.rate = 0.82;
  activeUtterance.onstart = () => callbacks.onStart && callbacks.onStart();
  activeUtterance.onend = () => callbacks.onEnd && callbacks.onEnd();
  activeUtterance.onerror = () => callbacks.onError && callbacks.onError();
  window.speechSynthesis.speak(activeUtterance);
}

// Ask for the voice list as soon as the page loads: Safari fills it in about a second, so it
// is ready before the first tap. Without a list, speech falls back to lang "zh-CN" as before.
if (typeof window !== "undefined" && canUseAiVoice()) availableVoices();

export function playTeacherVoice(url, callbacks = {}) {
  if (!url) {
    if (callbacks.onUnavailable) callbacks.onUnavailable();
    return null;
  }
  const audio = new Audio(url);
  audio.onplay = () => callbacks.onStart && callbacks.onStart();
  audio.onended = () => callbacks.onEnd && callbacks.onEnd();
  audio.onerror = () => callbacks.onError && callbacks.onError();
  audio.play().catch(() => callbacks.onError && callbacks.onError());
  return audio;
}
