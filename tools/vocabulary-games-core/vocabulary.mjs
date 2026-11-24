// Vocabulary Games core: read-only adaptation of published Vocabulary Library sets for matching games
// (Tarsia Puzzle now; Dominoes, Memory Match later). Same catalogue rules as Listening Core and Bingo Solo,
// copied rather than imported so that a change to one game never breaks another.
// No second catalogue, no writes, no image copies.

export const entryKey = (setId, itemId) => JSON.stringify([setId, itemId]);
const text = value => typeof value === 'string' ? value.trim() : '';

// Only https item images of the word itself (not the reused set cover), without credentials.
// `allowData` exists only for the local developer prototype's fixture pictures.
export function itemImage(item, { allowData = false } = {}) {
  if (!item || typeof item.image !== 'string' || item.imageSource === 'set-cover') return '';
  if (allowData && /^data:image\/(svg\+xml|png|webp|jpeg);/.test(item.image)) return item.image;
  let url; try { url = new URL(item.image); } catch { return ''; }
  return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
}

export function catalogueFromSets(sourceSets, options = {}) {
  const diagnostics = [], seenSets = new Set(), sets = [];
  for (const source of Array.isArray(sourceSets) ? sourceSets : []) {
    if (!source || source.published === false || source.deleted === true) continue;
    const setId = text(source.id);
    if (!setId || seenSets.has(setId)) { diagnostics.push('A missing or repeated set ID was excluded.'); continue; }
    seenSets.add(setId);
    const counts = new Map();
    for (const item of Array.isArray(source.items) ? source.items : []) counts.set(text(item?.id), (counts.get(text(item?.id)) || 0) + 1);
    const items = [];
    for (const item of Array.isArray(source.items) ? source.items : []) {
      const id = text(item?.id), chinese = text(item?.chinese);
      if (!id || !chinese || counts.get(id) !== 1) { diagnostics.push(`${setId}: an empty or repeated item ID / empty Chinese entry was excluded.`); continue; }
      items.push(Object.freeze({ key: entryKey(setId, id), setId, id, chinese,
        pinyin: typeof item.pinyin === 'string' ? item.pinyin : '', english: text(item.english),
        image: itemImage(item, options), imageStoragePath: text(item.imageStoragePath) }));
    }
    sets.push(Object.freeze({ id: setId, title: text(source.title) || setId, chineseTitle: text(source.chineseTitle),
      yearLevel: source.yearLevel, items: Object.freeze(items) }));
  }
  return { sets: Object.freeze(sets), diagnostics };
}

// ---- Student-facing display (existing Library conventions) ----

// Pinyin without tone marks (ü kept), lowercase, single spaces between syllables.
export function displayPinyin(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFD').replace(/[̀́̄̌]/g, '').normalize('NFC')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
export const displayHanzi = value => typeof value === 'string' ? value.normalize('NFC').trim() : '';
export const displayEnglish = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

// ---- Comparison keys used by the ambiguity policy ----

const PUNCT = /[\s\p{P}\p{S}]/gu;
export const hanziKey = value => displayHanzi(value).replace(PUNCT, '');
// Toneless and spaceless, v = ü: also catches homophones such as 是 / 十 (shi).
export const pinyinKey = value => displayPinyin(value).replace(/v/g, 'ü').replace(PUNCT, '');
// Every English sense ("Australia / Oceania" → two senses), lowercase, without leading to/the/a/an.
export function englishKeys(value) {
  return [...new Set(displayEnglish(value).toLowerCase().split(/[\/,;]| or /)
    .map(sense => sense.replace(/\(.*?\)/g, '').replace(/^\s*(to|the|a|an)\s+/, '').replace(PUNCT, ''))
    .filter(Boolean))];
}
// The same picture file: identical Storage path, or the same URL without its query (download tokens vary).
export function imageKeys(entry) {
  const keys = [];
  if (entry.imageStoragePath) keys.push(`path:${entry.imageStoragePath}`);
  if (entry.image) {
    if (entry.image.startsWith('data:')) keys.push(`data:${entry.image}`);
    else { try { const url = new URL(entry.image); keys.push(`url:${url.origin}${decodeURIComponent(url.pathname)}`); } catch { /* not usable */ } }
    // Firebase download URLs encode the Storage path in the pathname: …/o/<path>
    const match = /\/o\/([^?]+)/.exec(entry.image);
    if (match) keys.push(`path:${decodeURIComponent(match[1])}`);
  }
  return [...new Set(keys)];
}

// ---- Merging selected sets ----

// Words from the chosen sets in set order; the same visible Chinese word in several sets is kept once
// (first set wins), as in Build the Great Wall.
export function mergeSets(sets, setIds) {
  const chosen = setIds.map(id => sets.find(set => set.id === id)).filter(Boolean);
  const seen = new Set(), entries = [];
  let duplicates = 0;
  for (const set of chosen) for (const entry of set.items) {
    const key = hanziKey(entry.chinese);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key); entries.push(entry);
  }
  return { entries, duplicates, sets: chosen };
}

