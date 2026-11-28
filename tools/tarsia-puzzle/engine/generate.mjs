// Seeded puzzle generation: build and validate the solved puzzle first, then derive the playable start.
import { createRandom, normaliseSeed } from './random.mjs';
import { compileTemplate, getTemplate, STUDENT_TEMPLATES } from './templates.mjs';
import { getMode, getLevel, MODES } from './modes.mjs';
import { UP_DIRS, edgeDirection, norm } from './geometry.mjs';
import { checkCompletion } from './validate.mjs';
import { stateProblems } from './state.mjs';
import { eligibleEntries, selectUnambiguous, usableCount, exclusionSummary, LABEL_LIMITS, displayHanzi, displayPinyin, displayEnglish } from '../../vocabulary-games-core/vocabulary.mjs';

export const SCHEMA_VERSION = 1;

export class VocabularyError extends Error {
  constructor(message, details) { super(message); this.name = 'VocabularyError'; this.details = details; }
}

const resolveTemplate = template => typeof template === 'string' ? getTemplate(template) : template?.slotById ? template : compileTemplate(template);

// Choose `count` words that can all be shown in this mode without two labels being confusable.
export function chooseWords(entries, kinds, count, random, limits = LABEL_LIMITS) {
  const { eligible, excluded } = eligibleEntries(entries, kinds, limits);
  let best = { chosen: [], ambiguous: 0 };
  for (let attempt = 0; attempt < 20 && best.chosen.length < count; attempt++) {
    const result = selectUnambiguous(eligible, kinds, count, random.shuffle);
    if (result.chosen.length > best.chosen.length) best = result;
  }
  // A random order can block more words than necessary; pool order reaches what the setup screen promised.
  if (best.chosen.length < count) {
    const ordered = selectUnambiguous(eligible, kinds, count, list => list);
    if (ordered.chosen.length === count) best = { chosen: random.shuffle(ordered.chosen), ambiguous: ordered.ambiguous };
  }
  if (best.chosen.length < count) {
    const usable = usableCount(entries, kinds, limits);
    const reasons = exclusionSummary(excluded);
    const skipped = eligible.length - usable;
    if (skipped > 0) reasons.push(`${skipped} ${skipped === 1 ? 'word looks' : 'words look'} the same as another word in this mode`);
    throw new VocabularyError(`This puzzle requires ${count} different words. Please select more vocabulary sets.`,
      { required: count, available: entries.length, eligible: eligible.length, usable, reasons });
  }
  return best.chosen;
}

// options: { entries, template (id | definition | compiled), modeId, seed, startingPieces, startConfigId?, limits? }
export function generatePuzzle(options) {
  const template = resolveTemplate(options.template);
  const mode = getMode(options.modeId);
  const seed = normaliseSeed(options.seed);
  const random = createRandom(seed);
  const startingPieces = options.startingPieces ?? 0;

  // Starting configuration (validated with the template).
  let startConfig = null;
  if (startingPieces > 0) {
    const candidates = template.startingConfigurations.filter(c => c.slots.length === startingPieces);
    startConfig = options.startConfigId ? candidates.find(c => c.id === options.startConfigId) : random.pick(candidates);
    if (!startConfig) throw new Error(`Template ${template.id} has no ${startingPieces}-piece starting configuration${options.startConfigId ? ` called ${options.startConfigId}` : ''}.`);
  }

  // 2–3. Validate the pool and select the words.
  const chosen = chooseWords(options.entries || [], mode.sides, template.requiredPairs, random, options.limits);

  // 4–6. Words onto shared edges. Boundaries stay blank.
  // D1 (owner request): both labels of a pair are printed at the same angle (A: dir−180°, B: dir), so choosing which
  // piece carries side A fixes how the pair reads in the FINISHED puzzle. We choose the way that reads the right way
  // up: across a horizontal edge both labels are upright; across a sloping edge they lean ±60°, never upside down.
  // Labels still turn rigidly with their piece while it is being played (printed rule unchanged).
  const labelsBySlot = new Map(template.slots.map(s => [s.id, new Map(s.dirs.map(d => [d, null]))]));
  const order = random.shuffle(chosen);
  const readsUpright = deg => { const a = ((deg % 360) + 360) % 360; return a < 90 || a > 270; };
  template.internalEdges.forEach((edge, i) => {
    const { entry, labels } = order[i];
    random.coin(); // was the side coin flip; still drawn so every seed keeps the same words, pieces and rotations
    const flip = !readsUpright(edge.aDir - 180); // slot a carries side A only if A reads upright there
    const sideA = Object.freeze({ pair: entry.key, side: 'A', ...labels[0] });
    const sideB = Object.freeze({ pair: entry.key, side: 'B', ...labels[1] });
    labelsBySlot.get(edge.a).set(edge.aDir, flip ? sideB : sideA);
    labelsBySlot.get(edge.b).set(edge.bDir, flip ? sideA : sideB);
  });

  // 7. Pieces in the canonical frame: at its home rotation edge i faces the slot edge it was built for.
  // Home rotation is any of the three that point the right way, so the stored edge order reveals nothing.
  const startSlots = new Set(startConfig?.slots || []);
  const ids = random.shuffle(template.slots.map((_, i) => `p${String(i + 1).padStart(2, '0')}`));
  const pieces = template.slots.map((slot, i) => {
    const rotation = norm((slot.up ? 0 : 1) + 2 * random.int(3));
    const edges = UP_DIRS.map((_, e) => labelsBySlot.get(slot.id).get(edgeDirection(e, rotation)));
    return Object.freeze({ id: ids[i], edges: Object.freeze(edges), home: Object.freeze({ slot: slot.id, rotation }), locked: startSlots.has(slot.id) });
  }).sort((a, b) => a.id.localeCompare(b.id));

  const words = chosen.map(({ entry }) => Object.freeze({ key: entry.key, setId: entry.setId, hanzi: displayHanzi(entry.chinese),
    pinyin: displayPinyin(entry.pinyin), english: displayEnglish(entry.english), image: entry.image || '' }));

  const puzzle = {
    schemaVersion: SCHEMA_VERSION, seed, templateId: template.id, modeId: mode.id,
    levelId: options.levelId ?? null, startConfigId: startConfig?.id ?? null,
    requiredPairs: template.requiredPairs, words: Object.freeze(words), pieces: Object.freeze(pieces)
  };

  // 8. The solved arrangement must satisfy every rule before anything is shuffled.
  const solved = { pieces: Object.fromEntries(pieces.map(p => [p.id, { slot: p.home.slot, rotation: p.home.rotation, locked: p.locked }])), tray: [] };
  const verdict = checkCompletion(puzzle, solved, template);
  if (!verdict.complete) throw new Error(`Engine error: generated solution is invalid (${verdict.problems.join('; ')}).`);

  // 9–11. Locked starting pieces stay home; everything else goes to the tray in random order and rotation.
  const loose = random.shuffle(pieces.filter(p => !p.locked));
  const initialState = {
    pieces: Object.fromEntries(pieces.map(p => [p.id, p.locked
      ? { slot: p.home.slot, rotation: p.home.rotation, locked: true }
      : { slot: null, rotation: random.int(6), locked: false }])),
    tray: loose.map(p => p.id)
  };
  puzzle.initialState = initialState;
  const problems = stateProblems(puzzle, initialState, template);
  if (problems.length) throw new Error(`Engine error: invalid start state (${problems.join('; ')}).`);
  return deepFreezeDefinition(puzzle);
}

