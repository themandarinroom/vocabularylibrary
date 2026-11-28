// D3 refinements (27 Nov 2026): levels, tap-only play with long press, completion time on the record,
// Great Wall-style vocabulary selector, "Word Bank" label.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MODES, MATCH_LEVELS, levelForMode, createStudentPuzzle, getTemplate, resetState, placePiece, tarsiaCompletionRecord, STUDENT_TEMPLATES } from '../tools/tarsia-puzzle/engine/index.mjs';
import { boardTapAction, LONG_PRESS_MS, tapPiece, tapSlot } from '../tools/tarsia-puzzle/workspace-model.mjs';
import { buildCompletionRecord, formatDuration } from '../tools/learning-record/record.mjs';
import { drawRecordCard, FORMATS } from '../tools/learning-record-export/card.mjs';
import { catalogueFromSets, mergeSets } from '../tools/vocabulary-games-core/vocabulary.mjs';
import { FIXTURE_SETS } from '../tools/tarsia-puzzle/dev/fixtures.mjs';

const read = f => fs.readFileSync(new URL(`../tools/tarsia-puzzle/${f}`, import.meta.url), 'utf8');
const { sets } = catalogueFromSets(FIXTURE_SETS, { allowData: true });
const ALL = mergeSets(sets, sets.map(s => s.id)).entries;
const solved = p => ({ pieces: Object.fromEntries(p.pieces.map(x => [x.id, { slot: x.home.slot, rotation: x.home.rotation, locked: x.locked }])), tray: [] });

test('levels: Beginner = Pinyin + Picture / Pinyin + English; Master = the three Hanzi modes; intentions unchanged', () => {
  assert.deepEqual(MATCH_LEVELS.beginner.modes, ['pinyin-picture', 'pinyin-english']);
  assert.deepEqual(MATCH_LEVELS.master.modes, ['hanzi-english', 'hanzi-pinyin', 'hanzi-picture']);
  for (const id of Object.keys(MODES)) assert.ok(levelForMode(id), id);
  assert.equal(MODES['pinyin-picture'].learningIntention, 'I can read Pinyin and match Chinese words to pictures.');
  assert.equal(MODES['hanzi-picture'].learningIntention, 'I can recognise Chinese characters and match them to pictures.');
  assert.deepEqual(STUDENT_TEMPLATES.map(t => t.id), ['small-triangle-4', 'hexagon-6', 'triangle-9', 'hexagon-10'], 'no 18-pair template');
});

test('tap rules: tray tap selects/cancels; tap a placed piece turns it; with a piece selected a placed piece is protected; locked never', () => {
  const p = createStudentPuzzle({ entries: ALL, templateId: 'hexagon-6', modeId: 'pinyin-english', seed: 4 }), t = getTemplate('hexagon-6');
  let s = resetState(p);
  const locked = Object.keys(s.pieces).find(id => s.pieces[id].locked), [a, b] = s.tray;
  const empty = t.slots.find(sl => !Object.values(s.pieces).some(q => q.slot === sl.id)).id;
  assert.equal(tapPiece(s, null, a), a); assert.equal(tapPiece(s, a, a), null);
  s = tapSlot(s, t, a, empty).state;                      // placed (geometric turn applied by placePiece)
  assert.equal(boardTapAction(s, null, a), 'rotate');
  assert.equal(boardTapAction(s, b, a), 'occupied', 'tray piece selected: the placed piece is neither turned nor replaced');
  assert.equal(boardTapAction(s, null, locked), 'none');
  assert.equal(boardTapAction(s, null, b), 'none', 'a tray piece is not a board tap');
  assert.equal(tapSlot(s, t, b, empty).reason, 'occupied');
  assert.equal(LONG_PRESS_MS, 500);
});