// ---- Representations ----

export const REPRESENTATIONS = Object.freeze(['hanzi', 'pinyin', 'english', 'picture']);
export const LABEL_LIMITS = Object.freeze({ hanzi: 6, pinyin: 22, english: 22 }); // Decision D5

// The visible label for one representation of a word, or a reason it cannot be shown.
export function representation(entry, kind, limits = LABEL_LIMITS) {
  const value = kind === 'hanzi' ? displayHanzi(entry.chinese) : kind === 'pinyin' ? displayPinyin(entry.pinyin)
    : kind === 'english' ? displayEnglish(entry.english) : kind === 'picture' ? entry.image || '' : null;
  if (value === null) throw new Error(`Unknown representation: ${kind}`);
  if (!value) return { ok: false, reason: `missing-${kind}` };
  if (kind === 'picture') return { ok: true, label: { kind, image: value } };
  const length = kind === 'hanzi' ? [...hanziKey(value)].length : value.length;
  if (length > limits[kind]) return { ok: false, reason: 'too-long' };
  return { ok: true, label: { kind, text: value } };
}

// Keys that must be unique among the chosen words, per representation.
export function conflictKeys(entry, kind) {
  if (kind === 'hanzi') return [`hanzi:${hanziKey(entry.chinese)}`];
  if (kind === 'pinyin') return [`pinyin:${pinyinKey(entry.pinyin)}`];
  if (kind === 'english') return englishKeys(entry.english).map(sense => `english:${sense}`);
  // A picture shows a meaning. Two words with the same English meaning (澳大利亚 / 澳洲, both "Australia") get
  // pictures a student cannot tell apart even when the files differ, so they are kept apart in picture modes too.
  return [...imageKeys(entry).map(key => `picture:${key}`), ...englishKeys(entry.english).map(sense => `picture-meaning:${sense}`)];
}

// Which merged words can show both representations of a matching mode.
export function eligibleEntries(entries, kinds, limits = LABEL_LIMITS) {
  const eligible = [], excluded = [];
  for (const entry of entries) {
    const reps = kinds.map(kind => representation(entry, kind, limits));
    const failed = reps.find(rep => !rep.ok);
    if (failed) excluded.push({ entry, reason: failed.reason });
    else eligible.push({ entry, labels: reps.map(rep => rep.label) });
  }
  return { eligible, excluded };
}

// Greedy selection over a seeded shuffle: a word is taken only if none of its visible labels could be
// confused with a word already taken. Returns the chosen words and how many were skipped as ambiguous.
export function selectUnambiguous(eligible, kinds, count, shuffle) {
  const used = new Set(), chosen = [];
  let ambiguous = 0;
  for (const candidate of shuffle(eligible)) {
    if (chosen.length === count) break;
    const keys = kinds.flatMap(kind => conflictKeys(candidate.entry, kind));
    if (keys.some(key => used.has(key))) { ambiguous++; continue; }
    keys.forEach(key => used.add(key));
    chosen.push(candidate);
  }
  return { chosen, ambiguous };
}

// How many unambiguous words the pool can supply at most (order-independent upper bound is hard;
// this greedy count in pool order is what the setup screen uses to offer compatible shapes).
export function usableCount(entries, kinds, limits = LABEL_LIMITS) {
  const { eligible } = eligibleEntries(entries, kinds, limits);
  return selectUnambiguous(eligible, kinds, Infinity, list => list).chosen.length;
}

const REASON_TEXT = {
  'missing-pinyin': 'have no Pinyin', 'missing-english': 'have no English', 'missing-hanzi': 'have no Chinese characters',
  'missing-picture': 'have no picture of their own', 'too-long': 'are too long to fit on a puzzle edge'
};
export function exclusionSummary(excluded) {
  const counts = new Map();
  for (const { reason } of excluded) counts.set(reason, (counts.get(reason) || 0) + 1);
  return [...counts].map(([reason, n]) => `${n} ${n === 1 ? 'word' : 'words'} ${REASON_TEXT[reason] || reason}`);
}

export const yearLabel = yearLevel => Number(yearLevel) === 0 ? 'Prep' : Number.isFinite(Number(yearLevel)) && yearLevel !== null && yearLevel !== '' ? `Year ${yearLevel}` : 'All years';