// The puzzle definition is immutable; states are separate plain objects.
function deepFreezeDefinition(puzzle) {
  const initial = puzzle.initialState;
  Object.freeze(initial.tray); Object.values(initial.pieces).forEach(Object.freeze); Object.freeze(initial.pieces); Object.freeze(initial);
  return Object.freeze(puzzle);
}

// Level-aware entry point used by the game: refuses combinations the level does not offer.
export function createPuzzle({ entries, levelId, modeId, templateId, seed, startConfigId, limits }) {
  const level = getLevel(levelId);
  if (!level.modes.includes(modeId)) throw new Error(`${getMode(modeId).label} is not available at ${level.label} level.`);
  const id = templateId || level.templates[0];
  if (!level.templates.includes(id)) throw new Error(`That puzzle shape is not available at ${level.label} level.`);
  return generatePuzzle({ entries, template: id, modeId, seed, levelId, limits,
    startingPieces: level.startingPieces, startConfigId: startConfigId || level.defaultStart[id] });
}

// What the setup screen may offer for a word pool: per mode, each shape with availability and a reason.
export function availableOptions(entries, levelId, limits = LABEL_LIMITS) {
  const level = getLevel(levelId);
  return level.modes.map(modeId => {
    const mode = getMode(modeId);
    const usable = usableCount(entries, mode.sides, limits);
    return { modeId, label: mode.label, usable, shapes: level.templates.map(templateId => {
      const template = getTemplate(templateId);
      const available = usable >= template.requiredPairs;
      return { templateId, name: template.name, pieceCount: template.pieceCount, requiredPairs: template.requiredPairs, available,
        reason: available ? '' : `This puzzle requires ${template.requiredPairs} different words. Please select more vocabulary sets.` };
    }) };
  });
}

// v0.1 student entry point: any offered shape with any matching mode (shape = spatial challenge, mode = language
// challenge). The shape's approved starting pieces are used; nothing else depends on a level.
export function createStudentPuzzle({ entries, templateId, modeId, seed, limits }) {
  const offer = STUDENT_TEMPLATES.find(t => t.id === templateId);
  if (!offer) throw new Error('That puzzle shape is not available.');
  getMode(modeId);
  const template = getTemplate(templateId);
  const start = offer.start ? template.startingConfigurations.find(c => c.id === offer.start) : null;
  return generatePuzzle({ entries, template: templateId, modeId, seed, limits,
    startingPieces: start ? start.slots.length : 0, startConfigId: start?.id });
}

// Every offered shape × every mode for a word pool: usable words, availability and the reason when unavailable.
export function studentOptions(entries, limits = LABEL_LIMITS) {
  const usable = Object.fromEntries(Object.values(MODES).map(m => [m.id, usableCount(entries, m.sides, limits)]));
  return STUDENT_TEMPLATES.map(({ id }) => {
    const t = getTemplate(id);
    return { templateId: id, name: t.name, pieceCount: t.pieceCount, requiredPairs: t.requiredPairs,
      modes: Object.values(MODES).map(m => ({ modeId: m.id, label: m.label, usable: usable[m.id], available: usable[m.id] >= t.requiredPairs })) };
  });
}
