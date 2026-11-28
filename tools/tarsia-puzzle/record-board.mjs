// Tarsia-specific part of the Evidence of Learning (Phase C1 proof of concept): draws the completed puzzle from the
// record's own content onto a canvas, exactly as it was on the board — labels printed along their edges with the
// approved side A / side B orientation, pictures turned with their piece, never straightened, cropped or stretched.
import { getTemplate, cellCorners, cellCentroid, cellEdge } from './engine/index.mjs';
import { layoutPiece, LAYOUT } from './label-layout.mjs';

const FONT = { hanzi: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif', latin: '"Avenir Next",Avenir,"Segoe UI",Arial,sans-serif' };
const COLOR = { hanzi: '#111111', pinyin: '#a3150c', english: '#0b3f7a' };
// Print floors at 300 dpi (A6): 30 px ≈ 7 pt Hanzi, 24 px ≈ 6 pt Latin; relaxed only if a piece cannot fit.
export const PRINT_FLOORS = Object.freeze([{ hanzi: 30, pinyin: 24, english: 24 }, { hanzi: 26, pinyin: 21, english: 21 }, { hanzi: 22, pinyin: 18, english: 18 }]);
const normal = d => { const a = d * Math.PI / 180; return { x: Math.sin(a), y: -Math.cos(a) }; };

export function boardSide(content, box, pad = 10) {
  const t = getTemplate(content.templateId), cs = t.slots.flatMap(s => cellCorners(s.row, s.col));
  const minX = Math.min(...cs.map(p => p.x)), maxX = Math.max(...cs.map(p => p.x)), minY = Math.min(...cs.map(p => p.y)), maxY = Math.max(...cs.map(p => p.y));
  const S = Math.floor(Math.min((box.w - 2 * pad) / (maxX - minX), (box.h - 2 * pad) / (maxY - minY)));
  return { t, S, ox: box.x + (box.w - (maxX - minX) * S) / 2 - minX * S, oy: box.y + (box.h - (maxY - minY) * S) / 2 - minY * S };
}

// Lays out every piece at print size; returns the layouts and the floor actually needed (reported, never hidden).
export function layoutRecordBoard(content, S, images, measure) {
  for (const floors of PRINT_FLOORS) {
    const layout = { ...LAYOUT, minFontPx: floors, maxFontPx: { hanzi: 80, pinyin: 56, english: 52 } };
    const pieces = content.slots.map(slot => layoutPiece(slot.edges.map(e => e.blank ? null
      : e.kind === 'picture' ? { kind: 'picture', aspect: images.get(e.image).width / images.get(e.image).height } : { kind: e.kind, text: e.text }), S, measure, layout));
    if (!pieces.flat().some(x => x?.overflow)) return { pieces, floors };
  }
  throw new Error('The completed puzzle cannot be drawn readably at this size.');
}

/** @param images Map(url → { image, width, height }) from loadAllStrict — every picture must already be loaded. */
export function drawTarsiaBoard(ctx, box, content, images, { measure } = {}) {
  const m = measure || ((text, px, kind) => { ctx.font = `600 ${px}px ${kind === 'hanzi' ? FONT.hanzi : FONT.latin}`; return ctx.measureText(text).width; });
  const { t, S, ox, oy } = boardSide(content, box);
  const at = p => ({ x: ox + p.x * S, y: oy + p.y * S });
  const { pieces, floors } = layoutRecordBoard(content, S, images, m);
  let minFont = Infinity, minPicture = Infinity;
  content.slots.forEach((slot, k) => {
    const corners = cellCorners(slot.row, slot.col).map(at), c = at(cellCentroid(slot.row, slot.col));
    ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = '#fffdf8'; ctx.fill(); ctx.strokeStyle = '#5d6f57'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    slot.edges.forEach((edge, i) => {
      const item = pieces[k][i]; if (!item || edge.blank) return;
      const n = normal(edge.dir), angle = (edge.side === 'B' ? edge.dir : edge.dir - 180) * Math.PI / 180;
      ctx.save(); ctx.translate(c.x + n.x * item.depth, c.y + n.y * item.depth); ctx.rotate(angle);
      if (edge.kind === 'picture') {
        ctx.drawImage(images.get(edge.image).image, -item.imageW / 2, -item.imageH / 2, item.imageW, item.imageH);
        // Thin neutral frame so flags with white areas (e.g. Ireland) keep their outline on the cream piece.
        ctx.strokeStyle = '#c3c9bd'; ctx.lineWidth = 2; ctx.strokeRect(-item.imageW / 2, -item.imageH / 2, item.imageW, item.imageH);
        minPicture = Math.min(minPicture, Math.min(item.imageW, item.imageH)); // shorter side of the printed picture
      } else {
        ctx.font = `600 ${item.fontPx}px ${edge.kind === 'hanzi' ? FONT.hanzi : FONT.latin}`; ctx.fillStyle = COLOR[edge.kind];
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const lh = item.fontPx * LAYOUT.lineHeight;
        item.lines.forEach((line, j) => ctx.fillText(line, 0, (j - (item.lines.length - 1) / 2) * lh));
        minFont = Math.min(minFont, item.fontPx);
      }
      ctx.restore();
    });
  });
  // Every shared edge of a completed puzzle is a correct match: the same subtle green mark as on the board.
  ctx.strokeStyle = '#3f9a5c'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.globalAlpha = 0.8;
  for (const e of t.internalEdges) {
    const s = t.slotById.get(e.a), [a, b] = cellEdge(s.row, s.col, e.aDir).map(at), k = 0.32;
    ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k); ctx.lineTo(b.x - (b.x - a.x) * k, b.y - (b.y - a.y) * k); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return { side: S, floors, minFont: minFont === Infinity ? null : minFont, minPicture: minPicture === Infinity ? null : minPicture };
}

export const puzzleLine = content => `${content.shapeName} · ${content.pieceCount} pieces · ${content.pairs} pairs`;
// Every picture URL the record needs (all must load before export).
export const recordImageUrls = content => content.slots.flatMap(s => s.edges.filter(e => e.kind === 'picture').map(e => e.image));
