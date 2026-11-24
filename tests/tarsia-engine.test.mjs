import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getTemplate, compileTemplate, TemplateError, generatePuzzle, createPuzzle, availableOptions, VocabularyError,
  rotatePiece, placePiece, removePiece, resetState, stateProblems, checkCompletion, isComplete, edgeStatuses, matchCount,
  labelAt, labelsMatch, edgeDirection, edgeIndexFacing, fitsSlot, cellEdge, cellCentroid, neighbourCell, opposite,
  UP_DIRS, DOWN_DIRS, MODES, LEVELS, wordBank, tarsiaCompletionRecord, createRandom, normaliseSeed,
  successCriteria, geometricFit
} from '../tools/tarsia-puzzle/engine/index.mjs';
import { catalogueFromSets, mergeSets, eligibleEntries, conflictKeys, displayPinyin, englishKeys, itemImage, usableCount } from '../tools/vocabulary-games-core/vocabulary.mjs';
import { buildCompletionRecord, EXPORT_FORMAT } from '../tools/learning-record/record.mjs';
import { createGesture, GESTURE } from '../tools/tarsia-puzzle/gesture.mjs';
import { FIXTURE_SETS } from '../tools/tarsia-puzzle/dev/fixtures.mjs';

const { sets } = catalogueFromSets(FIXTURE_SETS, { allowData: true });
const ALL = mergeSets(sets, ['zz-fixture-countries', 'zz-fixture-more-countries']).entries;
const HEX = getTemplate('hexagon-10'), TRI = getTemplate('triangle-16');
const TEMPLATE_OF = puzzle => getTemplate(puzzle.templateId);
const solvedState = puzzle => ({ pieces: Object.fromEntries(puzzle.pieces.map(p => [p.id, { slot: p.home.slot, rotation: p.home.rotation, locked: p.locked }])), tray: [] });
const gen = (template, modeId, seed, startingPieces = 0, entries = ALL) => generatePuzzle({ entries, template, modeId, seed, startingPieces });
const entry = (id, chinese, pinyin, english, image = '', extra = {}) => ({ key: id, setId: 's', id, chinese, pinyin, english, image, imageStoragePath: '', ...extra });
const blanks = piece => piece.edges.filter(e => e === null).length;
const histogram = list => list.reduce((h, n) => ({ ...h, [n]: (h[n] || 0) + 1 }), {});

// ---------- Templates ----------

test('long hexagon matches TarsiaPuzzle_11words.pdf: 10 pieces, 11 shared edges, 8 blank boundaries', () => {
  assert.equal(HEX.pieceCount, 10);
  assert.equal(HEX.internalEdges.length, 11);
  assert.equal(HEX.requiredPairs, 11);
  assert.equal(HEX.boundaryEdges.length, 8);
  assert.deepEqual(HEX.slots.filter(s => s.row === 0).map(s => s.up), [true, false, true, false, true]);
  assert.deepEqual(HEX.slots.filter(s => s.row === 1).map(s => s.up), [false, true, false, true, false]);
  const puzzle = gen('hexagon-10', 'hanzi-pinyin', 1);
  assert.deepEqual(histogram(puzzle.pieces.map(blanks)), { 0: 2, 1: 8 }, 'same blank-edge distribution as the worksheet');
});

test('triangle matches TarsiaPuzzle_18words_Countries.pdf: 16 pieces, 18 shared edges, 12 blank boundaries', () => {
  assert.equal(TRI.pieceCount, 16);
  assert.equal(TRI.requiredPairs, 18);
  assert.equal(TRI.boundaryEdges.length, 12);
  for (let r = 0; r < 4; r++) {
    const row = TRI.slots.filter(s => s.row === r);
    assert.equal(row.length, 2 * r + 1);
    assert.deepEqual(row.map(s => s.up), row.map((_, i) => i % 2 === 0));
  }
  const puzzle = gen('triangle-16', 'hanzi-pinyin', 1);
  assert.deepEqual(histogram(puzzle.pieces.map(blanks)), { 0: 7, 1: 6, 2: 3 });
  assert.equal(TRI.boundaryEdges.filter(e => e.slot === 'r2c4').length, 0, 'the centre starting slot is fully interior');
});

test('required word count is derived from topology (3 × pieces = 2 × shared + boundary)', () => {
  for (const t of [HEX, TRI]) assert.equal(3 * t.pieceCount, 2 * t.requiredPairs + t.boundaryEdges.length);
});

