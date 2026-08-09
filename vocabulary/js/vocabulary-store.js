import { vocabularySets } from "./vocabulary-data.js";

const STORAGE_KEY = "mandarin-room-vocabulary-v2";
const clone = (value) => JSON.parse(JSON.stringify(value));

export function getSets() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return clone(vocabularySets);
    let changed = false;
    const cleaned = saved.map((set) => ({ ...set, items: set.items.map((item) => {
      if (item.alignment === undefined && item.segments === undefined) return item;
      const cleanItem = { ...item };
      delete cleanItem.alignment;
      delete cleanItem.segments;
      changed = true;
      return cleanItem;
    }) }));
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch (_) {
    return clone(vocabularySets);
  }
}

export function getSet(id) {
  return getSets().find((set) => set.id === id) || null;
}

export function saveSet(nextSet, originalId = null) {
  const sets = getSets();
  const duplicate = sets.some((set) => set.id === nextSet.id && set.id !== originalId);
  if (duplicate) throw new Error("That stable ID is already in use.");
  const index = originalId ? sets.findIndex((set) => set.id === originalId) : -1;
  if (index >= 0) sets[index] = clone(nextSet); else sets.push(clone(nextSet));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
}

export function deleteSet(id) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getSets().filter((set) => set.id !== id)));
}
