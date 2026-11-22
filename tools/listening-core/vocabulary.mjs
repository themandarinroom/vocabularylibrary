// Listening Core: read-only adaptation of published Vocabulary Library sets.
// Shared by Build the Great Wall and future listening games (Picture Puzzle, Mandarin Maze).
// Same rules as Bingo Solo's catalogue adapter (tools/bingo-board/vocabulary.mjs, display.mjs),
// copied rather than imported so that changes to one game never break another.
// No second catalogue, no writes, no save API.

export const entryKey = (setId, itemId) => JSON.stringify([setId, itemId]);
const text = value => typeof value === 'string' ? value.trim() : '';

// Only https item images, never ones that merely reuse the set cover (the same picture on
// several answers would not tell the words apart).
export function itemImage(item) {
  if (!item || typeof item.image !== 'string' || item.imageSource === 'set-cover') return '';
  let url; try { url = new URL(item.image); } catch { return ''; }
  return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
}

export function catalogueFromSets(sourceSets) {
  const diagnostics = [];
  const seenSets = new Set();
  const sets = [];
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
        image: itemImage(item), aiEnabled: item.audio?.aiEnabled !== false }));
    }
    sets.push(Object.freeze({ id: setId, title: text(source.title) || setId, chineseTitle: text(source.chineseTitle),
      yearLevel: source.yearLevel, items: Object.freeze(items) }));
  }
  return { sets: Object.freeze(sets), diagnostics };
}

const visible = chinese => chinese.normalize('NFC').replace(/\s+/g, '');

// The words a listening game can ask about: one entry per visible Chinese word, so two answer
// choices can never look identical. Returns the pool and how many look-alike entries were skipped.
export function listeningPool(set) {
  const seen = new Set(), pool = [];
  let skipped = 0;
  for (const item of set?.items || []) {
    const word = visible(item.chinese);
    if (seen.has(word)) { skipped++; continue; }
    seen.add(word); pool.push(item);
  }
  return { pool, skipped };
}

export const yearLabel = yearLevel => Number(yearLevel) === 0 ? 'Prep' : Number.isFinite(Number(yearLevel)) && yearLevel !== null && yearLevel !== '' ? `Year ${yearLevel}` : 'All years';
