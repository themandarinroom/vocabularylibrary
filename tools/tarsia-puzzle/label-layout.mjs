// Measured label layout for one triangular piece (Phase B3). Pure and DOM-free: text width comes from an injected
// `measure(text, fontPx, kind)` (canvas in the browser, an estimate in tests).
//
// Each piece's three labels are laid out together in the piece's own frame (▲, centroid at the origin):
//  - text sits in a band along its edge as a rectangle (one or two lines); pictures sit in a circle that turns with the piece,
//    with the whole image inscribed in the circle (never cropped or stretched);
//  - every shape must stay inside the triangle (with a margin) and clear of the other two labels;
//  - labels start large and the one with the most room to give shrinks first, down to a readable minimum.
// Nothing is ever truncated or abbreviated. A label that still cannot fit at the minimum is reported as overflow.
//
// Shapes are rotation-invariant (a rectangle turned 180° covers the same area; pictures use circles), so the
// layout is computed once per piece and size; `placeLabel` then positions it rigidly for any of the six rotations.
import { UP_DIRS, edgeDirection } from './engine/geometry.mjs';

export const LAYOUT = Object.freeze({
  lineHeight: 1.18,
  maxFont: { hanzi: 0.17, pinyin: 0.125, english: 0.125 },   // × side
  minFontPx: { hanzi: 18, pinyin: 14, english: 14 },          // approved readability floor in CSS px at the size drawn
  maxFontPx: { hanzi: 46, pinyin: 32, english: 30 },          // cap so small puzzles' big pieces don't get oversized text
  picture: { max: 0.42, min: 0.18 },                          // circle diameter × side
  edgeGap: 0.045,                                             // label to its own edge, × side (clears the edge line)
  margin: 0.03,                                               // label to the other edges, × side
  labelGap: 0.02                                              // between labels, × side
});

const SQ3 = Math.sqrt(3);
const normal = dir => { const a = dir * Math.PI / 180; return { x: Math.sin(a), y: -Math.cos(a) }; };
const along = dir => { const a = dir * Math.PI / 180; return { x: Math.cos(a), y: Math.sin(a) }; };
const dot = (a, b) => a.x * b.x + a.y * b.y;

// Ways to show a text on one or two lines, without changing a single character.
export function lineOptions(text, kind) {
  const options = [[text]];
  if (kind === 'hanzi') {
    const chars = [...text];
    if (chars.length >= 5) { const mid = Math.ceil(chars.length / 2); options.push([chars.slice(0, mid).join(''), chars.slice(mid).join('')]); }
    return options;
  }
  // Short words such as "xi la" are never split: they shrink a little instead (splitting reads worse).
  if (text.length < 9) return options;
  const words = text.split(' ');
  for (let i = 1; i < words.length; i++) options.push([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
  // Three lines only for long English names ("Bosnia / and / Herzegovina").
  if (kind === 'english' && words.length >= 3 && text.length > 14)
    for (let i = 1; i < words.length - 1; i++) for (let j = i + 1; j < words.length; j++)
      options.push([words.slice(0, i).join(' '), words.slice(i, j).join(' '), words.slice(j).join(' ')]);
  return options;
}

// Candidate sizes for one label, best first: biggest font, one line before two.
function candidates(label, side, measure, layout) {
  if (label.kind === 'picture') {
    const out = [], a = label.aspect > 0 ? label.aspect : 1.5;
    for (let d = layout.picture.max; d >= layout.picture.min - 1e-9; d -= 0.02) {
      const D = d * side, k = 1 / Math.sqrt(1 + a * a);
      out.push({ kind: 'picture', D, imageW: D * a * k, imageH: D * k, fontPx: null });
    }
    return out;
  }
  const kind = label.kind, minPx = layout.minFontPx[kind];
  const maxPx = Math.max(Math.min(layout.maxFont[kind] * side, layout.maxFontPx?.[kind] ?? Infinity), minPx);
  const splits = lineOptions(label.text, kind), out = [];
  for (let f = maxPx; f >= minPx - 1e-9; f -= Math.max(0.5, f * 0.05)) {
    // One line first; two-line options ordered by their widest line (most balanced first).
    const bySize = splits.map(lines => ({ lines, w: Math.max(...lines.map(l => measure(l, f, kind))) }));
    const best = n => bySize.filter(c => c.lines.length === n).sort((p, q) => p.w - q.w)[0];
    for (const c of [best(1), best(2), best(3)].filter(Boolean)) out.push({ kind, lines: c.lines, fontPx: f, w: c.w, h: c.lines.length * f * layout.lineHeight });
  }
  return out;
}

// The shape a candidate occupies when it sits on edge i (piece frame).
function shapeOf(c, i, side, layout) {
  const dir = UP_DIRS[i], n = normal(dir), u = along(dir), r = side / (2 * SQ3), gap = layout.edgeGap * side;
  if (c.kind === 'picture') { const R = c.D / 2, d = r - gap - R; return { type: 'circle', c: { x: n.x * d, y: n.y * d }, R, depth: d }; }
  const d = r - gap - c.h / 2;
  return { type: 'rect', c: { x: n.x * d, y: n.y * d }, u, n, hw: c.w / 2, hh: c.h / 2, depth: d };
}
const corners = s => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => ({ x: s.c.x + s.u.x * s.hw * a + s.n.x * s.hh * b, y: s.c.y + s.u.y * s.hw * a + s.n.y * s.hh * b }));

function inside(s, side, layout) {
  const r = side / (2 * SQ3), m = layout.margin * side;
  const normals = UP_DIRS.map(normal);
  if (s.type === 'circle') return normals.every(n => r - dot(s.c, n) >= s.R + m - 1e-9);
  return corners(s).every(p => normals.every(n => r - dot(p, n) >= m - 1e-9));
}
function project(s, axis) {
  if (s.type === 'circle') { const c = dot(s.c, axis); return [c - s.R, c + s.R]; }
  const ps = corners(s).map(p => dot(p, axis)); return [Math.min(...ps), Math.max(...ps)];
}
function apart(a, b, g) {
  if (a.type === 'circle' && b.type === 'circle') return Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y) >= a.R + b.R + g;
  if (a.type === 'circle' || b.type === 'circle') {
    const [circ, rect] = a.type === 'circle' ? [a, b] : [b, a];
    const dx = circ.c.x - rect.c.x, dy = circ.c.y - rect.c.y;
    const lu = Math.max(-rect.hw, Math.min(rect.hw, dx * rect.u.x + dy * rect.u.y)), ln = Math.max(-rect.hh, Math.min(rect.hh, dx * rect.n.x + dy * rect.n.y));
    const px = rect.c.x + rect.u.x * lu + rect.n.x * ln, py = rect.c.y + rect.u.y * lu + rect.n.y * ln;
    return Math.hypot(circ.c.x - px, circ.c.y - py) >= circ.R + g;
  }
  for (const axis of [a.u, a.n, b.u, b.n]) { const [a0, a1] = project(a, axis), [b0, b1] = project(b, axis); if (a1 + g <= b0 || b1 + g <= a0) return true; }
  return false;
}

