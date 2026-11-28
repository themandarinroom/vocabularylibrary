// Revised v0.1 (B3.2): student shapes, shape-based generation, rigid (printed) label rotation, measured layout of
// the longest real labels, and the workspace rules (progress, shuffle, Tap-to-place).
import test from 'node:test';
import assert from 'node:assert/strict';
import { getTemplate, STUDENT_TEMPLATES, MAX_STUDENT_PAIRS, MODES, createStudentPuzzle, studentOptions, generatePuzzle, checkCompletion,
  edgeDirection, fitsSlot, placePiece, rotatePiece, resetState, stateProblems, isComplete, tarsiaCompletionRecord, UP_DIRS } from '../tools/tarsia-puzzle/engine/index.mjs';
import { layoutPiece, placeLabel, estimateWidth, LAYOUT, lineOptions } from '../tools/tarsia-puzzle/label-layout.mjs';
import { progressOf, shuffleTray, tapPiece, tapSlot, puzzleInfo, hasProgress } from '../tools/tarsia-puzzle/workspace-model.mjs';
import { catalogueFromSets, mergeSets } from '../tools/vocabulary-games-core/vocabulary.mjs';
import { FIXTURE_SETS } from '../tools/tarsia-puzzle/dev/fixtures.mjs';

const { sets } = catalogueFromSets(FIXTURE_SETS, { allowData: true });
const ALL = mergeSets(sets, ['zz-fixture-countries', 'zz-fixture-more-countries']).entries;
const solved = p => ({ pieces: Object.fromEntries(p.pieces.map(x => [x.id, { slot: x.home.slot, rotation: x.home.rotation, locked: x.locked }])), tray: [] });

// ---------- Shapes ----------
test('four student shapes with derived counts; the 18-pair template is kept but not offered', () => {
  const expected = { 'small-triangle-4': [4, 3, 6], 'hexagon-6': [6, 6, 6], 'triangle-9': [9, 9, 9], 'hexagon-10': [10, 11, 8] };
  assert.deepEqual(STUDENT_TEMPLATES.map(t => t.id), Object.keys(expected));
  for (const [id, [pieces, pairs, boundary]] of Object.entries(expected)) {
    const t = getTemplate(id);
    assert.deepEqual([t.pieceCount, t.requiredPairs, t.boundaryEdges.length], [pieces, pairs, boundary], id);
    assert.equal(3 * t.pieceCount, 2 * t.requiredPairs + t.boundaryEdges.length);
    assert.ok(t.requiredPairs <= MAX_STUDENT_PAIRS);
  }
  assert.equal(getTemplate('triangle-16').requiredPairs, 18);
  assert.ok(!STUDENT_TEMPLATES.some(t => t.id === 'triangle-16'));
  assert.deepEqual(getTemplate('small-triangle-4').slots.map(s => s.up), [true, true, false, true]);
  assert.deepEqual(getTemplate('triangle-9').slots.filter(s => s.row === 2).map(s => s.up), [true, false, true, false, true]);
});

test('approved locked starting pieces: none / 1 / 1 / 2', () => {
  const expected = { 'small-triangle-4': [], 'hexagon-6': ['r0c1'], 'triangle-9': ['r1c4'], 'hexagon-10': ['r0c2', 'r1c2'] };
  for (const [templateId, slots] of Object.entries(expected)) {
    const p = createStudentPuzzle({ entries: ALL, templateId, modeId: 'hanzi-english', seed: 1 });
    assert.deepEqual(p.pieces.filter(x => x.locked).map(x => x.home.slot).sort(), slots, templateId);
    assert.equal(p.initialState.tray.length, getTemplate(templateId).pieceCount - slots.length);
  }
  assert.throws(() => createStudentPuzzle({ entries: ALL, templateId: 'triangle-16', modeId: 'hanzi-english', seed: 1 }), /not available/);
});

const SEEDS = 2000;
for (const { id } of STUDENT_TEMPLATES) for (const mode of Object.values(MODES)) {
  test(`any shape with any mode: ${id} · ${mode.label} · ${SEEDS} seeds`, () => {
    const t = getTemplate(id);
    for (let seed = 0; seed < SEEDS; seed++) {
      const p = createStudentPuzzle({ entries: ALL, templateId: id, modeId: mode.id, seed });
      assert.ok(checkCompletion(p, solved(p), t).complete, `${id}/${mode.id}/${seed}`);
      assert.deepEqual(stateProblems(p, p.initialState, t), []);
      assert.ok(!isComplete(p, p.initialState, t));
    }
  });
}

