// Pure placement reducers. Each returns { ok: true, state, ... } with a new state object, or
// { ok: false, reason, state } with the state unchanged. The UI renders whatever state it is given.
//
// State: { pieces: { [pieceId]: { slot: slotId | null, rotation: 0..5, locked: boolean } }, tray: [pieceId…] }
// A piece is either in exactly one slot or in the tray, never both; a slot holds at most one piece.
import { norm, fitsSlot, rotationIsUp } from './geometry.mjs';

const refuse = (state, reason) => ({ ok: false, reason, state });
const clone = state => ({ pieces: Object.fromEntries(Object.entries(state.pieces).map(([id, p]) => [id, { ...p }])), tray: [...state.tray] });
const occupantOf = (state, slot) => Object.keys(state.pieces).find(id => state.pieces[id].slot === slot) || null;

function check(state, template, pieceId) {
  const piece = state.pieces[pieceId];
  if (!piece) return 'unknown-piece';
  if (piece.locked) return 'locked';
  return null;
}

// Tap = rotate clockwise. In the tray one tap turns 60° (six taps return). On the board one tap turns 120°
// so the piece stays in its slot (▲ stays ▲); six taps are 720° and also return it to where it started.
export function rotatePiece(state, template, pieceId) {
  const problem = check(state, template, pieceId);
  if (problem) return refuse(state, problem);
  const next = clone(state), piece = next.pieces[pieceId];
  const steps = piece.slot ? 2 : 1;
  piece.rotation = norm(piece.rotation + steps);
  return { ok: true, state: next, steps };
}

// Drop a piece (from the tray or another slot) onto a slot. Occupied slots are refused (no overlaps).
// Decision D3: a piece pointing the wrong way is snapped in after one 60° clockwise turn (same as one tap).
// This adjustment is geometric only: it depends on nothing but the piece's rotation and the slot's ▲/▼ shape.
// The reducers are deliberately given the state and the template, never the puzzle's labels, so they cannot
// look at vocabulary or choose a matching orientation. Solving the vocabulary stays the student's job.
export const geometricFit = (rotation, slotUp) => fitsSlot(rotation, slotUp) ? norm(rotation) : norm(rotation + 1);

export function placePiece(state, template, pieceId, targetSlot) {
  const problem = check(state, template, pieceId);
  if (problem) return refuse(state, problem);
  const slot = template.slotById.get(targetSlot);
  if (!slot) return refuse(state, 'unknown-slot');
  const occupant = occupantOf(state, targetSlot);
  if (occupant && occupant !== pieceId) return refuse(state, 'occupied');
  const next = clone(state), piece = next.pieces[pieceId];
  const fitted = geometricFit(piece.rotation, slot.up);
  const autoRotated = fitted !== piece.rotation;
  piece.rotation = fitted;
  piece.slot = targetSlot;
  next.tray = next.tray.filter(id => id !== pieceId);
  return { ok: true, state: next, autoRotated };
}

// Take a piece off the board and return it to the end of the tray (or move it within the tray).
export function removePiece(state, template, pieceId, trayIndex = null) {
  const problem = check(state, template, pieceId);
  if (problem) return refuse(state, problem);
  const next = clone(state);
  next.pieces[pieceId].slot = null;
  next.tray = next.tray.filter(id => id !== pieceId);
  const index = trayIndex === null ? next.tray.length : Math.max(0, Math.min(trayIndex, next.tray.length));
  next.tray.splice(index, 0, pieceId);
  return { ok: true, state: next };
}

export const resetState = puzzle => clone(puzzle.initialState);

// Structural invariants (used by tests and by the prototype's debug panel).
export function stateProblems(puzzle, state, template) {
  const problems = [], seenSlots = new Map();
  const ids = puzzle.pieces.map(p => p.id);
  if (Object.keys(state.pieces).length !== ids.length || !ids.every(id => state.pieces[id])) problems.push('piece list does not match the puzzle');
  for (const id of ids) {
    const p = state.pieces[id];
    if (!p) continue;
    const inTray = state.tray.filter(t => t === id).length;
    if (p.slot && inTray) problems.push(`${id} is both on the board and in the tray`);
    if (!p.slot && inTray !== 1) problems.push(`${id} is neither on the board nor once in the tray`);
    if (p.slot) {
      if (!template.slotById.has(p.slot)) problems.push(`${id} is on unknown slot ${p.slot}`);
      if (seenSlots.has(p.slot)) problems.push(`${id} and ${seenSlots.get(p.slot)} overlap on ${p.slot}`);
      seenSlots.set(p.slot, id);
      if (template.slotById.has(p.slot) && rotationIsUp(p.rotation) !== template.slotById.get(p.slot).up) problems.push(`${id} points the wrong way for ${p.slot}`);
    }
    if (!Number.isInteger(p.rotation) || p.rotation < 0 || p.rotation > 5) problems.push(`${id} has an invalid rotation`);
  }
  for (const piece of puzzle.pieces) {
    const p = state.pieces[piece.id];
    if (piece.locked && p && (!p.locked || p.slot !== piece.home.slot || p.rotation !== piece.home.rotation)) problems.push(`locked piece ${piece.id} moved`);
  }
  return problems;
}
