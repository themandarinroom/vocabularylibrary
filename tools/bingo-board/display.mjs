// v0.1.1 board display options and per-set "Choose all" state. Pure helpers; no game rules live here.
import { entryKey } from './vocabulary.mjs';

export const DISPLAY_ORDER = Object.freeze(['visual', 'english', 'hanzi', 'pinyin']);
export const DISPLAY_LABELS = Object.freeze({ visual: 'Visual', english: 'English', hanzi: 'Hanzi', pinyin: 'Pinyin' });
export const DEFAULT_DISPLAY = Object.freeze({ visual: false, english: false, hanzi: true, pinyin: false });

// Switching the last remaining option off is refused, so the board can never become empty.
export function toggleDisplay(display, option, on) {
  if (!DISPLAY_ORDER.includes(option)) throw new Error('Unknown display option.');
  const next = { ...display, [option]: Boolean(on) };
  return DISPLAY_ORDER.some(name => next[name]) ? Object.freeze(next) : display;
}
export const enabledCount = display => DISPLAY_ORDER.filter(name => display[name]).length;

// Student-facing Pinyin has no tone marks. Only the four tone diacritics are removed; ü is kept.
export function tonelessPinyin(value) {
  return typeof value === 'string' ? value.normalize('NFD').replace(/[̀́̄̌]/g, '').normalize('NFC') : '';
}

// Item images from the published Library, keyed like catalogue entries. Only https URLs are used.
// An item that merely reuses its set cover (imageSource "set-cover") has no picture of its own: the same image
// on several cells would not tell the words apart, so those cells fall back to text.
export function imagesFromSets(sourceSets) {
  const images = new Map();
  for (const set of Array.isArray(sourceSets) ? sourceSets : []) {
    if (!set || set.published === false || set.deleted === true || typeof set.id !== 'string') continue;
    for (const item of Array.isArray(set.items) ? set.items : []) {
      if (!item || typeof item.id !== 'string' || typeof item.image !== 'string' || item.imageSource === 'set-cover') continue;
      let url; try { url = new URL(item.image); } catch { continue; }
      if (url.protocol === 'https:' && !url.username && !url.password) images.set(entryKey(set.id.trim(), item.id.trim()), url.href);
    }
  }
  return images;
}

// What a cell shows, in toolbar order. If the only option is Visual and this word has no usable image,
// the cell shows its Hanzi instead, so every cell always has something to tap.
export function cellParts(display, hasImage) {
  const parts = DISPLAY_ORDER.filter(name => display[name] && (name !== 'visual' || hasImage));
  return parts.length ? parts : ['hanzi'];
}

// Selection state of one set in "Choose across sets": 'all' | 'some' | 'none'.
export function setSelectionState(set, isSelected) {
  const items = set?.items || [];
  const chosen = items.filter(item => isSelected(item.key)).length;
  return !items.length || chosen === 0 ? 'none' : chosen === items.length ? 'all' : 'some';
}