test('shared edges join ▲ and ▼ cells along identical line segments', () => {
  for (const t of [HEX, TRI]) for (const e of t.internalEdges) {
    const a = t.slotById.get(e.a), b = t.slotById.get(e.b);
    assert.notEqual(a.up, b.up);
    assert.equal(e.bDir, opposite(e.aDir));
    const key = seg => seg.map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).sort().join('|');
    assert.equal(key(cellEdge(a.row, a.col, e.aDir)), key(cellEdge(b.row, b.col, e.bDir)));
    assert.deepEqual(neighbourCell(a.row, a.col, e.aDir), [b.row, b.col]);
  }
});

test('invalid templates are rejected before use', () => {
  const bad = [
    { id: 'empty', cells: [] },
    { id: 'dup', cells: [[0, 0], [0, 0], [0, 1]] },
    { id: 'apart', cells: [[0, 0], [0, 1], [0, 5], [0, 6]] },
    { id: 'lonely', cells: [[0, 0]] },
    { id: 'bad-start', cells: [[0, 0], [0, 1]], startingConfigurations: [{ id: 'x', slots: ['r9c9'] }] },
    { id: 'all-start', cells: [[0, 0], [0, 1]], startingConfigurations: [{ id: 'x', slots: ['r0c0', 'r0c1'] }] },
    { id: 'bad-cell', cells: [[0, 0.5]] }
  ];
  for (const definition of bad) assert.throws(() => compileTemplate(definition), TemplateError, definition.id);
});

test('future templates work without engine changes (regular hexagon, 3-row triangle, rhombus)', () => {
  const futures = [
    { id: 'hexagon-6', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], startingConfigurations: [{ id: 'one', slots: ['r0c1'] }] },
    { id: 'triangle-9', cells: [[0, 2], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4]], startingConfigurations: [{ id: 'one', slots: ['r1c2'] }] },
    { id: 'rhombus-8', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [1, 2], [1, 3], [1, 4]], startingConfigurations: [] }
  ];
  const expected = { 'hexagon-6': 6, 'triangle-9': 9, 'rhombus-8': 7 };
  for (const definition of futures) {
    const t = compileTemplate(definition);
    assert.equal(t.requiredPairs, expected[definition.id], definition.id);
    for (let seed = 0; seed < 50; seed++) {
      const puzzle = generatePuzzle({ entries: ALL, template: definition, modeId: 'hanzi-english', seed, startingPieces: definition.startingConfigurations.length ? 1 : 0 });
      assert.ok(isComplete(puzzle, solvedState(puzzle), t));
    }
  }
});

// ---------- Geometry and rotation ----------

test('six rotation states: odd turns point down, six turns return to the start', () => {
  for (let k = 0; k < 6; k++) {
    const dirs = [0, 1, 2].map(i => edgeDirection(i, k));
    assert.deepEqual([...dirs].sort((a, b) => a - b), k % 2 ? [...DOWN_DIRS] : [0, 1, 2].map(i => UP_DIRS[i]).sort((a, b) => a - b));
    assert.equal(fitsSlot(k, true), k % 2 === 0);
    for (let i = 0; i < 3; i++) {
      assert.equal(edgeDirection(i, k + 1), (edgeDirection(i, k) + 60) % 360, 'each step turns every edge 60° clockwise');
      assert.equal(edgeIndexFacing(k, edgeDirection(i, k)), i);
    }
  }
  for (let i = 0; i < 3; i++) assert.equal(edgeDirection(i, 6), edgeDirection(i, 0));
});

test('tapping a tray piece rotates 60° (six taps return); on the board 120° keeps it in its slot', () => {
  const puzzle = gen('hexagon-10', 'pinyin-english', 4, 2);
  const id = puzzle.initialState.tray[0];
  let state = resetState(puzzle);
  const start = state.pieces[id].rotation;
  for (let tap = 1; tap <= 6; tap++) {
    const result = rotatePiece(state, HEX, id);
    assert.ok(result.ok); assert.equal(result.steps, 1);
    state = result.state;
    assert.equal(state.pieces[id].rotation, (start + tap) % 6);
  }
  assert.equal(state.pieces[id].rotation, start);
  const home = puzzle.pieces.find(p => p.id === id).home;
  state = placePiece(state, HEX, id, home.slot).state;
  const placed = state.pieces[id].rotation;
  for (let tap = 1; tap <= 6; tap++) {
    state = rotatePiece(state, HEX, id).state;
    assert.ok(fitsSlot(state.pieces[id].rotation, HEX.slotById.get(home.slot).up));
    assert.equal(state.pieces[id].slot, home.slot);
  }
  assert.equal(state.pieces[id].rotation, placed);
});

