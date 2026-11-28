// Seedable randomness. The same seed always produces the same puzzle (tests, bug reports, replays).

// Seeds are unsigned 32-bit integers; strings (e.g. from a URL) are hashed to one.
export function normaliseSeed(seed) {
  if (Number.isInteger(seed)) return seed >>> 0;
  if (typeof seed === 'string' && seed.length) {
    let h = 2166136261; // FNV-1a
    for (const ch of seed) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  throw new Error('A puzzle seed must be an integer or a non-empty string.');
}

// mulberry32: small, fast and well distributed for game use (not for security).
export function createRandom(seed) {
  let state = normaliseSeed(seed);
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = n => Math.floor(next() * n);
  const shuffle = list => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) { const j = int(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  };
  return Object.freeze({ next, int, shuffle, pick: list => list[int(list.length)], coin: () => next() < 0.5 });
}

// A fresh seed for "New puzzle" in the browser; tests always pass explicit seeds.
export const randomSeed = () => (globalThis.crypto?.getRandomValues?.(new Uint32Array(1))[0] ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
