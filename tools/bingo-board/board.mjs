import { ambiguousEntries } from './vocabulary.mjs';
export const BOARD_SIZES = Object.freeze([3, 4, 5]);

export function validateConfiguration(pool, size, winningMode = 'line') {
  if (!BOARD_SIZES.includes(size)) throw new Error('Choose a 3×3, 4×4 or 5×5 board.');
  if (!['line', 'full-house'].includes(winningMode)) throw new Error('Choose Line Bingo or Full House.');
  if (!Array.isArray(pool) || pool.some(item => !item?.key || !item.chinese)) throw new Error('Vocabulary entries need source identities and Chinese characters.');
  if (new Set(pool.map(item => item.key)).size !== pool.length) throw new Error('Remove repeated source entries.');
  if (pool.length < size * size) throw new Error(`This ${size}×${size} board needs ${size * size} words. You have ${pool.length}; choose ${size * size - pool.length} more.`);
  if (ambiguousEntries(pool).length) throw new Error('Resolve identical Chinese entries by deselecting all but one source entry for each visible word.');
  if (winningMode === 'full-house' && pool.length <= size * size) throw new Error('Full House needs more words than board cells.');
}

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const value = random();
    if (!(value >= 0 && value < 1)) throw new Error('Random values must be between 0 and 1 (exclusive).');
    const j = Math.floor(value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateBoard(pool, size, random = Math.random, winningMode = 'line') {
  validateConfiguration(pool, size, winningMode);
  return shuffle(pool, random).slice(0, size * size).map(item => item.key);
}
