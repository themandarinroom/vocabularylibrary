// Phase D1: picture readability, keyboard navigation helpers and record print sizes (offline).
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPiece, placeLabel, estimateWidth, LAYOUT } from '../tools/tarsia-puzzle/label-layout.mjs';
import { slotNeighbour, pieceDescription, slotDescription } from '../tools/tarsia-puzzle/workspace-model.mjs';
import { getTemplate, MODES, createStudentPuzzle } from '../tools/tarsia-puzzle/engine/index.mjs';
import { FORMATS, DEFAULT_FORMAT, pxToPt, pxToMm } from '../tools/learning-record-export/card.mjs';
import { EXPORT_FORMAT } from '../tools/learning-record/record.mjs';
import { catalogueFromSets, mergeSets } from '../tools/vocabulary-games-core/vocabulary.mjs';
import { FIXTURE_SETS } from '../tools/tarsia-puzzle/dev/fixtures.mjs';

// Real published aspect ratios: Countries I illustrations 1:1; flags 1.5 (most), 1.74 (Iran), 2:1 (Sri Lanka, Bosnia, Ireland, Samoa).
const ASPECTS = [2, 1.5, 1, 1.74];
const pic = a => ({ kind: 'picture', aspect: a });

test('pictures are printed along their edge at their own proportions (never squeezed into a circle)', () => {
  const S = 203; // D1 baseline board side (pre-D1 Triangle · 9 on 1024 × 694); D1 board is now 209
  const [wide, mid, square] = layoutPiece([pic(2), pic(1.5), pic(1)], S, estimateWidth);
  assert.ok(Math.abs(wide.imageW / wide.imageH - 2) < 1e-9 && Math.abs(mid.imageW / mid.imageH - 1.5) < 1e-9 && Math.abs(square.imageW - square.imageH) < 1e-9);
  // D1 baseline (circle model) on the same piece was 36×18, 34×23 and 32×32 px.
  assert.ok(wide.imageW >= 60 && wide.imageH >= 30, `2:1 flag ${wide.imageW}×${wide.imageH}`);
  assert.ok(mid.imageW >= 45 && mid.imageH >= 30, `1.5:1 flag ${mid.imageW}×${mid.imageH}`);
  assert.ok(square.imageW >= 36, `square picture ${square.imageW}`);
});

test('pictures turn rigidly with the piece (printed rule), no upright correction', () => {
  const item = layoutPiece([pic(2), null, null], 220, estimateWidth)[0];
  for (let k = 0; k < 6; k++) assert.equal(placeLabel(item, 0, k, 'A').angle, (((300 + 60 * k - 180) % 360) + 360) % 360);
});

test('every mode at every student board size: worst real labels and real flag shapes fit without overlap or text below the floors', () => {
  const longest = { hanzi: ['澳大利亚', '斯里兰卡', '巴基斯坦'], pinyin: ['si li lan ka', 'ao da li ya', 'ba ji si tan'], english: ['Bosnia and Herzegovina', 'United Kingdom', 'United States'] };
  // Measured D1 board sides (px) across 4 shapes × 4 viewports; 209 = Triangle · 9 on 1024 × 694, the smallest.
  // Three of the longest English names on one piece need ≥ 208 px, so 209 is also the release minimum.
  for (const S of [209, 214, 225, 231, 243, 244, 256, 314, 321, 338, 346]) for (const mode of Object.values(MODES)) for (const mix of [[0, 0, 0], [1, 1, 1], [0, 0, 1], [0, 1, 1]]) for (const a of ASPECTS) {
    const labels = mix.map((k, i) => mode.sides[k] === 'picture' ? pic(i === 0 ? a : ASPECTS[(i + 1) % 4]) : { kind: mode.sides[k], text: longest[mode.sides[k]][i] });
    const out = layoutPiece(labels, S, estimateWidth);
    out.forEach((o, i) => {
      assert.ok(!o.overflow, `${S} ${mode.id} ${labels[i].text || 'picture ' + labels[i].aspect}`);
      if (o.kind !== 'picture') assert.ok(o.fontPx >= LAYOUT.minFontPx[o.kind]);
      else assert.ok(o.imageH >= LAYOUT.picture.minH * S - 1e-9);
    });
  }
});

