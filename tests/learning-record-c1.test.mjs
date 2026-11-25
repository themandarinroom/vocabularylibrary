// Phase C1: shared Evidence of Learning export utilities and the Tarsia record renderer (offline; no network, no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadImageStrict, loadAllStrict, ImageLoadError } from '../tools/learning-record-export/image-loader.mjs';
import { canvasToPngBlob, recordFileName, shareOrOffer } from '../tools/learning-record-export/export.mjs';
import { wrapLines, CARD } from '../tools/learning-record-export/card.mjs';
import { drawTarsiaBoard, layoutRecordBoard, boardSide, recordImageUrls, puzzleLine, PRINT_FLOORS } from '../tools/tarsia-puzzle/record-board.mjs';
import { createStudentPuzzle, tarsiaCompletionRecord } from '../tools/tarsia-puzzle/engine/index.mjs';
import { EXPORT_FORMAT } from '../tools/learning-record/record.mjs';
import { estimateWidth } from '../tools/tarsia-puzzle/label-layout.mjs';
import { catalogueFromSets, mergeSets } from '../tools/vocabulary-games-core/vocabulary.mjs';
import { FIXTURE_SETS } from '../tools/tarsia-puzzle/dev/fixtures.mjs';

const okFetch = (type = 'image/webp') => async () => ({ ok: true, status: 200, blob: async () => ({ type }) });
const decode = async () => ({ width: 200, height: 100 });

test('strict loader fetches in CORS mode, fresh from the network, without credentials or redirects', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return okFetch()(); };
  const r = await loadImageStrict('https://x/a.webp', { fetchImpl, decode });
  assert.deepEqual([r.width, r.height], [200, 100]);
  assert.equal(seen.init.mode, 'cors');
  assert.equal(seen.init.cache, 'no-store', 'never reuse a non-CORS cached copy (Safari pitfall)');
  assert.equal(seen.init.credentials, 'omit');
  assert.equal(seen.init.redirect, 'error');
});

test('any failed picture refuses the whole record (no silent incomplete export)', async () => {
  const fetchImpl = async url => url.includes('bad') ? { ok: false, status: 403, blob: async () => ({}) }
    : url.includes('blocked') ? Promise.reject(new TypeError('Failed to fetch')) : okFetch()();
  await assert.rejects(loadAllStrict(['https://x/a', 'https://x/bad', 'https://x/blocked'], { fetchImpl, decode }), err =>
    err instanceof ImageLoadError && err.failures.length === 2 && /403/.test(err.failures[0].reason) && /CORS/.test(err.failures[1].reason));
  await assert.rejects(loadImageStrict('https://x/a', { fetchImpl: okFetch('text/html'), decode }), /not an image/);
  const all = await loadAllStrict(['https://x/a', 'https://x/a', null], { fetchImpl: okFetch(), decode });
  assert.equal(all.size, 1, 'each picture is loaded once');
});

test('PNG helpers: toBlob first, data URL fallback, tainted canvas surfaces as an error', async () => {
  const blob = await canvasToPngBlob({ toBlob: cb => cb({ size: 3, type: 'image/png' }) });
  assert.equal(blob.type, 'image/png');
  const fallback = await canvasToPngBlob({ toDataURL: () => 'data:image/png;base64,iVBORw0K' });
  assert.equal(fallback.type, 'image/png');
  await assert.rejects(canvasToPngBlob({ toBlob: () => { throw Object.assign(new Error('tainted'), { name: 'SecurityError' }); } }), /tainted/);
  assert.deepEqual([EXPORT_FORMAT.width, EXPORT_FORMAT.height, CARD.width, CARD.height], [1748, 1240, 1748, 1240]);
});

test('file name is local and safe; sharing never assumes Photos', async () => {
  assert.equal(recordFileName({ activity: { id: 'tarsia-puzzle' }, completedAt: '2026-11-25', student: { firstName: 'Zoë Lee!' } }), 'tarsia-puzzle-2026-11-25-zoe-lee.png');
  assert.equal(recordFileName({ activity: { id: 'tarsia-puzzle' }, completedAt: '2026-11-25', student: {} }), 'tarsia-puzzle-2026-11-25.png');
  class F { constructor(parts, name, opts) { this.name = name; this.type = opts.type; } }
  assert.equal(await shareOrOffer({}, 'a.png', { nav: {}, FileCtor: F }), 'offer', 'no share sheet: show the image to save');
  let shared;
  assert.equal(await shareOrOffer({}, 'a.png', { nav: { canShare: () => true, share: async d => { shared = d; } }, FileCtor: F }), 'shared');
  assert.equal(shared.files[0].type, 'image/png');
  assert.equal(await shareOrOffer({}, 'a.png', { nav: { canShare: () => true, share: async () => { throw Object.assign(new Error(), { name: 'AbortError' }); } }, FileCtor: F }), 'cancelled');
});