test('edge labels move with rotation: the label facing a direction follows the piece', () => {
  const puzzle = gen('triangle-16', 'hanzi-english', 9);
  const piece = puzzle.pieces.find(p => blanks(p) === 0);
  const slot = TRI.slotById.get(piece.home.slot);
  const state = solvedState(puzzle);
  const before = slot.dirs.map(d => labelAt(puzzle, state, TRI, slot.id, d));
  state.pieces[piece.id].rotation = (piece.home.rotation + 2) % 6; // 120° clockwise
  const after = slot.dirs.map(d => labelAt(puzzle, state, TRI, slot.id, d));
  // what faced d now faces d + 120, i.e. the slot edge one step clockwise
  for (let i = 0; i < 3; i++) assert.equal(after[(i + 1) % 3], before[i]);
  assert.ok(!isComplete(puzzle, state, TRI));
});

// ---------- Generation ----------

test('generated solution is valid: every pair twice (A and B), boundaries blank, labels unique', () => {
  for (const [templateId, t] of [['hexagon-10', HEX], ['triangle-16', TRI]]) for (const modeId of Object.keys(MODES)) {
    const puzzle = gen(templateId, modeId, 123);
    assert.ok(isComplete(puzzle, solvedState(puzzle), t));
    const labels = puzzle.pieces.flatMap(p => p.edges).filter(Boolean);
    assert.equal(labels.length, 2 * t.requiredPairs);
    assert.equal(puzzle.pieces.flatMap(p => p.edges).filter(e => e === null).length, t.boundaryEdges.length);
    const byPair = Map.groupBy(labels, l => l.pair);
    assert.equal(byPair.size, t.requiredPairs);
    for (const pair of byPair.values()) assert.deepEqual(pair.map(l => l.side).sort(), ['A', 'B']);
    for (const side of ['A', 'B']) {
      const shown = labels.filter(l => l.side === side).map(l => l.text ?? l.image);
      assert.equal(new Set(shown).size, shown.length, `${templateId}/${modeId} side ${side} labels are distinct`);
    }
    const mode = MODES[modeId];
    for (const l of labels) assert.equal(l.kind, mode.sides[l.side === 'A' ? 0 : 1]);
  }
});

test('same seed reproduces the puzzle exactly; different seeds differ', () => {
  const a = JSON.stringify(gen('triangle-16', 'hanzi-pinyin', 'class-7B', 1));
  const b = JSON.stringify(gen('triangle-16', 'hanzi-pinyin', 'class-7B', 1));
  assert.equal(a, b);
  assert.equal(normaliseSeed('class-7B'), normaliseSeed('class-7B'));
  const signatures = new Set();
  for (let seed = 0; seed < 200; seed++) signatures.add(JSON.stringify(gen('hexagon-10', 'pinyin-english', seed, 2).pieces));
  assert.ok(signatures.size >= 199, `${signatures.size} distinct puzzles from 200 seeds`);
  const r = createRandom(5), s = createRandom(5);
  assert.deepEqual([r.next(), r.next()], [s.next(), s.next()]);
});

const SWEEP_SEEDS = 2000;
// One test per template × mode, so the results list each of the five modes on both shapes.
for (const [templateId, t, starts] of [['hexagon-10', HEX, 2], ['triangle-16', TRI, 1]]) for (const modeId of Object.keys(MODES)) {
  test(`repeated generation: ${templateId} · ${MODES[modeId].label} · ${SWEEP_SEEDS} seeds`, () => {
    for (let seed = 0; seed < SWEEP_SEEDS; seed++) {
      const puzzle = generatePuzzle({ entries: ALL, template: templateId, modeId, seed, startingPieces: starts });
      const verdict = checkCompletion(puzzle, solvedState(puzzle), t);
      assert.ok(verdict.complete, `${templateId}/${modeId}/${seed}: ${verdict.problems.join('; ')}`);
      assert.deepEqual(stateProblems(puzzle, puzzle.initialState, t), []);
      assert.equal(puzzle.pieces.filter(p => p.locked).length, starts);
      assert.equal(puzzle.initialState.tray.length, t.pieceCount - starts);
      assert.ok(!isComplete(puzzle, puzzle.initialState, t));
      const labels = puzzle.pieces.flatMap(p => p.edges).filter(Boolean);
      for (const side of ['A', 'B']) {
        const keys = labels.filter(l => l.side === side).flatMap(l => conflictKeys({ chinese: l.text, pinyin: l.text, english: l.text, image: l.image, imageStoragePath: '' }, l.kind));
        assert.equal(new Set(keys).size, keys.length, `${templateId}/${modeId}/${seed}: confusable labels on side ${side}`);
      }
    }
  });
}

// ---------- Vocabulary ----------

