// Listen anti-spam: TAP_LIMIT deliberate Listen taps within a rolling WINDOW_MS start a COOLDOWN_MS
// Listening Break. Taps during a break are ignored and never extend it. The expiry is stored locally,
// so reloading the page cannot skip the rest of a break. Automatic playback is never counted.
export const LISTEN_GUARD = Object.freeze({
  TAP_LIMIT: 5,          // taps …
  WINDOW_MS: 2000,       // … within this rolling window trigger a break
  COOLDOWN_MS: 30000,    // length of the break
  BUSY_MAX_MS: 6000,     // an overlapping tap is ignored only this long after playback began (guards a missed "ended")
  STORAGE_KEY: 'tmr-bingo-solo-listen-break-until'
});

export function createListenGuard({ config = LISTEN_GUARD, now = () => Date.now(), storage = safeStorage() } = {}) {
  const c = { ...LISTEN_GUARD, ...config };
  let taps = [], until = 0;
  // Restore a break that was running before a reload (clamped, so a wrong clock cannot make it longer).
  const stored = Number(storage.get(c.STORAGE_KEY));
  if (Number.isFinite(stored) && stored > now()) until = Math.min(stored, now() + c.COOLDOWN_MS);
  else storage.remove(c.STORAGE_KEY);

  const remainingMs = () => Math.max(0, until - now());
  const active = () => {
    if (until && now() >= until) { until = 0; storage.remove(c.STORAGE_KEY); }
    return until > 0;
  };
  // One deliberate Listen tap. Returns 'blocked' (during a break), 'break' (this tap starts one) or 'allowed'.
  function tap() {
    if (active()) return 'blocked';
    const t = now();
    taps = taps.filter(at => t - at < c.WINDOW_MS);
    taps.push(t);
    if (taps.length >= c.TAP_LIMIT) {
      taps = []; until = t + c.COOLDOWN_MS; storage.set(c.STORAGE_KEY, String(until));
      return 'break';
    }
    return 'allowed';
  }
  return { tap, active, remainingMs, config: c };
}

function safeStorage() {
  try {
    const s = window.localStorage;
    return { get: k => s.getItem(k), set: (k, v) => { try { s.setItem(k, v); } catch {} }, remove: k => { try { s.removeItem(k); } catch {} } };
  } catch { return { get: () => null, set: () => {}, remove: () => {} }; }
}
