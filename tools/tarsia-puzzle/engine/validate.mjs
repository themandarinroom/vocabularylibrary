// Matching and completion, decided from the logical state only (never from the DOM or a stored answer).
import { edgeIndexFacing, fitsSlot } from './geometry.mjs';

// Two facing labels match when both show the same word, one from each side of the matching mode.
export const labelsMatch = (a, b) => Boolean(a && b && a.pair === b.pair && a.side !== b.side);

export function occupants(puzzle, state) {
  const bySlot = new Map();
  for (const piece of puzzle.pieces) {
    const slot = state.pieces[piece.id]?.slot;
    if (!slot) continue;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(piece.id);
  }
  return bySlot;
}

const cache = new WeakMap();
const pieceById = puzzle => { if (!cache.has(puzzle.pieces)) cache.set(puzzle.pieces, new Map(puzzle.pieces.map(p => [p.id, p]))); return cache.get(puzzle.pieces); };

// The label a placed piece shows on the slot edge facing `dir`; undefined when empty or wrongly oriented.
export function labelAt(puzzle, state, template, slotIdValue, dir) {
  const ids = occupants(puzzle, state).get(slotIdValue);
  if (!ids || ids.length !== 1) return undefined;
  const place = state.pieces[ids[0]];
  const index = edgeIndexFacing(place.rotation, dir);
  if (index < 0 || !fitsSlot(place.rotation, template.slotById.get(slotIdValue).up)) return undefined;
  return pieceById(puzzle).get(ids[0]).edges[index];
}

// Status of every shared edge: 'open' (a side is empty), 'match' or 'mismatch'. Used for gentle feedback.
export function edgeStatuses(puzzle, state, template) {
  return template.internalEdges.map(edge => {
    const a = labelAt(puzzle, state, template, edge.a, edge.aDir), b = labelAt(puzzle, state, template, edge.b, edge.bDir);
    return { ...edge, status: a === undefined || b === undefined ? 'open' : labelsMatch(a, b) ? 'match' : 'mismatch' };
  });
}

export const matchCount = (puzzle, state, template) => edgeStatuses(puzzle, state, template).filter(e => e.status === 'match').length;

// Complete only when every slot holds exactly one correctly oriented piece, every piece is used once,
// every shared edge matches and every boundary edge is blank. Any arrangement meeting these rules is accepted.
export function checkCompletion(puzzle, state, template) {
  const problems = [];
  const bySlot = occupants(puzzle, state);
  for (const [slot, ids] of bySlot) {
    if (!template.slotById.has(slot)) problems.push(`piece on unknown slot ${slot}`);
    if (ids.length > 1) problems.push(`slot ${slot} holds ${ids.length} pieces`);
  }
  for (const slot of template.slots) {
    const ids = bySlot.get(slot.id);
    if (!ids) { problems.push(`slot ${slot.id} is empty`); continue; }
    if (ids.length === 1 && !fitsSlot(state.pieces[ids[0]].rotation, slot.up)) problems.push(`piece in ${slot.id} points the wrong way`);
  }
  const placedIds = [...bySlot.values()].flat();
  if (new Set(placedIds).size !== placedIds.length || placedIds.length !== puzzle.pieces.length) problems.push('every piece must be used exactly once');
  for (const edge of edgeStatuses(puzzle, state, template)) {
    if (edge.status !== 'match') problems.push(`edge ${edge.a}/${edge.b} is ${edge.status}`);
  }
  for (const { slot, dir } of template.boundaryEdges) {
    const label = labelAt(puzzle, state, template, slot, dir);
    if (label) problems.push(`boundary edge of ${slot} shows a word`);
  }
  return { complete: problems.length === 0, problems };
}
export const isComplete = (puzzle, state, template) => checkCompletion(puzzle, state, template).complete;