test('insufficient vocabulary is refused with a clear reason', () => {
  const body = mergeSets(sets, ['zz-fixture-body']).entries;
  assert.throws(() => createPuzzle({ entries: body, levelId: 'beginner', modeId: 'pinyin-english', seed: 1 }),
    err => err instanceof VocabularyError && err.message === 'This puzzle requires 11 different words. Please select more vocabulary sets.' && err.details.usable === 4);
  const countries = mergeSets(sets, ['zz-fixture-countries']).entries;
  assert.throws(() => createPuzzle({ entries: countries, levelId: 'master', modeId: 'hanzi-picture', seed: 1 }),
    err => err.message.startsWith('This puzzle requires 18 different words') &&
      err.details.reasons.some(r => r === '2 words have no picture of their own') &&
      err.details.reasons.some(r => r.includes('looks the same as another word')));
  const options = availableOptions(countries, 'master');
  assert.equal(options.find(o => o.modeId === 'hanzi-picture').shapes[0].available, false);
  assert.equal(options.find(o => o.modeId === 'hanzi-pinyin').shapes[0].available, true);
});

test('merging sets keeps a Chinese word once, even with spacing differences', () => {
  const merged = mergeSets(sets, ['zz-fixture-countries', 'zz-fixture-more-countries']);
  assert.equal(merged.entries.filter(e => e.chinese === '中国').length, 1);
  assert.equal(merged.duplicates, 1);
  const { sets: spaced } = catalogueFromSets([{ id: 'a', items: [{ id: '1', chinese: '苹果' }] }, { id: 'b', items: [{ id: '1', chinese: '苹 果' }] }]);
  assert.equal(mergeSets(spaced, ['a', 'b']).entries.length, 1);
});

test('ambiguous labels never appear together: Hanzi, Pinyin homophones, English senses, identical pictures', () => {
  const img = 'https://firebasestorage.googleapis.com/v0/b/x/o/vocabulary%2Fs%2Fa%2Fimage-1.webp?alt=media&token=';
  const pool = [
    entry('a', '是', 'shì', 'to be', img + '1'),
    entry('b', '十', 'shí', 'ten', img + '2'),                      // same picture file, different token; Pinyin homophone
    entry('c', '澳大利亚', 'ao da li ya', 'Australia'),
    entry('d', '澳洲', 'ao zhou', 'Australia / Oceania'),             // English sense collides
    entry('e', '书', 'shu', 'book', '', { imageStoragePath: 'vocabulary/s/e/image-1.webp' }),
    entry('f', '本', 'ben', 'book (measure word)')                    // "book" again
  ];
  assert.equal(displayPinyin('Shì  Jiè'), 'shi jie');
  assert.deepEqual(englishKeys('To be / Australia (country)'), ['be', 'australia']);
  assert.deepEqual(conflictKeys(pool[0], 'pinyin'), conflictKeys(pool[1], 'pinyin'));
  assert.ok(conflictKeys(pool[0], 'picture').some(k => conflictKeys(pool[1], 'picture').includes(k)), 'same Storage object, different download tokens');
  assert.equal(usableCount(pool, ['pinyin', 'english']), 3); // shi ×2, Australia ×2 and book ×2 each keep one word
  assert.equal(usableCount(pool, ['hanzi', 'pinyin']), 5);
  for (let seed = 0; seed < 200; seed++) {
    const puzzle = generatePuzzle({ entries: ALL, template: 'triangle-16', modeId: 'hanzi-english', seed });
    const keys = puzzle.words.map(w => w.key);
    assert.ok(!(keys.includes('["zz-fixture-countries","australia"]') && keys.includes('["zz-fixture-countries","australia-short"]')), '澳洲 and 澳大利亚 are both "Australia"');
  }
});

test('missing pictures, set-cover pictures and insecure pictures are not usable', () => {
  assert.equal(itemImage({ image: 'http://x.com/a.png' }), '');
  assert.equal(itemImage({ image: 'https://x.com/a.png', imageSource: 'set-cover' }), '');
  assert.equal(itemImage({ image: 'data:image/svg+xml;utf8,<svg/>' }), '', 'data pictures only in the developer prototype');
  const { eligible, excluded } = eligibleEntries(ALL, ['hanzi', 'picture']);
  assert.ok(excluded.every(x => x.reason === 'missing-picture'));
  assert.deepEqual(excluded.map(x => x.entry.chinese).sort(), ['中文', '日文', '法文', '英文'].sort());
  assert.ok(eligible.every(x => x.labels[1].image));
});

test('missing required fields and over-long labels are filtered per mode', () => {
  const pool = [entry('a', '猫', '', 'cat'), entry('b', '狗', 'gou', ''), entry('c', '新南威尔士州首府', 'xi ni', 'Sydney'), entry('d', '鸟', 'niao', 'a very long english label indeed')];
  assert.deepEqual(eligibleEntries(pool, ['pinyin', 'english']).excluded.map(x => x.reason), ['missing-pinyin', 'missing-english', 'too-long']);
  assert.deepEqual(eligibleEntries(pool, ['hanzi', 'pinyin']).excluded.map(x => x.reason), ['missing-pinyin', 'too-long']);
});

