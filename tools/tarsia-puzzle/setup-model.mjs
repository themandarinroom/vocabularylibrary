// Student Setup model (revised v0.1): pure and DOM-free. Three independent choices — vocabulary sets, puzzle shape
// (the spatial challenge) and matching mode (the language challenge). Shapes come from the engine's STUDENT_TEMPLATES,
// so a future shape (e.g. a Starter level's) appears without code changes. The student's shape and mode are never
// changed for them: an unplayable combination is explained, and Start stays disabled.
import { MODES, MATCH_LEVELS, levelForMode, STUDENT_TEMPLATES, studentOptions } from './engine/index.mjs';
import { mergeSets, eligibleEntries, usableCount } from '../vocabulary-games-core/vocabulary.mjs';

export const DEFAULT_SHAPE = 'hexagon-6';
export const DEFAULT_MODE = 'pinyin-picture'; // D3: Beginner · Pinyin + Picture is the default
export const yearName = y => Number(y) === 0 ? 'Prep' : Number.isFinite(Number(y)) && y !== null && y !== '' ? `Year ${y}` : 'All years';
const stem = title => String(title || '').replace(/\s+[IVX]+$/, '').trim().toLowerCase(); // "Countries II" → "countries"

export function normaliseSelection(sets, selection = {}) {
  const ids = new Set(sets.map(s => s.id));
  return {
    setIds: [...new Set((selection.setIds || []).filter(id => ids.has(id)))],
    templateId: STUDENT_TEMPLATES.some(t => t.id === selection.templateId) ? selection.templateId : DEFAULT_SHAPE,
    modeId: MODES[selection.modeId] ? selection.modeId : DEFAULT_MODE
  };
}

export function setGroups(sets) {
  const years = [...new Set(sets.map(s => s.yearLevel))].sort((a, b) => Number(a) - Number(b));
  return years.map(y => ({ year: y, label: yearName(y), sets: sets.filter(s => s.yearLevel === y) }));
}

function sample(entries, sides) {
  const { eligible } = eligibleEntries(entries, sides);
  return (eligible.find(e => e.labels.some(l => l.kind === 'picture')) || eligible[0])?.labels || null;
}

// Up to `limit` unselected sets that would make the chosen shape + mode playable: same topic first, then same year.
export function suggestSets(sets, setIds, modeId, required, limit = 3) {
  const chosen = sets.filter(s => setIds.includes(s.id));
  return sets.filter(s => !setIds.includes(s.id)).map(s => ({ s,
    usable: usableCount(mergeSets(sets, [...setIds, s.id]).entries, MODES[modeId].sides),
    sameTopic: chosen.some(c => stem(c.title) === stem(s.title)), sameYear: chosen.some(c => c.yearLevel === s.yearLevel) }))
    .filter(c => c.usable >= required)
    .sort((a, b) => b.sameTopic - a.sameTopic || b.sameYear - a.sameYear || b.usable - a.usable)
    .slice(0, limit).map(({ s }) => ({ id: s.id, title: s.title, chineseTitle: s.chineseTitle }));
}

export function setupView(sets, selection) {
  const sel = normaliseSelection(sets, selection);
  const { entries, duplicates } = mergeSets(sets, sel.setIds);
  const options = studentOptions(entries);
  const usableFor = modeId => options[0].modes.find(m => m.modeId === modeId).usable;
  const chosenShape = options.find(o => o.templateId === sel.templateId);
  const mode = MODES[sel.modeId];
  const shapes = options.map(o => ({ templateId: o.templateId, name: o.name, pieceCount: o.pieceCount, requiredPairs: o.requiredPairs,
    selected: o.templateId === sel.templateId, available: usableFor(sel.modeId) >= o.requiredPairs,
    reason: usableFor(sel.modeId) >= o.requiredPairs ? '' : `Needs ${o.requiredPairs} words · ${mode.label} has ${usableFor(sel.modeId)}` }));
  const modes = Object.values(MODES).map(m => { const usable = usableFor(m.id), ok = usable >= chosenShape.requiredPairs;
    return { modeId: m.id, label: m.label, usable, required: chosenShape.requiredPairs, selected: m.id === sel.modeId, available: ok,
      reason: ok ? '' : `Needs ${chosenShape.requiredPairs} words · you have ${usable}`, example: sample(entries, m.sides) }; });
  const usable = usableFor(sel.modeId), ready = sel.setIds.length > 0 && usable >= chosenShape.requiredPairs;
  let feedback = null;
  if (!sel.setIds.length) feedback = { kind: 'no-sets', message: 'Choose one or more Vocabulary Sets to begin.', suggestions: [], smallerShapes: [] };
  else if (!ready) feedback = { kind: 'too-few', required: chosenShape.requiredPairs, usable, modeLabel: mode.label, shapeName: chosenShape.name,
    message: `This puzzle needs ${chosenShape.requiredPairs} different words. Your sets have ${usable} ${usable === 1 ? 'word' : 'words'} that work with ${mode.label}.`,
    suggestions: suggestSets(sets, sel.setIds, sel.modeId, chosenShape.requiredPairs),
    smallerShapes: shapes.filter(s => s.available).map(s => s.name) };
  // D3: "Choose a level" — each level lists its matching modes (with their word counts) for its dropdown.
  const level = levelForMode(sel.modeId);
  const levels = Object.values(MATCH_LEVELS).map(l => ({ id: l.id, label: l.label, chinese: l.chinese, selected: l.id === level.id,
    modes: modes.filter(m => l.modes.includes(m.modeId)) }));
  const preview = entries.slice(0, 24).map(e => ({ chinese: e.chinese, english: e.english }));
  return {
    selection: sel, words: entries.length, duplicates, setCount: sel.setIds.length, shapes, modes, level: level.id, levels, preview, ready, feedback,
    summary: ready ? `${usable} words · ${chosenShape.name} (${chosenShape.pieceCount} pieces · ${chosenShape.requiredPairs} pairs) · ${level.label} · ${mode.label}` : '',
    start: ready ? { setIds: sel.setIds, templateId: sel.templateId, modeId: sel.modeId } : null
  };
}

// Shareable setup URL state: ?set=a,b&shape=…&mode=… (same `set` parameter as Build the Great Wall).
export function selectionFromParams(params) {
  return { setIds: (params.get('set') || '').split(',').map(s => s.trim()).filter(Boolean),
    templateId: params.get('shape') || undefined, modeId: params.get('mode') || undefined };
}
export function selectionToParams(selection) {
  const p = new URLSearchParams();
  if (selection.setIds.length) p.set('set', selection.setIds.join(','));
  p.set('shape', selection.templateId);
  p.set('mode', selection.modeId);
  return p;
}
