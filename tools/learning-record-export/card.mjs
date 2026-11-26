// Evidence of Learning — shared learning-record card (A5 default, A6 compact option) (Phase C1 proof of concept). Draws the activity-independent
// parts of a record (branding, details, learning intention, success criteria, statement) onto a 2D canvas context and
// hands a content box to the activity's own renderer (e.g. the Tarsia board). White, print-friendly, no controls.

// Paper formats at 300 dpi. The card is designed in A6 units and scaled up for A5 (same layout, 1.42× larger in print).
export const FORMATS = Object.freeze({ A6: Object.freeze({ id: 'A6', width: 1748, height: 1240, mm: [148, 105] }), A5: Object.freeze({ id: 'A5', width: 2480, height: 1748, mm: [210, 148] }) });
export const DEFAULT_FORMAT = FORMATS.A5; // owner decision (D1 review): A5 default, A6 optional compact format
export const pxToPt = (px, format = DEFAULT_FORMAT) => px * (format.width / FORMATS.A6.width) * 72 / 300;
export const pxToMm = (px, format = DEFAULT_FORMAT) => px * (format.width / FORMATS.A6.width) * 25.4 / 300;

// CARD is the layout grid in A6 design units; every format draws the same layout scaled (k = format.width / CARD.width).
export const CARD = Object.freeze({ width: FORMATS.A6.width, height: FORMATS.A6.height, margin: 60, textWidth: 520,
  ink: '#0c193b', muted: '#5b6b80', accent: '#0d4b8f', ok: '#1f7a45', rule: '#d7dde6',
  font: '"Avenir Next", Avenir, "Segoe UI", Arial, "PingFang SC", "Hiragino Sans GB", sans-serif' });

// Greedy word wrap with an injected measure; long words are never cut.
export function wrapLines(text, maxWidth, measure) {
  const lines = []; let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  return line ? [...lines, line] : lines;
}

const formatDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} record  from buildCompletionRecord()
 * @param {{ emblem?: CanvasImageSource, drawContent: (ctx, box) => void, puzzleLine?: string }} options
 */
export function drawRecordCard(ctx, record, { emblem, drawContent, puzzleLine, format = DEFAULT_FORMAT }) {
  const { width: W, height: H, margin: M, textWidth: TW } = CARD;
  ctx.save();
  const k = format.width / W; // draw in A6 units; A5 is the same card scaled up
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = CARD.rule; ctx.lineWidth = 4; ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const font = (weight, px) => { ctx.font = `${weight} ${px}px ${CARD.font}`; };
  const measureAt = (weight, px) => t => { font(weight, px); return ctx.measureText(t).width; };
  let x = M, y = M + 40;
  if (emblem) { ctx.drawImage(emblem, M, M - 6, 92, 88); x = M + 112; }
  font(700, 56); ctx.fillStyle = CARD.ink; ctx.fillText(record.brand || 'The Mandarin Room', x, y + 10);
  font(500, 32); ctx.fillStyle = CARD.muted; ctx.fillText(`${record.activity.category} · ${record.activity.name} · Learning record`, x, y + 56);
  font(700, 38); ctx.fillStyle = CARD.ok; ctx.textAlign = 'right'; ctx.fillText('Completed ✓', W - M, y + 10); ctx.textAlign = 'left';
  ctx.strokeStyle = CARD.rule; ctx.beginPath(); ctx.moveTo(M, M + 130); ctx.lineTo(W - M, M + 130); ctx.stroke();

  // Details column.
  y = M + 200;
  const rows = [['Name', record.student?.firstName || '—'], ['Class', record.student?.className || '—'], ['Date', formatDate(record.completedAt)],
    ['Vocabulary', record.vocabularySets.map(s => s.title).join(', ')], ['Puzzle', puzzleLine || record.difficulty?.label || ''],
    ['Matching', record.matchingMode.label], ['Matches', `${record.matchesCompleted} of ${record.matchesCompleted} ✓`]];
  for (const [label, value] of rows) {
    font(500, 30); ctx.fillStyle = CARD.muted; ctx.fillText(label, M, y);
    font(650, 31); ctx.fillStyle = CARD.ink;
    for (const line of wrapLines(value, TW - 180, measureAt(650, 31))) { ctx.fillText(line, M + 180, y); y += 42; }
    y += 10;
  }
  y += 18;
  for (const [title, text] of [['Learning intention', record.learningIntention], ['Success criteria', record.successCriteria]]) {
    font(750, 29); ctx.fillStyle = CARD.accent; ctx.fillText(title, M, y); y += 42;
    font(500, 30); ctx.fillStyle = CARD.ink;
    for (const line of wrapLines(text, TW, measureAt(500, 30))) { ctx.fillText(line, M, y); y += 40; }
    y += 22;
  }
  font(500, 23); ctx.fillStyle = CARD.muted;
  wrapLines(record.statement, TW, measureAt(500, 23)).forEach((line, i) => ctx.fillText(line, M, H - M - 40 + i * 30));
  ctx.restore();

  // Activity-specific content (the completed puzzle) on the right: D1 gives it most of the card.
  const box = { x: M + TW + 36, y: M + 146, w: W - (M + TW + 36) - M + 10, h: H - (M + 146) - M + 14 };
  ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0); drawContent(ctx, box); ctx.restore();
  return box;
}