test('all five matching modes generate on their level; levels refuse other modes and shapes', () => {
  for (const level of Object.values(LEVELS)) for (const modeId of level.modes) {
    const puzzle = createPuzzle({ entries: ALL, levelId: level.id, modeId, seed: 77 });
    assert.equal(puzzle.pieces.filter(p => p.locked).length, level.startingPieces);
    assert.equal(puzzle.startConfigId, level.defaultStart[puzzle.templateId]);
    assert.ok(isComplete(puzzle, solvedState(puzzle), TEMPLATE_OF(puzzle)));
  }
  assert.throws(() => createPuzzle({ entries: ALL, levelId: 'beginner', modeId: 'hanzi-english', seed: 1 }), /not available at Beginner/);
  assert.throws(() => createPuzzle({ entries: ALL, levelId: 'master', modeId: 'hanzi-pinyin', templateId: 'hexagon-10', seed: 1 }), /shape is not available/);
  assert.equal(Object.keys(MODES).length, 5);
});

// ---------- Placement ----------

test('locked starting pieces cannot be rotated, moved or removed', () => {
  const puzzle = createPuzzle({ entries: ALL, levelId: 'beginner', modeId: 'pinyin-picture', seed: 3 });
  const locked = puzzle.pieces.filter(p => p.locked);
  assert.deepEqual(locked.map(p => p.home.slot).sort(), ['r0c2', 'r1c2']);
  const state = resetState(puzzle);
  for (const p of locked) {
    assert.equal(state.pieces[p.id].slot, p.home.slot);
    assert.equal(rotatePiece(state, HEX, p.id).reason, 'locked');
    assert.equal(placePiece(state, HEX, p.id, 'r0c0').reason, 'locked');
    assert.equal(removePiece(state, HEX, p.id).reason, 'locked');
  }
  const master = createPuzzle({ entries: ALL, levelId: 'master', modeId: 'hanzi-english', seed: 3 });
  assert.deepEqual(master.pieces.filter(p => p.locked).map(p => p.home.slot), ['r2c4']);
  const separated = generatePuzzle({ entries: ALL, template: 'hexagon-10', modeId: 'pinyin-english', seed: 3, startingPieces: 2, startConfigId: 'separated' });
  assert.deepEqual(separated.pieces.filter(p => p.locked).map(p => p.home.slot).sort(), ['r0c1', 'r1c3']);
});

test('invalid placements are refused without changing the state', () => {
  const puzzle = createPuzzle({ entries: ALL, levelId: 'master', modeId: 'hanzi-pinyin', seed: 8 });
  const state = resetState(puzzle);
  const id = state.tray[0];
  const frozen = JSON.stringify(state);
  assert.equal(placePiece(state, TRI, id, 'r9c9').reason, 'unknown-slot');
  assert.equal(placePiece(state, TRI, 'nope', 'r0c4').reason, 'unknown-piece');
  assert.equal(placePiece(state, TRI, id, 'r2c4').reason, 'occupied', 'the locked centre slot is taken');
  assert.equal(JSON.stringify(state), frozen, 'reducers never mutate their input');
});

test('wrong-way drops snap in after one 60° turn (decision D3)', () => {
  const puzzle = createPuzzle({ entries: ALL, levelId: 'master', modeId: 'hanzi-pinyin', seed: 8 });
  let state = resetState(puzzle);
  const id = state.tray[0];
  state.pieces[id].rotation = 1; // pointing down
  const result = placePiece(state, TRI, id, 'r0c4'); // ▲ slot
  assert.ok(result.ok && result.autoRotated);
  assert.equal(result.state.pieces[id].rotation, 2);
  const down = placePiece(result.state, TRI, id, 'r1c4'); // move to a ▼ slot
  assert.ok(down.ok && down.autoRotated && down.state.pieces[id].rotation === 3);
  assert.equal(down.state.pieces[id].slot, 'r1c4');
  assert.deepEqual(stateProblems(puzzle, down.state, TRI), []);
});

