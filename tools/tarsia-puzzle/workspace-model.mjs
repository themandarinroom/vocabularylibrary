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

// D3 (tap only): holding a placed piece this long sends it back to the tray.
export const LONG_PRESS_MS = 500;
// D3: what a tap on a PLACED piece does. Locked → nothing. While another piece is selected (waiting for a space),
// the tap must not turn or replace the placed piece → 'occupied'. Otherwise it turns 120° → 'rotate'.
export function boardTapAction(state, selected, pieceId) {
  const p = state.pieces[pieceId];
  if (!p || !p.slot || p.locked) return 'none';
  if (selected && selected !== pieceId) return 'occupied';
  return 'rotate';
}

// Keyboard (D1): arrow keys move the space cursor to the nearest slot in that direction (by slot centres).
// Returns the same slot when there is nothing further that way.
export function slotNeighbour(template, slotId, key) {
  const from = template.slotById.get(slotId)?.centroid;
  if (!from) return template.slots[0]?.id ?? null;
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!dir) return slotId;
  let best = slotId, bestScore = Infinity;
  for (const s of template.slots) {
    if (s.id === slotId) continue;
    const dx = s.centroid.x - from.x, dy = s.centroid.y - from.y;
    const along = dx * dir[0] + dy * dir[1], across = Math.abs(dx * dir[1] - dy * dir[0]);
    if (along <= 0.05) continue;                          // must lie in that direction
    const score = along + across;                          // nearest space roughly in that direction (visits ▲ and ▼ in turn)
    if (score < bestScore) { best = s.id; bestScore = score; }
  }
  return best;
}

// Spoken description of a piece for screen readers. Pictures are described by their word's English meaning.
export function pieceDescription(piece, words) {
  const parts = piece.edges.filter(Boolean).map(l => l.kind === 'picture' ? `a picture of ${words.get(l.pair)?.english || 'a word'}` : l.text);
  return parts.length ? `Piece with ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}` : 'Blank piece';
}
export const slotDescription = (template, slotId, occupied) => {
  const i = template.slots.findIndex(s => s.id === slotId) + 1;
  return `Space ${i} of ${template.slots.length}, ${occupied ? 'has a piece' : 'empty'}`;
};
