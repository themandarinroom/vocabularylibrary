// Tarsia → shared Evidence of Learning record. Only built from a state the engine judges complete.
import { buildCompletionRecord } from '../../learning-record/record.mjs';
import { getTemplate } from './templates.mjs';
import { getMode, getLevel, successCriteria, levelForMode } from './modes.mjs';
import { checkCompletion, labelAt } from './validate.mjs';

export function tarsiaCompletionRecord(puzzle, state, { vocabularySets, student, completedAt = new Date(), timeTakenMs }) {
  const template = getTemplate(puzzle.templateId);
  const verdict = checkCompletion(puzzle, state, template);
  if (!verdict.complete) throw new Error('A learning record can only be made for a completed puzzle.');
  const mode = getMode(puzzle.modeId);
  // v0.1 student puzzles have no level: the record names the shape instead (pieces and pairs from the template).
  const level = puzzle.levelId ? getLevel(puzzle.levelId) : { id: template.id, label: `${template.name} · ${template.pieceCount} pieces · ${template.requiredPairs} pairs` };
  // The actual finished board, as the student completed it (labels per slot edge, in slot-direction order).
  const slots = template.slots.map(slot => ({ slot: slot.id, row: slot.row, col: slot.col, up: slot.up,
    edges: slot.dirs.map(dir => { const l = labelAt(puzzle, state, template, slot.id, dir); return l ? { dir, kind: l.kind, side: l.side, text: l.text, image: l.image } : { dir, blank: true }; }) }));
  return buildCompletionRecord({
    activity: { id: 'tarsia-puzzle', name: 'Tarsia Puzzle', category: 'Vocabulary Games' },
    completedAt, student, vocabularySets,
    difficulty: { id: level.id, label: level.label },
    matchingMode: { id: mode.id, label: mode.label },
    level: levelForMode(mode.id) ? { id: levelForMode(mode.id).id, label: levelForMode(mode.id).label } : undefined,
    timeTakenMs,
    matchesCompleted: template.requiredPairs,
    learningIntention: mode.learningIntention,
    successCriteria: successCriteria(template.requiredPairs),
    content: { kind: 'tarsia-board', templateId: template.id, shape: template.shape, shapeName: template.name, pieceCount: template.pieceCount, pairs: template.requiredPairs, slots }
  });
}