test('overlapping or duplicated placements are prevented and detected', () => {
  const puzzle = createPuzzle({ entries: ALL, levelId: 'beginner', modeId: 'pinyin-english', seed: 12 });
  let state = resetState(puzzle);
  const [a, b] = state.tray;
  state = placePiece(state, HEX, a, 'r0c0').state;
  assert.equal(placePiece(state, HEX, b, 'r0c0').reason, 'occupied');
  const moved = placePiece(state, HEX, a, 'r0c4').state;
  assert.equal(Object.values(moved.pieces).filter(p => p.slot === 'r0c0').length, 0, 'a moved piece leaves its old slot');
  const corrupt = JSON.parse(JSON.stringify(state));
  corrupt.pieces[b].slot = 'r0c0'; corrupt.tray = corrupt.tray.filter(x => x !== b);
  assert.ok(stateProblems(puzzle, corrupt, HEX).some(p => p.includes('overlap')));
  const solved = solvedState(puzzle);
  const victim = puzzle.pieces.find(p => p.home.slot === 'r0c4').id;
  solved.pieces[victim].slot = 'r0c0';
  assert.ok(checkCompletion(puzzle, solved, HEX).problems.some(p => p.includes('holds 2 pieces')));
  const removed = removePiece(moved, HEX, a, 0).state;
  assert.equal(removed.tray[0], a);
  assert.equal(removed.pieces[a].slot, null);
});

test('incorrect vocabulary matches are reported, not completed', () => {
  const puzzle = gen('triangle-16', 'hanzi-english', 21);
  const state = solvedState(puzzle);
  const [x, y] = puzzle.pieces.filter(p => blanks(p) === 0 && !TRI.slotById.get(p.home.slot).up).map(p => p.id);
  [state.pieces[x].slot, state.pieces[y].slot] = [state.pieces[y].slot, state.pieces[x].slot];
  const statuses = edgeStatuses(puzzle, state, TRI);
  assert.ok(statuses.some(e => e.status === 'mismatch'));
  assert.ok(!isComplete(puzzle, state, TRI));
  assert.ok(matchCount(puzzle, state, TRI) < 18);
  assert.ok(!labelsMatch({ pair: 'p', side: 'A' }, { pair: 'p', side: 'A' }), 'two Hanzi of the same word are not a match');
  assert.ok(!labelsMatch({ pair: 'p', side: 'A' }, null));
});

// Turning the whole finished board around its centre gives a different arrangement that obeys every rule.
function turnBoard(puzzle, template, steps) {
  const c = template.slots.reduce((acc, s) => ({ x: acc.x + s.centroid.x / template.slots.length, y: acc.y + s.centroid.y / template.slots.length }), { x: 0, y: 0 });
  const angle = steps * Math.PI / 3, cos = Math.cos(angle), sin = Math.sin(angle);
  const state = solvedState(puzzle);
  for (const p of puzzle.pieces) {
    const from = template.slotById.get(p.home.slot).centroid;
    const to = { x: c.x + (from.x - c.x) * cos - (from.y - c.y) * sin, y: c.y + (from.x - c.x) * sin + (from.y - c.y) * cos };
    const target = template.slots.find(s => Math.hypot(s.centroid.x - to.x, s.centroid.y - to.y) < 1e-6);
    assert.ok(target, 'the board is symmetric under this turn');
    state.pieces[p.id] = { slot: target.id, rotation: (p.home.rotation + steps) % 6, locked: false };
  }
  return state;
}

test('alternative valid arrangements are accepted (whole board turned 180° / 120° / 240°)', () => {
  const hex = gen('hexagon-10', 'pinyin-english', 31);
  const hexTurned = turnBoard(hex, HEX, 3);
  assert.ok(hex.pieces.some(p => hexTurned.pieces[p.id].slot !== p.home.slot));
  assert.ok(isComplete(hex, hexTurned, HEX));
  const tri = gen('triangle-16', 'hanzi-picture', 31);
  for (const steps of [2, 4]) assert.ok(isComplete(tri, turnBoard(tri, TRI, steps), TRI), `${steps * 60}°`);
});

test('playing through the reducers completes the puzzle only when the last piece fits', () => {
  for (const levelId of ['beginner', 'master']) {
    const puzzle = createPuzzle({ entries: ALL, levelId, modeId: LEVELS[levelId].modes[0], seed: 99 });
    const t = TEMPLATE_OF(puzzle);
    let state = resetState(puzzle);
    const queue = [...state.tray];
    for (const [i, id] of queue.entries()) {
      const home = puzzle.pieces.find(p => p.id === id).home;
      let taps = 0;
      while (state.pieces[id].rotation !== home.rotation) { state = rotatePiece(state, t, id).state; taps++; }
      assert.ok(taps < 6);
      const result = placePiece(state, t, id, home.slot);
      assert.ok(result.ok && !result.autoRotated);
      state = result.state;
      assert.equal(isComplete(puzzle, state, t), i === queue.length - 1);
      assert.deepEqual(stateProblems(puzzle, state, t), []);
    }
    assert.equal(matchCount(puzzle, state, t), t.requiredPairs);
  }
});