test('studentOptions: availability per shape and mode from one word pool (single set)', () => {
  const single = mergeSets(sets, ['zz-fixture-more-countries']).entries; // 7 words, 4 with pictures
  const opt = studentOptions(single);
  const avail = (t, m) => opt.find(o => o.templateId === t).modes.find(x => x.modeId === m).available;
  assert.ok(avail('small-triangle-4', 'pinyin-picture'));
  assert.ok(!avail('hexagon-6', 'pinyin-picture'));
  assert.ok(avail('hexagon-6', 'hanzi-english'));
  assert.ok(!avail('triangle-9', 'hanzi-english'));
});

// ---------- Rigid (printed) rotation ----------
const ITEM = { kind: 'english', depth: 30, lines: ['x'], fontPx: 14 };
test('labels are printed on the piece: they turn rigidly with it through all six rotations', () => {
  for (const side of ['A', 'B']) for (let i = 0; i < 3; i++) {
    const base = placeLabel(ITEM, i, 0, side);
    for (let k = 0; k < 6; k++) {
      const at = placeLabel(ITEM, i, k, side), a = k * Math.PI / 3;
      // position = base position turned by k × 60°; angle = base angle + k × 60° (no upright correction)
      assert.ok(Math.abs(at.x - (base.x * Math.cos(a) - base.y * Math.sin(a))) < 1e-9);
      assert.ok(Math.abs(at.y - (base.x * Math.sin(a) + base.y * Math.cos(a))) < 1e-9);
      assert.equal(at.angle, (base.angle + 60 * k) % 360);
    }
  }
});

test('relative orientation of the three labels never changes; text may be upside down', () => {
  const angles = k => [0, 1, 2].map(i => placeLabel(ITEM, i, k, i === 1 ? 'B' : 'A').angle);
  const rel = k => { const a = angles(k); return [(a[1] - a[0] + 360) % 360, (a[2] - a[0] + 360) % 360]; };
  for (let k = 1; k < 6; k++) assert.deepEqual(rel(k), rel(0));
  const all = [0, 1, 2, 3, 4, 5].flatMap(angles);
  assert.ok(all.some(a => a > 90 && a < 270), 'some labels are upside down: no counter-rotation');
  // Pictures follow the same printed rule (they are not kept upright).
  assert.equal(placeLabel({ ...ITEM, kind: 'picture' }, 0, 3, 'A').angle, placeLabel(ITEM, 0, 3, 'A').angle);
});

test('printed convention: side A baseline towards its edge, side B top towards it (pairs read the same way)', () => {
  // An edge facing down (180°) on an upright piece: A is upright (0°), B is upside down (180°) on its own piece,
  // and the partner on the other piece faces up (0°), so its B label reads upright too.
  assert.equal(placeLabel(ITEM, 2, 0, 'A').angle, 0);
  assert.equal(placeLabel(ITEM, 2, 0, 'B').angle, 180);
  assert.equal((edgeDirection(0, 1) + 360) % 360, 0); // ▼ top edge faces up
  assert.equal(placeLabel(ITEM, 0, 1, 'B').angle, 0);
});

test('geometric drop adjustment turns the whole piece (every label edge turns by the same 60°)', () => {
  const p = createStudentPuzzle({ entries: ALL, templateId: 'hexagon-6', modeId: 'hanzi-english', seed: 4 });
  const t = getTemplate('hexagon-6');
  let state = resetState(p);
  const id = state.tray[0], slot = t.slots.find(s => !Object.values(state.pieces).some(x => x.slot === s.id));
  state.pieces[id].rotation = slot.up ? 1 : 0; // wrong way
  const before = [0, 1, 2].map(i => edgeDirection(i, state.pieces[id].rotation));
  const r = placePiece(state, t, id, slot.id);
  assert.ok(r.ok && r.autoRotated && fitsSlot(r.state.pieces[id].rotation, slot.up));
  const after = [0, 1, 2].map(i => edgeDirection(i, r.state.pieces[id].rotation));
  assert.deepEqual(after, before.map(d => (d + 60) % 360));
});

// ---------- Measured layout of the longest real labels ----------
const LONGEST = { hanzi: ['澳大利亚', '斯里兰卡', '巴基斯坦'], pinyin: ['si li lan ka', 'ao da li ya', 'ba ji si tan'],
  english: ['Bosnia and Herzegovina', 'United Kingdom', 'United States'] };
