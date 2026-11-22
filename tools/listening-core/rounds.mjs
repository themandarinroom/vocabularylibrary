// Listening Core: pure listening-question rules (no DOM, audio or network).
// Reusable by any "hear a word, choose the answer" game.

export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', chinese: '容易', choices: 2 }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', chinese: '中等', choices: 3 }),
  challenge: Object.freeze({ id: 'challenge', label: 'Challenge', chinese: '挑战', choices: 4 })
});
export const LEVEL_ORDER = Object.freeze(['easy', 'medium', 'challenge']);
export const MIN_POOL = LEVELS.easy.choices;

export function shuffle(values, random = Math.random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Which levels a word pool can support: a level needs as many different words as answer choices.
export function levelAvailability(poolSize) {
  return Object.fromEntries(LEVEL_ORDER.map(id => [id, poolSize >= LEVELS[id].choices]));
}
// The requested level if the pool supports it, otherwise the hardest supported one (or null).
export function supportedLevel(poolSize, requested) {
  const available = levelAvailability(poolSize);
  if (available[requested]) return requested;
  return [...LEVEL_ORDER].reverse().find(id => available[id]) || null;
}

// Target words come from a shuffled "bag": every word is asked once before any repeats, and a
// new bag never starts with the word that was just asked.
export function createTargetPicker(keys, random = Math.random) {
  if (!Array.isArray(keys) || keys.length < MIN_POOL) throw new Error(`A listening game needs at least ${MIN_POOL} different words.`);
  let bag = [], last = null, upcoming = null;
  const draw = () => {
    if (!bag.length) {
      bag = shuffle(keys, random);
      if (bag[0] === last) { const j = 1 + Math.floor(random() * (bag.length - 1)); [bag[0], bag[j]] = [bag[j], bag[0]]; }
    }
    return bag.shift();
  };
  return {
    // The next target without consuming it, so its audio can be prepared in advance.
    peek() { if (upcoming === null) upcoming = draw(); return upcoming; },
    next() { const key = this.peek(); upcoming = null; last = key; return key; }
  };
}

// One question: the target plus (choices - 1) different distractors from the same pool, in random order.
// Pictures are used only when every option has its own, different picture; otherwise all options show
// Chinese characters, so the answers are never a confusing mix.
export function buildQuestion({ pool, targetKey, choices, random = Math.random, brokenImages = new Set() }) {
  const byKey = new Map(pool.map(item => [item.key, item]));
  if (!byKey.has(targetKey)) throw new Error('The target word is not in this set.');
  if (!Number.isInteger(choices) || choices < MIN_POOL) throw new Error('Unknown number of answer choices.');
  if (pool.length < choices) throw new Error(`This level needs ${choices} different words.`);
  // When the target has a picture, prefer distractors that have their own different pictures, so the
  // question can be asked with pictures even if a few words in the set have none.
  const target = byKey.get(targetKey), hasPicture = item => Boolean(item.image) && !brokenImages.has(item.key);
  const others = pool.filter(item => item.key !== targetKey);
  const pictured = hasPicture(target) ? others.filter(item => hasPicture(item) && item.image !== target.image) : [];
  const uniquePictured = pictured.filter((item, index) => pictured.findIndex(other => other.image === item.image) === index);
  const candidates = uniquePictured.length >= choices - 1 ? uniquePictured : others;
  const distractors = shuffle(candidates, random).slice(0, choices - 1);
  const options = shuffle([byKey.get(targetKey), ...distractors], random).map(item => item.key);
  return Object.freeze({ targetKey, options: Object.freeze(options), mode: answerMode(options.map(key => byKey.get(key)), brokenImages), wrong: Object.freeze([]) });
}

export function answerMode(items, brokenImages = new Set()) {
  const urls = items.map(item => (item.image && !brokenImages.has(item.key)) ? item.image : '');
  return urls.every(Boolean) && new Set(urls).size === urls.length ? 'picture' : 'hanzi';
}

// Pure answer check. A wrong choice is remembered (shown as "not this one") but costs nothing.
export function answerQuestion(question, key) {
  if (!question || !question.options.includes(key)) return { question, outcome: 'invalid' };
  if (key === question.targetKey) return { question, outcome: 'correct' };
  if (question.wrong.includes(key)) return { question, outcome: 'repeat' };
  return { question: Object.freeze({ ...question, wrong: Object.freeze([...question.wrong, key]) }), outcome: 'incorrect' };
}