test('reset and replay restore the exact starting state', () => {
  const puzzle = createPuzzle({ entries: ALL, levelId: 'beginner', modeId: 'pinyin-picture', seed: 5 });
  let state = resetState(puzzle);
  state = placePiece(state, HEX, state.tray[0], 'r0c0').state;
  state = rotatePiece(state, HEX, state.tray[0]).state;
  assert.notDeepEqual(state, puzzle.initialState);
  assert.deepEqual(resetState(puzzle), puzzle.initialState);
  const replay = createPuzzle({ entries: ALL, levelId: 'beginner', modeId: 'pinyin-picture', seed: 5 });
  assert.deepEqual(replay, puzzle);
  assert.ok(Object.isFrozen(puzzle) && Object.isFrozen(puzzle.initialState.tray));
});

test('automatic orientation is geometric only: one 60° turn, never chosen from the vocabulary', () => {
  // The rule is a pure function of rotation and slot shape.
  for (let r = 0; r < 6; r++) for (const up of [true, false]) {
    assert.equal(geometricFit(r, up), fitsSlot(r, up) ? r : (r + 1) % 6);
  }
  // placePiece never receives the puzzle (it has no access to labels): its result is identical for two
  // different puzzles with the same template and piece state, even though their labels differ.
  const p1 = gen('triangle-16', 'hanzi-english', 1), p2 = gen('triangle-16', 'hanzi-pinyin', 2);
  assert.equal(placePiece.length, 4, 'placePiece(state, template, pieceId, slot)');
  let checked = 0, wrongButKept = 0;
  for (const puzzle of [p1, p2]) for (const piece of puzzle.pieces.filter(p => blanks(p) === 0)) {
    const home = TRI.slotById.get(piece.home.slot);
    for (let r = 0; r < 6; r++) {
      if (fitsSlot(r, home.up)) continue;
      const state = solvedState(puzzle);
      state.pieces[piece.id] = { slot: null, rotation: r, locked: false }; state.tray = [piece.id];
      const result = placePiece(state, TRI, piece.id, home.id);
      assert.ok(result.ok && result.autoRotated);
      assert.equal(result.state.pieces[piece.id].rotation, (r + 1) % 6);
      checked++;
      // When +60° is not the solving orientation, the engine still does not "help": the puzzle stays unsolved.
      if ((r + 1) % 6 !== piece.home.rotation) { assert.ok(!isComplete(puzzle, result.state, TRI)); wrongButKept++; }
    }
  }
  assert.ok(checked > 0 && wrongButKept > 0);
});

test('tap and drag are told apart reliably (touch allowance, long press, wobble, cancel)', () => {
  const press = (pointerType = 'touch') => createGesture({ pointerType, x: 100, y: 100, time: 0 });
  let g = press(); g.move(105, 104); assert.equal(g.end(200), 'tap', 'a small finger wobble is still a tap');
  g = press(); g.move(100 + GESTURE.tapSlop.touch + 1, 100); assert.equal(g.end(150), 'drag');
  g = press('mouse'); g.move(108, 100); assert.equal(g.end(100), 'drag', 'a mouse has a tighter allowance');
  g = press(); g.move(140, 100); g.move(100, 100); assert.equal(g.end(200), 'drag', 'moving away and back is a drag, not a tap');
  g = press(); assert.equal(g.end(GESTURE.tapMaxMs + 1), 'none', 'a long press does not rotate');
  g = press(); g.move(103, 100); assert.equal(g.cancel(), 'none'); assert.equal(g.end(10), 'none', 'cancelled (second finger) does nothing');
  g = press('pen'); assert.equal(g.end(50), 'tap');
  g = press(); assert.equal(g.end(0), 'tap'); assert.equal(g.end(10), 'none', 'one press never produces two actions');
});

// ---------- Word Bank and Evidence of Learning ----------

test('Word Bank lists the puzzle words with every field, in Pinyin order', () => {
  const puzzle = createPuzzle({ entries: ALL, levelId: 'master', modeId: 'hanzi-english', seed: 2 });
  const bank = wordBank(puzzle);
  assert.equal(bank.length, 18);
  assert.deepEqual(bank.map(w => w.pinyin), [...bank.map(w => w.pinyin)].sort((a, b) => a.localeCompare(b, 'en')));
  assert.ok(bank.every(w => w.hanzi && w.pinyin && w.english && 'image' in w));
});

