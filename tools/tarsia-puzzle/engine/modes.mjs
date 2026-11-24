// Matching modes and difficulty levels. Representation A is drawn with its baseline towards the shared edge,
// B with its top towards it, so a finished pair reads the same way up (as on the classroom worksheets).
import { TEMPLATES } from './templates.mjs';

export const MODES = Object.freeze({
  'pinyin-picture': { id: 'pinyin-picture', label: 'Pinyin + Picture', sides: ['pinyin', 'picture'],
    learningIntention: 'I can read Pinyin and match Chinese words to pictures.' },
  'pinyin-english': { id: 'pinyin-english', label: 'Pinyin + English', sides: ['pinyin', 'english'],
    learningIntention: 'I can read Pinyin and match Chinese words to their English meanings.' },
  'hanzi-english': { id: 'hanzi-english', label: 'Hanzi + English', sides: ['hanzi', 'english'],
    learningIntention: 'I can recognise Chinese characters and match them to their English meanings.' },
  'hanzi-pinyin': { id: 'hanzi-pinyin', label: 'Hanzi + Pinyin', sides: ['hanzi', 'pinyin'],
    learningIntention: 'I can recognise Chinese characters and match them to their Pinyin.' },
  'hanzi-picture': { id: 'hanzi-picture', label: 'Hanzi + Picture', sides: ['hanzi', 'picture'],
    learningIntention: 'I can recognise Chinese characters and match them to pictures.' }
});

// Difficulty is not tied to year levels. Each level lists the templates it may use; the setup screen offers only
// those whose derived word count the selected vocabulary can fill.
export const LEVELS = Object.freeze({
  beginner: { id: 'beginner', label: 'Beginner', startingPieces: 2, modes: ['pinyin-picture', 'pinyin-english'],
    templates: ['hexagon-10'], defaultStart: { 'hexagon-10': 'centre-pair' } },
  master: { id: 'master', label: 'Master', startingPieces: 1, modes: ['hanzi-english', 'hanzi-pinyin', 'hanzi-picture'],
    templates: ['triangle-16'], defaultStart: { 'triangle-16': 'centre' } }
});

export function getMode(id) { const mode = MODES[id]; if (!mode) throw new Error(`Unknown matching mode: ${id}`); return mode; }
export function getLevel(id) { const level = LEVELS[id]; if (!level) throw new Error(`Unknown level: ${id}`); return level; }
export const learningIntention = modeId => getMode(modeId).learningIntention;
// Success criteria: N comes from the selected template's shared edges, never a fixed number.
export const successCriteria = requiredPairs => {
  if (!Number.isInteger(requiredPairs) || requiredPairs < 1) throw new Error('Success criteria need a positive word count.');
  return `I can complete a Tarsia puzzle by correctly matching all ${requiredPairs} vocabulary pairs.`;
};

// Sanity: every level names real templates and modes.
for (const level of Object.values(LEVELS)) {
  for (const id of level.templates) if (!TEMPLATES.some(t => t.id === id)) throw new Error(`Level ${level.id} names unknown template ${id}`);
  for (const id of level.modes) getMode(id);
}
