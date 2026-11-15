import { generateBoard, shuffle } from './board.mjs';
import { INITIAL_STARS } from './stars.mjs';
import { validateAnswer } from './answers.mjs';
import { winningCells } from './winning.mjs';

export function createSoloGame(pool, { size = 3, winningMode = 'line', random = Math.random } = {}) {
  const board = generateBoard(pool, size, random, winningMode);
  const sequence = shuffle(pool.map(item => item.key), random);
  return { size, winningMode, board, sequence, round: 1, currentKey: sequence[0],
    stars: INITIAL_STARS, practice: false, marked: [], wrongCells: [], receipts: [],
    status: 'playing', completion: [], showPinyin: false };
}

export function answerSolo(state, attempt) {
  if (state.marked.includes(state.currentKey)) return { state, outcome: 'locked' };
  const result = validateAnswer(state, attempt);
  if (result.outcome !== 'correct') return result;
  const completion = winningCells(result.state.board, result.state.marked, result.state.size, result.state.winningMode);
  return { ...result, state: { ...result.state, completion,
    status: completion.length ? (result.state.practice ? 'practice-complete' : 'won') : 'playing' } };
}

export function nextSoloWord(state) {
  if (state.status !== 'playing') return state;
  if (state.round === state.sequence.length) return { ...state, status: 'exhausted', currentKey: null };
  return { ...state, round: state.round + 1, currentKey: state.sequence[state.round], wrongCells: [] };
}