test('completion record: only after completion, derived intention, optional local student details', () => {
  const puzzle = createPuzzle({ entries: ALL, levelId: 'beginner', modeId: 'pinyin-english', seed: 6 });
  const vocabularySets = [{ id: 'zz-fixture-countries', title: 'Countries', chineseTitle: '国家' }];
  assert.throws(() => tarsiaCompletionRecord(puzzle, resetState(puzzle), { vocabularySets }), /completed puzzle/);
  const record = tarsiaCompletionRecord(puzzle, solvedState(puzzle), { vocabularySets, student: { firstName: '  Mia ', className: '' }, completedAt: new Date(2026, 10, 24, 15) });
  assert.equal(record.completedAt, '2026-11-24');
  assert.deepEqual(record.student, { firstName: 'Mia' });
  assert.equal(record.matchesCompleted, 11);
  assert.equal(record.learningIntention, MODES['pinyin-english'].learningIntention);
  assert.deepEqual(record.difficulty, { id: 'beginner', label: 'Beginner' });
  assert.equal(record.completionStatus, 'completed');
  assert.equal(record.content.slots.length, 10);
  assert.equal(record.content.slots.flatMap(s => s.edges).filter(e => !e.blank).length, 22);
  const anonymous = tarsiaCompletionRecord(puzzle, solvedState(puzzle), { vocabularySets });
  assert.deepEqual(anonymous.student, {});
  assert.deepEqual([EXPORT_FORMAT.width, EXPORT_FORMAT.height], [1748, 1240]);
  assert.throws(() => buildCompletionRecord({ activity: {} }), /needs/);
});

test('learning intentions use the approved student-facing wording', () => {
  assert.deepEqual(Object.fromEntries(Object.values(MODES).map(m => [m.id, m.learningIntention])), {
    'pinyin-picture': 'I can read Pinyin and match Chinese words to pictures.',
    'pinyin-english': 'I can read Pinyin and match Chinese words to their English meanings.',
    'hanzi-english': 'I can recognise Chinese characters and match them to their English meanings.',
    'hanzi-pinyin': 'I can recognise Chinese characters and match them to their Pinyin.',
    'hanzi-picture': 'I can recognise Chinese characters and match them to pictures.'
  });
});

test('success criteria take N from the selected template', () => {
  assert.equal(successCriteria(HEX.requiredPairs), 'I can complete a Tarsia puzzle by correctly matching all 11 vocabulary pairs.');
  assert.equal(successCriteria(TRI.requiredPairs), 'I can complete a Tarsia puzzle by correctly matching all 18 vocabulary pairs.');
  const future = compileTemplate({ id: 'hexagon-6', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] });
  assert.equal(successCriteria(future.requiredPairs), 'I can complete a Tarsia puzzle by correctly matching all 6 vocabulary pairs.');
  assert.throws(() => successCriteria(0));
  for (const [levelId, n] of [['beginner', 11], ['master', 18]]) {
    const puzzle = createPuzzle({ entries: ALL, levelId, modeId: LEVELS[levelId].modes[0], seed: 1 });
    const record = tarsiaCompletionRecord(puzzle, solvedState(puzzle), { vocabularySets: [] });
    assert.equal(record.successCriteria, `I can complete a Tarsia puzzle by correctly matching all ${n} vocabulary pairs.`);
    assert.equal(record.matchesCompleted, n);
    assert.match(record.statement, /completed successfully/);
    assert.match(record.statement, /does not measure independent vocabulary mastery/);
    assert.doesNotMatch(JSON.stringify(record), /\bmaster(ed|y of)\b/i, 'no claim of mastery');
  }
  assert.throws(() => buildCompletionRecord({ activity: {}, completedAt: new Date(), vocabularySets: [], difficulty: {}, matchingMode: {},
    learningIntention: 'x', content: {}, matchesCompleted: 1 }), /successCriteria/);
});

// ---------- Integration boundaries ----------

test('the vendored data layer is byte-identical to Listening Core and Bingo Solo', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const files = dir => fs.readdirSync(dir, { recursive: true }).filter(f => fs.statSync(path.join(dir, f)).isFile()).sort();
  const ours = path.join(root, 'tools/vocabulary-games-core/shared');
  for (const other of ['tools/listening-core/shared', 'tools/bingo-board/shared']) {
    const theirs = path.join(root, other);
    assert.deepEqual(files(ours), files(theirs));
    for (const f of files(ours)) assert.ok(fs.readFileSync(path.join(ours, f)).equals(fs.readFileSync(path.join(theirs, f))), `${other}/${f}`);
  }
});

test('engine and core modules contain no DOM, network or storage calls', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const dirs = ['tools/tarsia-puzzle/engine', 'tools/learning-record'];
  const files = [...dirs.flatMap(d => fs.readdirSync(path.join(root, d)).map(f => path.join(root, d, f))), path.join(root, 'tools/vocabulary-games-core/vocabulary.mjs')];
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(document|window|fetch|localStorage|sessionStorage|XMLHttpRequest|firebase)\b/i, path.basename(file));
  }
});
