import { BOARD_SIZES } from './board.mjs';
export function winningCells(board, markedKeys, size, mode = 'line') {
  if (!BOARD_SIZES.includes(size) || board.length !== size * size || new Set(board).size !== board.length) throw new Error('Invalid board.');
  if (!['line', 'full-house'].includes(mode)) throw new Error('Unknown winning mode.');
  const marked = new Set(markedKeys);
  const indices = board.map((_, index) => index);
  if (mode === 'full-house') return board.every(key => marked.has(key)) ? indices : [];
  const lines = [];
  for (let row = 0; row < size; row++) lines.push(Array.from({ length: size }, (_, col) => row * size + col));
  for (let col = 0; col < size; col++) lines.push(Array.from({ length: size }, (_, row) => row * size + col));
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + size - 1 - i));
  return [...new Set(lines.filter(line => line.every(index => marked.has(board[index]))).flat())];
}
