// Student Setup model (Phase B2): pure and DOM-free. Turns the catalogue plus the student's choices into
// everything the setup screen shows: levels, modes, shapes, live counts, feedback, suggestions and the start
// configuration. Levels, modes and shapes come from the engine's data, so a future level (e.g. Starter) or
// shape appears here without code changes.
import { LEVELS, MODES, getTemplate, availableOptions } from './engine/index.mjs';
import { mergeSets, eligibleEntries } from '../vocabulary-games-core/vocabulary.mjs';

export const LEVEL_CHINESE = Object.freeze({ beginner: '初级', master: '高级' });
export const yearName = y => Number(y) === 0 ? 'Prep' : Number.isFinite(Number(y)) && y !== null && y !== '' ? `Year ${y}` : 'All years';
const stem = title => String(title || '').replace(/\s+[IVX]+$/, '').trim().toLowerCase(); // "Countries II" → "countries"

// Keep only sets that exist; fall back to a valid level.
export function normaliseSelection(sets, selection = {}) {
  const ids = new Set(sets.map(s => s.id));
  const setIds = [...new Set((selection.setIds || []).filter(id => ids.has(id)))];
  const levelId = LEVELS[selection.levelId] ? selection.levelId : Object.keys(LEVELS)[0];
  return { setIds, levelId, modeId: selection.modeId || null, templateId: selection.templateId || null };
}

// Sets grouped by year for the set cards, in year order and catalogue order within a year.
export function setGroups(sets) {
  const years = [...new Set(sets.map(s => s.yearLevel))].sort((a, b) => Number(a) - Number(b));
  return years.map(y => ({ year: y, label: yearName(y), sets: sets.filter(s => s.yearLevel === y) }));
}

function sample(entries, sides) {
  const { eligible } = eligibleEntries(entries, sides);
  return (eligible.find(e => e.labels.some(l => l.kind === 'picture')) || eligible[0])?.labels || null;
}

// Up to `limit` unselected sets that would make the chosen level/mode playable: same topic first, then same year.
export function suggestSets(sets, setIds, levelId, modeId, required, limit = 3) {
  const chosen = sets.filter(s => setIds.includes(s.id));
  return sets.filter(s => !setIds.includes(s.id)).map(s => {
    const usable = availableOptions(mergeSets(sets, [...setIds, s.id]).entries, levelId).find(o => o.modeId === modeId).usable;
    return { id: s.id, title: s.title, chineseTitle: s.chineseTitle, usable,
      sameTopic: chosen.some(c => stem(c.title) === stem(s.title)), sameYear: chosen.some(c => c.yearLevel === s.yearLevel) };
  }).filter(c => c.usable >= required)
    .sort((a, b) => b.sameTopic - a.sameTopic || b.sameYear - a.sameYear || b.usable - a.usable)
    .slice(0, limit).map(({ id, title, chineseTitle }) => ({ id, title, chineseTitle }));
}

export function setupView(sets, selection) {
  const sel = normaliseSelection(sets, selection);
  const { entries, duplicates } = mergeSets(sets, sel.setIds);
  const levels = Object.values(LEVELS).map(level => {
    const options = availableOptions(entries, level.id);
    const template = getTemplate(level.templates[0]);
    const best = Math.max(0, ...options.map(o => o.usable));
    return { id: level.id, label: level.label, chinese: LEVEL_CHINESE[level.id] || '', requiredPairs: template.requiredPairs,
      pieceCount: template.pieceCount, startingPieces: level.startingPieces, templateId: template.id,
      available: options.some(o => o.shapes.some(s => s.available)), best, selected: level.id === sel.levelId };
  });
  const options = availableOptions(entries, sel.levelId);
  // Keep the student's mode if it belongs to this level; otherwise the first playable one, otherwise the first.
  const modeId = options.some(o => o.modeId === sel.modeId) ? sel.modeId
    : (options.find(o => o.shapes.some(s => s.available)) || options[0]).modeId;
  const modeOption = options.find(o => o.modeId === modeId);
  const modes = options.map(o => ({ modeId: o.modeId, label: o.label, usable: o.usable, required: o.shapes[0].requiredPairs,
    available: o.shapes.some(s => s.available), selected: o.modeId === modeId, example: sample(entries, MODES[o.modeId].sides) }));
  const shape = modeOption.shapes.find(s => s.templateId === sel.templateId) || modeOption.shapes.find(s => s.available) || modeOption.shapes[0];
  const shapes = modeOption.shapes.map(s => ({ ...s, selected: s.templateId === shape.templateId }));
  const ready = sel.setIds.length > 0 && shape.available;
  const level = LEVELS[sel.levelId];
  return {
    selection: { ...sel, modeId, templateId: shape.templateId },
    words: entries.length, duplicates, setCount: sel.setIds.length,
    levels, modes, shapes, ready,
    summary: ready ? `${modeOption.usable} words · ${level.label} · ${modeOption.label} · ${shape.name} (${shape.pieceCount} pieces)` : '',
    feedback: ready ? null : sel.setIds.length === 0
      ? { kind: 'no-sets', message: 'Choose one or more Vocabulary Sets to begin.', suggestions: [] }
      : { kind: 'too-few', required: shape.requiredPairs, usable: modeOption.usable, modeLabel: modeOption.label,
          message: `This puzzle needs ${shape.requiredPairs} different words. Your sets have ${modeOption.usable} ${modeOption.usable === 1 ? 'word' : 'words'} that work with ${modeOption.label}. Please choose another Vocabulary Set.`,
          suggestions: suggestSets(sets, sel.setIds, sel.levelId, modeId, shape.requiredPairs) },
    start: ready ? { setIds: sel.setIds, levelId: sel.levelId, modeId, templateId: shape.templateId } : null
  };
}

// Shareable setup URL state: ?set=a,b&level=…&mode=… (same parameter name as Build the Great Wall).
export function selectionFromParams(params) {
  return { setIds: (params.get('set') || '').split(',').map(s => s.trim()).filter(Boolean),
    levelId: params.get('level') || undefined, modeId: params.get('mode') || undefined };
}
export function selectionToParams(selection) {
  const p = new URLSearchParams();
  if (selection.setIds.length) p.set('set', selection.setIds.join(','));
  p.set('level', selection.levelId);
  if (selection.modeId) p.set('mode', selection.modeId);
  return p;
}
