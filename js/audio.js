let activeUtterance = null;

export function canUseAiVoice() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function speakMandarin(text, callbacks = {}) {
  if (!canUseAiVoice()) {
    if (callbacks.onUnavailable) callbacks.onUnavailable();
    return;
  }
  window.speechSynthesis.cancel();
  activeUtterance = new SpeechSynthesisUtterance(text);
  activeUtterance.lang = "zh-CN";
  activeUtterance.rate = 0.82;
  activeUtterance.onstart = () => callbacks.onStart && callbacks.onStart();
  activeUtterance.onend = () => callbacks.onEnd && callbacks.onEnd();
  activeUtterance.onerror = () => callbacks.onError && callbacks.onError();
  window.speechSynthesis.speak(activeUtterance);
}

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
