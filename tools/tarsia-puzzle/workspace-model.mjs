// Puzzle workspace rules (Phase B3), pure and DOM-free: progress, shuffle, restart and leave checks, header text.
import { matchCount, checkCompletion, getTemplate, placePiece } from './engine/index.mjs';
import { getMode } from './engine/modes.mjs';

// Progress counts correct shared edges, so it can go down when a correct match is broken.
export function progressOf(puzzle, state, template) {
  const matched = matchCount(puzzle, state, template), total = template.requiredPairs;
  return { matched, total, complete: checkCompletion(puzzle, state, template).complete,
    text: `${matched} of ${total} ${total === 1 ? 'match' : 'matches'}` };
}

// Shuffle changes only pieces still in the tray: their order and their rotation. Board pieces never move.
export function shuffleTray(state, random) {
  const next = { pieces: Object.fromEntries(Object.entries(state.pieces).map(([id, p]) => [id, { ...p }])), tray: random.shuffle(state.tray) };
  for (const id of next.tray) next.pieces[id].rotation = random.int(6);
  return next;
}

// Something would be lost by restarting or leaving: an unlocked piece has been put on the board.
export const hasProgress = (puzzle, state) => puzzle.pieces.some(p => !p.locked && state.pieces[p.id]?.slot);

// Header text: the shape (spatial challenge) and the mode (language challenge); no difficulty label.
export function puzzleInfo(puzzle, setTitles) {
  const t = getTemplate(puzzle.templateId), mode = getMode(puzzle.modeId);
  return { shape: `${t.name} · ${t.pieceCount} pieces`, mode: mode.label, sets: setTitles.join(', '), pairs: puzzle.requiredPairs };
}

// Tap-to-place (optional mode). A tap only ever selects; turning uses the separate Turn button, so the two never
// share a gesture. Tapping the selected piece again clears the selection; locked pieces cannot be selected.
export function tapPiece(state, selected, pieceId) {
  if (!state.pieces[pieceId] || state.pieces[pieceId].locked) return selected;
  return selected === pieceId ? null : pieceId;
}
// Tapping a slot with a piece selected places it there (same rules as a drop, incl. the geometric turn).
export function tapSlot(state, template, selected, slotId) {
  if (!selected) return { ok: false, reason: 'nothing-selected', state, selected };
  const result = placePiece(state, template, selected, slotId);
  return result.ok ? { ...result, selected: null } : { ...result, selected };
}
