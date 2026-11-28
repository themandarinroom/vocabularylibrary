// Phase B1: validation report for real published vocabulary (developer tool, read-only, DOM-free).
// Input is the catalogue produced by the shared adapter; nothing is written anywhere.
import { MODES, LEVELS, createPuzzle, getTemplate, checkCompletion, VocabularyError } from '../engine/index.mjs';
import { mergeSets, eligibleEntries, conflictKeys, usableCount, exclusionSummary, hanziKey, pinyinKey, englishKeys, imageKeys, displayPinyin } from '../../vocabulary-games-core/vocabulary.mjs';

// Every non-empty combination of the given set IDs, in a stable order (singles, pairs, … all).
export function setCombinations(ids) {
  const combos = [];
  for (let mask = 1; mask < 1 << ids.length; mask++) combos.push(ids.filter((_, i) => mask & (1 << i)));
  return combos.sort((a, b) => a.length - b.length || ids.indexOf(a[0]) - ids.indexOf(b[0]) || ids.indexOf(a[1]) - ids.indexOf(b[1]));
}

const word = e => `${e.chinese} (${displayPinyin(e.pinyin)} · ${e.english || '—'})`;
const solved = puzzle => ({ pieces: Object.fromEntries(puzzle.pieces.map(p => [p.id, { slot: p.home.slot, rotation: p.home.rotation, locked: p.locked }])), tray: [] });

// Pairs of words whose labels collide for one representation (what the ambiguity policy keeps apart).
export function collisions(entries, kind) {
  const groups = new Map();
  for (const e of entries) for (const key of conflictKeys(e, kind)) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups].filter(([, list]) => list.length > 1).map(([key, list]) => ({ kind, key, words: list.map(word) }));
}

export function setSummary(set) {
  const missing = { pinyin: [], english: [], picture: [] };
  for (const e of set.items) {
    if (!displayPinyin(e.pinyin)) missing.pinyin.push(word(e));
    if (!e.english) missing.english.push(word(e));
    if (!e.image) missing.picture.push(word(e));
  }
  return { id: set.id, title: set.title, chineseTitle: set.chineseTitle, yearLevel: set.yearLevel, items: set.items.length, missing };
}

// One combination × every level and mode: counts, exclusions, collisions and a seeded generation run.
export function combinationReport(sets, setIds, { seeds = 200 } = {}) {
  const { entries, duplicates } = mergeSets(sets, setIds);
  const allowed = new Set(entries.map(e => e.key));
  const modes = [];
  for (const level of Object.values(LEVELS)) for (const modeId of level.modes) {
    const mode = MODES[modeId], template = getTemplate(level.templates[0]);
    const { eligible, excluded } = eligibleEntries(entries, mode.sides);
    const usable = usableCount(entries, mode.sides);
    const result = { level: level.id, modeId, label: mode.label, required: template.requiredPairs, total: entries.length,
      eligible: eligible.length, usable, excluded: exclusionSummary(excluded), excludedWords: excluded.map(x => `${word(x.entry)}: ${x.reason}`),
      collisions: mode.sides.flatMap(kind => collisions(eligible.map(x => x.entry), kind)), available: usable >= template.requiredPairs };
    if (!result.available) {
      try { createPuzzle({ entries, levelId: level.id, modeId, seed: 1 }); result.refusal = 'ERROR: generated despite too few words'; }
      catch (error) { result.refusal = error instanceof VocabularyError ? error.message : `ERROR: ${error.message}`; result.refusalReasons = error.details?.reasons || []; }
    } else {
      let failures = 0, outside = 0; const used = new Set();
      for (let seed = 0; seed < seeds; seed++) {
        const puzzle = createPuzzle({ entries, levelId: level.id, modeId, seed });
        if (!checkCompletion(puzzle, solved(puzzle), template).complete) failures++;
        for (const w of puzzle.words) { used.add(w.key); if (!allowed.has(w.key) || !setIds.includes(w.setId)) outside++; }
      }
      Object.assign(result, { seeds, failures, wordsOutsideSelection: outside, distinctWordsUsed: used.size });
    }
    modes.push(result);
  }
  return { setIds, total: entries.length, mergedDuplicates: duplicates, modes,
    beginner: modes.filter(m => m.level === 'beginner').map(m => `${m.label}: ${m.available ? 'yes' : 'no'}`),
    master: modes.filter(m => m.level === 'master').map(m => `${m.label}: ${m.available ? 'yes' : 'no'}`) };
}

// Cross-set review of everything selected: same Hanzi, Pinyin, English sense or image file.
export function ambiguityReview(sets, setIds) {
  const entries = setIds.flatMap(id => sets.find(s => s.id === id)?.items || []); // before merging, to see cross-set duplicates
  const by = (keyOf) => {
    const groups = new Map();
    for (const e of entries) for (const k of keyOf(e)) { if (!k) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(`${e.setId}: ${word(e)}`); }
    return [...groups].filter(([, l]) => l.length > 1).map(([key, words]) => ({ key, words }));
  };
  return {
    hanzi: by(e => [hanziKey(e.chinese)]), pinyin: by(e => [pinyinKey(e.pinyin)]),
    english: by(e => englishKeys(e.english)), imageFile: by(e => imageKeys(e))
  };
}

export function vocabularyReport(sets, setIds, options) {
  const missingSets = setIds.filter(id => !sets.some(s => s.id === id));
  const present = setIds.filter(id => !missingSets.includes(id));
  return {
    sets: present.map(id => setSummary(sets.find(s => s.id === id))), missingSets,
    combinations: setCombinations(present).map(ids => combinationReport(sets, ids, options)),
    ambiguity: ambiguityReview(sets, present)
  };
}
