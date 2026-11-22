// Build the Great Wall: game flow (no DOM, audio or network).
// question → (correct) → place → (stone placed) → question … → complete after 10 stones.
import { LEVELS, createTargetPicker, buildQuestion, answerQuestion } from '../listening-core/rounds.mjs';
import { TARGET_BRICKS, legalSlots, placeStone, isComplete } from './wall.mjs';

export function createWallGame({ pool, level, random = Math.random, brokenImages = new Set() }) {
  const choices = LEVELS[level]?.choices;
  if (!choices) throw new Error('Choose a difficulty level.');
  if (pool.length < choices) throw new Error(`${LEVELS[level].label} needs at least ${choices} different words.`);
  const picker = createTargetPicker(pool.map(item => item.key), random);
  let state = Object.freeze({ phase: 'question', level, placed: Object.freeze([]), correct: 0, attempts: 0,
    round: 1, question: buildQuestion({ pool, targetKey: picker.next(), choices, random, brokenImages }) });
  const next = patch => (state = Object.freeze({ ...state, ...patch }));
  return {
    get state() { return state; },
    upcomingKey: () => picker.peek(),
    answer(key) {
      if (state.phase !== 'question') return 'inactive';
      const result = answerQuestion(state.question, key);
      if (result.outcome === 'invalid' || result.outcome === 'repeat') return result.outcome;
      if (result.outcome === 'correct') next({ phase: 'place', correct: state.correct + 1, attempts: state.attempts + 1 });
      else next({ question: result.question, attempts: state.attempts + 1 });
      return result.outcome;
    },
    legalSlots: () => state.phase === 'place' ? legalSlots(state.placed) : [],
    place(slotId) {
      if (state.phase !== 'place') return 'inactive';
      let placed;
      try { placed = placeStone(state.placed, slotId); } catch { return 'illegal'; }
      if (isComplete(placed)) { next({ phase: 'complete', placed, question: null }); return 'complete'; }
      next({ phase: 'question', placed, round: state.round + 1,
        question: buildQuestion({ pool, targetKey: picker.next(), choices, random, brokenImages }) });
      return 'placed';
    },
    // A picture failed to load: show this question's options as Chinese characters instead.
    refreshMode() {
      if (state.phase === 'question') next({ question: Object.freeze({ ...state.question, mode: 'hanzi' }) });
    }
  };
}
export { TARGET_BRICKS };