test('workspace: tap only — no drag, long press returns with feedback, no native menu, keyboard equivalent kept', () => {
  const ws = read('workspace.mjs'), html = read('index.html');
  assert.doesNotMatch(ws, /drag-ghost|startDragVisual|endDrag|setInteraction|turn-btn|back-btn/);
  assert.match(ws, /el\.classList\.add\('pressing'\)/);
  assert.match(ws, /setTimeout\(\(\) => \{[\s\S]{0,200}backToTray\(id\)/);
  assert.match(ws, /addEventListener\('contextmenu', event => event\.preventDefault\(\)/);
  assert.match(ws, /if \(p\.handled \|\| moved\) return;/, 'a long press never also counts as a tap');
  assert.match(ws, /echoClick\(event\)/, 'only the click echoing a tap or hold (same place, just after) is ignored');
  assert.match(ws, /isBack = key === 'Delete' \|\| key === 'Backspace'/, 'keyboard: Delete returns a piece');
  assert.doesNotMatch(html, /id="mode-drag"|id="mode-tap"|id="turn-btn"|id="back-btn"|drag-ghost/);
  assert.match(html, /<button id="bank-btn" type="button" class="tool-button" aria-expanded="false" aria-controls="word-bank">Word Bank<\/button>/);
  assert.match(html, /Tap a piece, then tap an empty space\. Tap a placed piece to turn it\. Hold a placed piece to send it back\./);
  assert.match(read('styles.css'), /-webkit-touch-callout:none/);
});

test('setup: Great Wall selector and "Choose a level" with one visible dropdown', () => {
  const html = read('index.html'), app = read('app.mjs');
  assert.match(html, /<div id="sets" class="set-list"/); assert.match(html, /id="set-preview" class="set-preview"/);
  assert.match(html, /<h2 id="s3">Choose a level<\/h2>/); assert.doesNotMatch(html, /Choose how to match/);
  assert.match(app, /class="set-option"><input type="checkbox" name="set"/);
  assert.match(app, /<label class="level-mode" \$\{l\.selected \? '' : 'hidden'\}>/);
  const gw = fs.readFileSync(new URL('../tools/great-wall/styles.css', import.meta.url), 'utf8'), tz = read('styles.css');
  for (const rule of ['.set-option{display:flex;align-items:center;gap:12px;min-height:50px;padding:6px 10px;border-radius:10px;cursor:pointer;font-size:16px;line-height:1.3}', '.word-chip{border:1px solid #c6d7ca;border-radius:12px;background:#f3f8ed;padding:6px 12px;font-size:20px;line-height:1.25}'])
    assert.ok(gw.includes(rule) && tz.includes(rule), rule);
});

test('completion time: formatting, frozen on the record, Level shown; other games unaffected', () => {
  assert.deepEqual([0, 45_900, 272_400, 3_903_000].map(formatDuration), ['0 sec', '45 sec', '4 min 32 sec', '1 hr 5 min']);
  const p = createStudentPuzzle({ entries: ALL, templateId: 'triangle-9', modeId: 'hanzi-english', seed: 2 });
  const rec = tarsiaCompletionRecord(p, solved(p), { vocabularySets: [], timeTakenMs: 272_400 });
  assert.deepEqual(rec.level, { id: 'master', label: 'Master' });
  assert.deepEqual(rec.timeTaken, { ms: 272_400, text: '4 min 32 sec' });
  assert.equal(tarsiaCompletionRecord(p, solved(p), { vocabularySets: [], timeTakenMs: 272_400 }).timeTaken.text, rec.timeTaken.text, 'same time on every export');
  const other = buildCompletionRecord({ activity: { id: 'x', name: 'X', category: 'Y' }, completedAt: new Date(), vocabularySets: [], difficulty: { id: 'a', label: 'a' },
    matchingMode: { id: 'm', label: 'm' }, matchesCompleted: 1, learningIntention: 'L', successCriteria: 'S', content: {} });
  assert.ok(!('timeTaken' in other) && !('level' in other));
  const ws = fs.readFileSync(new URL('../tools/tarsia-puzzle/workspace.mjs', import.meta.url), 'utf8');
  assert.match(ws, /startedAt = performance\.now\(\); \/\/ the board is drawn and ready/);
  assert.match(ws, /timeTakenMs = startedAt === null \? 0 : Math\.round\(performance\.now\(\) - startedAt\)/);
  assert.match(ws, /startedAt = performance\.now\(\); timeTakenMs = null; \/\/ a restarted puzzle/);
  assert.doesNotMatch(ws + read('index.html'), /score|time limit|leaderboard|timer-display/i, 'no live timer, scores or limits');
});

function textCtx() {
  const calls = [];
  return { calls, font: '', set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set textAlign(v) {}, set textBaseline(v) {},
    save() {}, restore() {}, setTransform() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {},
    measureText(t) { const px = Number((this.font.match(/(\d+(?:\.\d+)?)px/) || [0, 30])[1]); return { width: [...t].length * px * 0.55 }; },
    fillText(text, x, y) { calls.push({ text, x, y, px: Number((this.font.match(/(\d+(?:\.\d+)?)px/) || [0, 0])[1]) }); } };
}
test('record card: Level under Puzzle, Time taken under Matches; long set names fit above the footer at A5 and A6', () => {
  const p = createStudentPuzzle({ entries: ALL, templateId: 'hexagon-10', modeId: 'pinyin-picture', seed: 5 });
  const long = ['Countries and Nationalities of the World I', 'Countries and Nationalities of the World II', 'Countries and Nationalities of the World III', 'Family Members and Relatives', 'Food, Drinks and Fruit'];
  for (const sets of [[{ id: 'a', title: 'Pets I' }], long.map((title, i) => ({ id: `s${i}`, title }))]) for (const format of [FORMATS.A5, FORMATS.A6]) {
    const rec = tarsiaCompletionRecord(p, solved(p), { vocabularySets: sets, student: { firstName: 'Mia', className: '5B' }, timeTakenMs: 272_400 });
    const ctx = textCtx(), res = drawRecordCard(ctx, rec, { format, puzzleLine: 'Extended Hexagon · 10 pieces · 11 pairs', drawContent() {} });
    const labels = ctx.calls.filter(c => c.x === 60).map(c => c.text);
    assert.ok(labels.indexOf('Puzzle') < labels.indexOf('Level') && labels.indexOf('Level') < labels.indexOf('Matching'));
    assert.equal(labels.indexOf('Time taken'), labels.indexOf('Matches') + 1);
    assert.ok(ctx.calls.some(c => c.text === '4 min 32 sec') && ctx.calls.some(c => c.text === 'Beginner'));
    const footer = ctx.calls.find(c => c.text.startsWith('This record shows')), lastBody = Math.max(...ctx.calls.filter(c => c !== footer && c.y < footer.y && c.x < 700).map(c => c.y));
    assert.ok(lastBody <= footer.y - 30 - 20, `${format.id} ${sets.length} sets: body ends at ${lastBody}, footer at ${footer.y}`);
    assert.ok(res.fit >= 0.8, `fit ${res.fit}`);
    if (res.setsListed < sets.length) assert.ok(ctx.calls.some(c => / \+ \d+ more sets?$/.test(c.text)), 'shortened list says how many more');
    if (sets.length === 1) assert.ok(res.fit >= 0.9, 'ordinary records stay (almost) full size; real fonts are checked on browser exports');
  }
});

// ---------- Smartphone text fitting (28 Nov 2026) ----------
import { layoutPiece as rawLayout, fitPiece, SCREEN_FLOORS, estimateWidth, LAYOUT as BASE } from '../tools/tarsia-puzzle/label-layout.mjs';
const L = (kind, text) => ({ kind, text });
test('fitPiece: identical to the approved layout wherever it already fits (every iPad and desktop size)', () => {
  const words = { hanzi: ['澳大利亚', '新西兰', '中国'], pinyin: ['ao da li ya', 'xin xi lan', 'zhong guo'], english: ['Australia', 'New Zealand', 'China'] };
  for (const S of [209, 214, 225, 231, 243, 256, 314, 346]) for (const mode of Object.values(MODES)) {
    const labels = mode.sides.concat(mode.sides[0]).slice(0, 3).map((k, i) => k === 'picture' ? { kind: 'picture', aspect: 1.5 } : L(k, words[k][i]));
    const a = rawLayout(labels, S, estimateWidth), b = fitPiece(labels, S, estimateWidth);
    assert.equal(b.floorStep, 0, `${S} ${mode.id}`);
    assert.deepEqual(b.map(o => o && { ...o }), a.map(o => o && { ...o }));
  }
  assert.deepEqual(SCREEN_FLOORS[0], BASE.minFontPx, 'first step = approved floors');
});
test('fitPiece: the reported phone pieces no longer overlap at iPhone 13 Pro Max piece size; text never cut; readable floor', () => {
  for (const labels of [[L('hanzi', '新南威尔士'), L('hanzi', '昆士兰'), null], [L('hanzi', '肩膀'), L('pinyin', 'xin nan wei er shi'), L('pinyin', 'jian bang')]]) {
    const before = rawLayout(labels, 132, estimateWidth), after = fitPiece(labels, 132, estimateWidth);
    assert.ok(before.some(o => o?.overflow), 'overlapped before');
    assert.ok(!after.some(o => o?.overflow), 'fits after');
    after.forEach((o, i) => { if (!o) return; assert.equal(o.lines.join(o.kind === 'hanzi' ? '' : ' '), labels[i].text, 'never truncated');
      assert.ok(o.fontPx >= SCREEN_FLOORS.at(-1)[o.kind] - 1e-9, 'readable floor'); });
  }
  assert.deepEqual(SCREEN_FLOORS.at(-1), { hanzi: 12, pinyin: 11, english: 11 });
});
test('game uses fitPiece for board and tray and re-fits when the piece size changes', () => {
  const ws = fs.readFileSync(new URL('../tools/tarsia-puzzle/workspace.mjs', import.meta.url), 'utf8');
  assert.match(ws, /if \(next !== S && next > 20\) \{\s*S = next;\s*layouts = new Map\(puzzle\.pieces\.map\(p => \[p\.id, fitPiece\(labelsOf\(p\), S, measure\)\]\)\)/);
  assert.doesNotMatch(ws, /layoutPiece\(/);
});
test('phone layout (≤ 600 px): page scrolls, board full width, tray below and wrapping; wider screens untouched', () => {
  const css = read('styles.css'), ws = read('workspace.mjs');
  const block = css.slice(css.indexOf('@media (max-width:600px){'));
  assert.ok(block.length > 30, 'phone block present');
  const phone = block.slice(0, block.indexOf('\n}') + 2);
  assert.match(phone, /body\.playing \.game-screen\{height:auto;min-height:0\}/);
  assert.match(phone, /\.workspace\{display:flex;flex-direction:column/);
  assert.match(phone, /\.tray-list\{flex-wrap:wrap;overflow:visible/);
  assert.match(phone, /\.board \.piece\{touch-action:manipulation\}/, 'a swipe on a placed piece scrolls the page');
  assert.match(css, /\.piece\{cursor:grab;touch-action:none\}/, 'iPad/desktop rule kept');
  assert.match(ws, /const PHONE = '\(max-width: 600px\)';/);
  assert.match(ws, /if \(matchMedia\(PHONE\)\.matches\) scale = 0\.9;/);
  assert.match(ws, /workspace\.addEventListener\('pointercancel', cancelPress, on\);/, 'a scroll cancels a press: no turn, no hold');
});
