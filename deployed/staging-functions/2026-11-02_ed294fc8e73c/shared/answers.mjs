import { loseStar } from './stars.mjs';
// Pure transition. Caller supplies only the cell/attempt, never correctness.
export function validateAnswer(state, { cellKey, attemptId, round }) {
  if (typeof attemptId !== 'string' || !attemptId || attemptId.length > 120) return { state, outcome: 'invalid' };
  if (state.receipts.includes(attemptId)) return { state, outcome: 'duplicate' };
  if (state.status !== 'playing' || !state.currentKey || round !== state.round) return { state, outcome: 'inactive' };
  if (!state.board.includes(cellKey)) return { state, outcome: 'invalid' };
  if (state.marked.includes(cellKey)) return { state, outcome: 'locked' };
  const next = { ...state, receipts: [...state.receipts, attemptId] };
  if (!state.board.includes(state.currentKey)) return { state: next, outcome: 'absent' };
  if (cellKey === state.currentKey) return { state: { ...next, marked: [...state.marked, cellKey] }, outcome: 'correct' };
  if (state.wrongCells.includes(cellKey)) return { state: next, outcome: 'duplicate' };
  return { state: { ...next, wrongCells: [...state.wrongCells, cellKey], ...loseStar(state.stars) }, outcome: 'incorrect' };
}