const lab = (kind, i) => kind === 'picture' ? { kind, aspect: [2, 1.99, 1.5][i] } : { kind, text: LONGEST[kind][i] };
// Smallest board among student shapes: Triangle · 9 on 1024 × 768 landscape (side ≈ 210 px).
test('worst three labels on one piece fit at the approved floors on the smallest student board', () => {
  for (const S of [210, 230, 250]) for (const mode of Object.values(MODES)) for (const mix of [[0, 0, 0], [1, 1, 1], [0, 0, 1], [0, 1, 1]]) {
    const labels = mix.map((k, i) => lab(mode.sides[k], i));
    const out = layoutPiece(labels, S, estimateWidth);
    out.forEach((o, i) => {
      assert.ok(!o.overflow, `${S} ${mode.id} ${labels[i].text || 'picture'}`);
      if (o.kind === 'picture') return;
      assert.ok(o.fontPx >= LAYOUT.minFontPx[o.kind], 'never below the floor');
      assert.equal(o.lines.join(' ').replace(/ /g, ''), labels[i].text.replace(/ /g, ''), 'never truncated');
    });
  }
  assert.deepEqual(LAYOUT.minFontPx, { hanzi: 18, pinyin: 14, english: 14 });
  assert.deepEqual(lineOptions('澳大利亚', 'hanzi'), [['澳大利亚']], 'four-character Hanzi stays on one line');
  assert.deepEqual(lineOptions('xi la', 'pinyin'), [['xi la']], 'short words are never split');
});

// ---------- Workspace rules ----------
test('progress counts correct edges and goes down when a match is broken', () => {
  const p = createStudentPuzzle({ entries: ALL, templateId: 'triangle-9', modeId: 'pinyin-english', seed: 9 }), t = getTemplate('triangle-9');
  const s = solved(p);
  assert.deepEqual([progressOf(p, s, t).matched, progressOf(p, s, t).complete], [9, true]);
  const id = p.pieces.find(x => !x.locked && x.edges.filter(Boolean).length === 3).id;
  const turned = rotatePiece(s, t, id).state;
  assert.ok(progressOf(p, turned, t).matched < 9);
  assert.equal(progressOf(p, turned, t).complete, false);
});

test('Shuffle changes only tray pieces; header shows shape and mode, no difficulty', () => {
  const p = createStudentPuzzle({ entries: ALL, templateId: 'hexagon-10', modeId: 'hanzi-picture', seed: 2 }), t = getTemplate('hexagon-10');
  let s = resetState(p); s = placePiece(s, t, s.tray[0], t.slots.find(x => !Object.values(s.pieces).some(q => q.slot === x.id)).id).state;
  const random = { shuffle: l => [...l].reverse(), int: () => 3 };
  const after = shuffleTray(s, random);
  for (const [id, piece] of Object.entries(s.pieces)) if (piece.slot) assert.deepEqual(after.pieces[id], piece);
  assert.deepEqual(after.tray, [...s.tray].reverse());
  assert.ok(after.tray.every(id => after.pieces[id].rotation === 3));
  assert.ok(hasProgress(p, s));
  assert.deepEqual(puzzleInfo(p, ['Countries I']), { shape: 'Extended Hexagon · 10 pieces', mode: 'Hanzi + Picture', sets: 'Countries I', pairs: 11 });
});

test('Tap-to-place: tap selects (never rotates), a slot tap places, locked pieces cannot be selected', () => {
  const p = createStudentPuzzle({ entries: ALL, templateId: 'hexagon-6', modeId: 'pinyin-english', seed: 5 }), t = getTemplate('hexagon-6');
  const s = resetState(p), id = s.tray[0], locked = p.pieces.find(x => x.locked).id;
  assert.equal(tapPiece(s, null, id), id);
  assert.equal(tapPiece(s, id, id), null, 'second tap clears the selection');
  assert.equal(tapPiece(s, null, locked), null);
  assert.equal(s.pieces[id].rotation, resetState(p).pieces[id].rotation, 'selecting does not rotate');
  assert.equal(tapSlot(s, t, null, 'r0c0').reason, 'nothing-selected');
  assert.equal(tapSlot(s, t, id, 'r0c1').reason, 'occupied');
  const empty = t.slots.find(x => !Object.values(s.pieces).some(q => q.slot === x.id)).id;
  const r = tapSlot(s, t, id, empty);
  assert.ok(r.ok && r.selected === null && r.state.pieces[id].slot === empty && fitsSlot(r.state.pieces[id].rotation, t.slotById.get(empty).up));
});

test('completion record names the shape and its real pair count', () => {
  const p = createStudentPuzzle({ entries: ALL, templateId: 'triangle-9', modeId: 'hanzi-english', seed: 1 });
  const rec = tarsiaCompletionRecord(p, solved(p), { vocabularySets: [{ id: 'a', title: 'A' }] });
  assert.equal(rec.matchesCompleted, 9);
  assert.equal(rec.successCriteria, 'I can complete a Tarsia puzzle by correctly matching all 9 vocabulary pairs.');
  assert.deepEqual([rec.content.shapeName, rec.content.pieceCount, rec.content.pairs], ['Triangle', 9, 9]);
  assert.match(rec.difficulty.label, /^Triangle · 9 pieces · 9 pairs$/);
});