test('keyboard: arrow keys move between neighbouring spaces and stop at the edge of the board', () => {
  const t = getTemplate('triangle-9');
  assert.equal(slotNeighbour(t, 'r2c4', 'ArrowLeft'), 'r2c3');
  assert.equal(slotNeighbour(t, 'r2c4', 'ArrowRight'), 'r2c5');
  assert.equal(slotNeighbour(t, 'r2c2', 'ArrowLeft'), 'r2c2', 'nothing further left');
  assert.equal(slotNeighbour(t, 'r0c4', 'ArrowDown'), 'r1c4');
  assert.equal(slotNeighbour(t, 'r1c4', 'ArrowUp'), 'r0c4');
  assert.equal(slotNeighbour(t, 'r0c4', 'ArrowUp'), 'r0c4');
  // every space is reachable from the first one using arrow keys only
  for (const shape of ['small-triangle-4', 'hexagon-6', 'triangle-9', 'hexagon-10']) {
    const tt = getTemplate(shape), seen = new Set([tt.slots[0].id]), queue = [tt.slots[0].id];
    while (queue.length) { const cur = queue.shift(); for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) { const n = slotNeighbour(tt, cur, k); if (!seen.has(n)) { seen.add(n); queue.push(n); } } }
    assert.equal(seen.size, tt.slots.length, shape);
  }
});

test('spoken descriptions name every label, pictures by their English meaning', () => {
  const { sets } = catalogueFromSets(FIXTURE_SETS, { allowData: true });
  const p = createStudentPuzzle({ entries: mergeSets(sets, ['zz-fixture-countries']).entries, templateId: 'hexagon-6', modeId: 'pinyin-picture', seed: 3 });
  const words = new Map(p.words.map(w => [w.key, w]));
  const full = p.pieces.find(x => x.edges.filter(Boolean).length === 2);
  const text = pieceDescription(full, words);
  assert.match(text, /^Piece with /);
  for (const l of full.edges.filter(Boolean)) assert.ok(text.includes(l.kind === 'picture' ? `a picture of ${words.get(l.pair).english}` : l.text));
  assert.equal(slotDescription(getTemplate('hexagon-6'), 'r0c1', false), 'Space 2 of 6, empty');
});

test('record print sizes: A6 and A5 at 300 dpi', () => {
  assert.deepEqual([FORMATS.A6.width, FORMATS.A6.height, FORMATS.A5.width, FORMATS.A5.height], [1748, 1240, 2480, 1748]);
  assert.equal(pxToPt(30, FORMATS.A6).toFixed(1), '7.2');
  assert.equal(pxToPt(30, FORMATS.A5).toFixed(1), '10.2');
  assert.equal(pxToMm(118, FORMATS.A6).toFixed(1), '10.0');
  // Owner decision (D1 review): A5 is the default; A6 stays available as the compact option.
  assert.equal(DEFAULT_FORMAT, FORMATS.A5);
  assert.deepEqual([EXPORT_FORMAT.width, EXPORT_FORMAT.height], [DEFAULT_FORMAT.width, DEFAULT_FORMAT.height]);
  assert.equal(pxToPt(30), pxToPt(30, FORMATS.A5));
});

test('finished puzzle reads the right way up: horizontal pairs upright, sloping pairs at ±60°, never upside down', () => {
  const { sets } = catalogueFromSets(FIXTURE_SETS, { allowData: true });
  const entries = mergeSets(sets, sets.map(s => s.id)).entries;
  for (const templateId of ['small-triangle-4', 'hexagon-6', 'triangle-9', 'hexagon-10']) for (const mode of Object.values(MODES)) for (const seed of [1, 2, 3, 4, 5]) {
    let p; try { p = createStudentPuzzle({ entries, templateId, modeId: mode.id, seed }); } catch { continue; } // fixture too small for this mode
    const t = getTemplate(templateId);
    for (const piece of p.pieces) for (let e = 0; e < 3; e++) {
      const label = piece.edges[e]; if (!label) continue;
      const dir = placeLabel({ depth: 0 }, e, piece.home.rotation, label.side); // printed angle on the board at home
      const a = ((dir.angle + 180) % 360 + 360) % 360 - 180;                  // −180…180, 0 = upright
      assert.ok(Math.abs(a) <= 60 + 1e-9, `${templateId} ${mode.id} ${seed}: ${label.text || label.kind} at ${a}°`);
    }
    assert.ok(t);
  }
});