/**
 * @param {Array<null|{kind:'hanzi'|'pinyin'|'english'|'picture', text?:string, aspect?:number}>} labels  edges[0..2]
 * @param {number} side  triangle side in CSS px
 * @returns {Array<null|object>} per edge: lines/fontPx/w/h or D/imageW/imageH, depth, overflow
 */
export function layoutPiece(labels, side, measure, layout = LAYOUT) {
  const lists = labels.map(l => l ? candidates(l, side, measure, layout) : null);
  const idx = labels.map(() => 0);
  const g = layout.labelGap * side;
  for (let guard = 0; guard < 400; guard++) {
    const shapes = lists.map((list, i) => list ? shapeOf(list[idx[i]], i, side, layout) : null);
    const bad = new Set();
    shapes.forEach((s, i) => { if (s && !inside(s, side, layout)) bad.add(i); });
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (shapes[i] && shapes[j] && !apart(shapes[i], shapes[j], g)) { bad.add(i); bad.add(j); }
    if (!bad.size) return finish(lists, idx, shapes, false);
    // Shrink the label with the most room left (largest share of its candidate list still ahead).
    const movable = [...bad].filter(i => idx[i] < lists[i].length - 1);
    if (!movable.length) return finish(lists, idx, shapes, [...bad]);
    const victim = movable.sort((a, b) => (lists[b].length - idx[b]) / lists[b].length - (lists[a].length - idx[a]) / lists[a].length)[0];
    idx[victim]++;
  }
  throw new Error('Label layout did not settle.');
}
function finish(lists, idx, shapes, overflow) {
  return lists.map((list, i) => list ? { ...list[idx[i]], depth: shapes[i].depth, overflow: Array.isArray(overflow) && overflow.includes(i) } : null);
}

// Where a laid-out label goes for a piece at `rotation` (relative to the piece centroid, screen frame).
// Labels are printed on the piece like a paper Tarsia (Phase A worksheet convention): side A has its baseline
// towards its edge, side B its top towards its edge; pictures follow their side's rule. The whole piece turns as
// one object, so text and pictures may be sideways or upside down. There is no upright correction.
export function placeLabel(item, edgeIndex, rotation, side = 'A') {
  const dir = edgeDirection(edgeIndex, rotation), n = normal(dir);
  const angle = (((side === 'B' ? dir : dir - 180) % 360) + 360) % 360;
  return { x: n.x * item.depth, y: n.y * item.depth, angle };
}

// Rough text widths for tests and server-side checks (CSS px). The browser uses canvas measureText.
export function estimateWidth(text, fontPx, kind) {
  let units = 0;
  for (const ch of text) units += /[㐀-鿿]/.test(ch) ? 1 : /[mwMW]/.test(ch) ? 0.8 : /[il.,' ]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.66 : 0.55;
  return units * fontPx * (kind === 'hanzi' ? 1 : 1.02);
}
