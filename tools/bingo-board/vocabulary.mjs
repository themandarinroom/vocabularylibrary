// Read-only adaptation of published Library data. No second catalogue or save API.
export const entryKey = (setId, itemId) => JSON.stringify([setId, itemId]);
const text = value => typeof value === 'string' ? value.trim() : '';

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
        // Preserve Library Pinyin exactly; no tone generation or normalisation.
        pinyin: typeof item.pinyin === 'string' ? item.pinyin : '', english: text(item.english),
        aiEnabled: item.audio?.aiEnabled !== false,
        voiceRef: Object.freeze({ setId, itemId: id, documentId: `${setId}--${id}` }) }));
    }
    sets.push(Object.freeze({ id: setId, title: text(source.title) || setId, yearLevel: source.yearLevel,
      items: Object.freeze(items) }));
  }
  return { sets: Object.freeze(sets), diagnostics };
}

export function ambiguousEntries(items) {
  const byChinese = new Map();
  for (const item of items) {
    const visible = item.chinese.normalize('NFC').replace(/\s+/g, '');
    const group = byChinese.get(visible) || [];
    group.push(item); byChinese.set(visible, group);
  }
  return [...byChinese.values()].filter(group => group.length > 1);
}

export class VocabularySelection {
  #sets; #entries; #custom = new Set();
  constructor(sets) {
    this.#sets = new Map(sets.map(set => [set.id, set]));
    this.#entries = new Map(sets.flatMap(set => set.items).map(item => [item.key, item]));
    this.mode = 'whole'; this.setId = sets[0]?.id || '';
  }
  browse(setId) { if (!this.#sets.has(setId)) throw new Error('Choose an available published set.'); this.setId = setId; }
  setMode(mode) { if (!['whole', 'custom'].includes(mode)) throw new Error('Unknown selection mode.'); this.mode = mode; }
  toggle(key, selected) { if (!this.#entries.has(key)) throw new Error('That Library entry is unavailable.'); if (selected) this.#custom.add(key); else this.#custom.delete(key); }
  has(key) { return this.#custom.has(key); }
  remove(key) { this.#custom.delete(key); }
  clear() { this.#custom.clear(); }
  get items() { return this.mode === 'whole' ? [...(this.#sets.get(this.setId)?.items || [])] : [...this.#custom].map(key => this.#entries.get(key)); }
}