test('card text wraps by words and never cuts a word', () => {
  const lines = wrapLines('I can complete a Tarsia puzzle by correctly matching all 9 vocabulary pairs.', 300, t => t.length * 14);
  assert.ok(lines.length > 1 && lines.every(l => l.length * 14 <= 300 || !l.includes(' ')));
  assert.equal(lines.join(' '), 'I can complete a Tarsia puzzle by correctly matching all 9 vocabulary pairs.');
});

// ---- Tarsia record board ----
const { sets } = catalogueFromSets(FIXTURE_SETS, { allowData: true });
const ALL = mergeSets(sets, ['zz-fixture-countries', 'zz-fixture-more-countries']).entries;
const solved = p => ({ pieces: Object.fromEntries(p.pieces.map(x => [x.id, { slot: x.home.slot, rotation: x.home.rotation, locked: x.locked }])), tray: [] });
const recordFor = (templateId, modeId, seed = 1) => { const p = createStudentPuzzle({ entries: ALL, templateId, modeId, seed }); return tarsiaCompletionRecord(p, solved(p), { vocabularySets: [{ id: 'a', title: 'A' }] }); };
const fakeImages = urls => new Map(urls.map((u, i) => [u, { image: { id: u }, width: [200, 300, 150][i % 3], height: 100 }]));
function mockCtx() {
  const calls = []; let angle = 0;
  return { calls, set font(v) {}, set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set lineJoin(v) {}, set lineCap(v) {}, set textAlign(v) {}, set textBaseline(v) {}, set globalAlpha(v) {},
    save() {}, restore() { angle = 0; }, translate() {}, rotate(a) { angle = a; }, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
    measureText: t => ({ width: t.length * 10 }),
    fillText(text) { calls.push({ op: 'text', text, angle }); }, drawImage(img, x, y, w, h) { calls.push({ op: 'image', img, w, h, angle }); } };
}
const BOX = { x: 754, y: 224, w: 930, h: 952 };

test('record board: every label and picture drawn, printed orientation (A: dir−180°, B: dir), proportions kept', () => {
  for (const [shape, mode] of [['triangle-9', 'hanzi-picture'], ['hexagon-10', 'pinyin-picture'], ['hexagon-6', 'hanzi-english'], ['small-triangle-4', 'pinyin-english']]) {
    const rec = recordFor(shape, mode), urls = recordImageUrls(rec.content), images = fakeImages([...new Set(urls)]);
    const ctx = mockCtx(), stats = drawTarsiaBoard(ctx, BOX, rec.content, images, { measure: estimateWidth });
    const edges = rec.content.slots.flatMap(s => s.edges).filter(e => !e.blank);
    assert.equal(ctx.calls.filter(c => c.op === 'image').length, edges.filter(e => e.kind === 'picture').length, shape);
    // angles follow the printed convention, in the same order as the edges were drawn
    const expected = edges.map(e => ((e.side === 'B' ? e.dir : e.dir - 180) * Math.PI / 180));
    const drawnAngles = []; let last = null;
    for (const c of ctx.calls) { if (c.op === 'image' || c.text !== last?.text || c.angle !== last?.angle) drawnAngles.push(c.angle); last = c; }
    assert.ok(expected.every(a => drawnAngles.some(d => Math.abs(d - a) < 1e-9)), `${shape}: printed angles`);
    for (const c of ctx.calls.filter(c => c.op === 'image')) {
      const src = images.get(c.img.id); assert.ok(Math.abs(c.w / c.h - src.width / src.height) < 1e-9, 'aspect ratio kept');
    }
    assert.ok(stats.minFont === null || stats.minFont >= PRINT_FLOORS[0].english, `${shape}: print floor`);
    const texts = ctx.calls.filter(c => c.op === 'text').map(c => c.text).join(' ');
    for (const e of edges.filter(e => e.kind !== 'picture')) for (const w of e.text.split(' ')) assert.ok(texts.includes(w), 'never truncated');
  }
});

test('record board fits the longest labels at print floors; puzzle line names the shape', () => {
  const rec = recordFor('triangle-9', 'hanzi-english', 3);
  const { S } = boardSide(rec.content, BOX);
  assert.ok(S >= 300);
  const { floors } = layoutRecordBoard(rec.content, S, new Map(), estimateWidth);
  assert.deepEqual(floors, PRINT_FLOORS[0]);
  assert.equal(puzzleLine(rec.content), 'Triangle · 9 pieces · 9 pairs');
});
