// Phase C1 proof of concept: real published pictures → completed Tarsia board → A6 learning record → PNG.
await import('../../vocabulary-games-core/shared/solo-runtime-config.mjs');
const { loadCatalogueWithTimeout } = await import('../../vocabulary-games-core/library.mjs');
const { mergeSets } = await import('../../vocabulary-games-core/vocabulary.mjs');
const { createStudentPuzzle, tarsiaCompletionRecord } = await import('../engine/index.mjs');
const { loadAllStrict, ImageLoadError } = await import('../../learning-record-export/image-loader.mjs');
const { drawRecordCard, CARD, FORMATS, pxToPt, pxToMm } = await import('../../learning-record-export/card.mjs');
const { canvasToPngBlob, recordFileName } = await import('../../learning-record-export/export.mjs');
const { drawTarsiaBoard, recordImageUrls, puzzleLine } = await import('../record-board.mjs');

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const relay = u => `/__img?u=${encodeURIComponent(u)}`; // developer relay (stands in for bucket CORS)
const { sets } = await loadCatalogueWithTimeout();
const byTitle = t => sets.find(s => s.title === t);
const C = ['Countries I', 'Countries II', 'Countries III'].map(byTitle);
const solved = p => ({ pieces: Object.fromEntries(p.pieces.map(x => [x.id, { slot: x.home.slot, rotation: x.home.rotation, locked: x.locked }])), tray: [] });
const emblem = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = '../../../assets/brand/emblem-header.png'; });

async function scenario(n, { title, shape, mode, setList, seed, loader, breakOne = false, save, format = FORMATS.A6 }) {
  const chosen = setList.map(i => C[i]);
  const puzzle = createStudentPuzzle({ entries: mergeSets(sets, chosen.map(s => s.id)).entries, templateId: shape, modeId: mode, seed });
  const record = tarsiaCompletionRecord(puzzle, solved(puzzle), { vocabularySets: chosen.map(s => ({ id: s.id, title: s.title, chineseTitle: s.chineseTitle })),
    student: { firstName: 'Mia', className: '5B' }, completedAt: new Date() });
  const urls = recordImageUrls(record.content);
  const row = { n, title, pictures: urls.length };
  try {
    const rewrite = breakOne ? (u => u === urls[0] ? '/__img?u=https%3A%2F%2Fexample.invalid%2Fmissing.webp' : loader(u)) : loader;
    const images = await loadAllStrict(urls, { rewrite });
    const canvas = document.createElement('canvas'); canvas.width = format.width; canvas.height = format.height;
    const ctx = canvas.getContext('2d');
    let stats;
    drawRecordCard(ctx, record, { emblem, format, puzzleLine: puzzleLine(record.content), drawContent: (c, box) => { stats = drawTarsiaBoard(c, box, record.content, images); } });
    const blob = await canvasToPngBlob(canvas);
    const name = `d1-${String(n).padStart(2, '0')}-${format.id}-${shape}-${mode}.png`;
    if (save) await fetch(`/__save?name=${name}`, { method: 'POST', body: blob });
    const url = URL.createObjectURL(blob);
    $('out').insertAdjacentHTML('beforeend', `<figure><img src="${url}" alt="Learning record ${n}"><figcaption>${n}. ${esc(title)} — ${canvas.width}×${canvas.height}, ${(blob.size / 1024).toFixed(0)} KB · file name: ${esc(recordFileName(record))}</figcaption></figure>`);
    Object.assign(row, { ok: true, result: 'exported', png: `${canvas.width}×${canvas.height} · ${(blob.size / 1024).toFixed(0)} KB${save ? ` · saved ${name}` : ''}`,
      board: `${format.id} · smallest text ${stats.minFont?.toFixed(1) ?? '—'} units = ${stats.minFont ? pxToPt(stats.minFont, format).toFixed(1) + ' pt' : '—'} · smallest picture side ${stats.minPicture ? Math.round(stats.minPicture) + ' units = ' + pxToMm(stats.minPicture, format).toFixed(1) + ' mm' : '—'}`,
      print: { format: format.id, minFontPt: stats.minFont ? +pxToPt(stats.minFont, format).toFixed(1) : null, minPictureMm: stats.minPicture ? +pxToMm(stats.minPicture, format).toFixed(1) : null, side: stats.side } });
  } catch (error) {
    Object.assign(row, { ok: false, result: error instanceof ImageLoadError ? `refused: ${error.message} ${error.failures.slice(0, 2).map(f => f.reason).join('; ')}` : `${error.name}: ${error.message}`, png: 'none (no incomplete record)', board: '' });
  }
  $('results').insertAdjacentHTML('beforeend', `<tr><td>${n}</td><td>${esc(title)}</td><td>${row.pictures}</td><td class="${row.ok ? 'ok' : 'bad'}">${esc(row.result)}</td><td>${esc(row.png)}</td><td>${esc(row.board)}</td></tr>`);
  return row;
}

// Root cause in this browser: a picture drawn without CORS taints the canvas; export then throws SecurityError.
async function taintCheck() {
  const url = C[1].items.find(i => i.image).image, img = new Image(); img.src = url; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = 10; canvas.height = 10; canvas.getContext('2d').drawImage(img, 0, 0, 10, 10);
  try { await canvasToPngBlob(canvas); return 'NOT tainted (unexpected)'; } catch (e) { return `${e.name}: canvas is tainted, export refused`; }
}

const rows = [];
// D1 samples. "relay" = real published pictures through the local developer relay (stands in for the approved CORS
// policy, which is NOT applied); "direct" = how Production behaves today.
rows.push(await scenario(1, { title: 'Triangle · Hanzi + Picture · I–III · direct (Production today)', shape: 'triangle-9', mode: 'hanzi-picture', setList: [0, 1, 2], seed: 11, loader: u => u }));
rows.push(await scenario(2, { title: 'Triangle · Hanzi + Picture · I–III · relay · A6', shape: 'triangle-9', mode: 'hanzi-picture', setList: [0, 1, 2], seed: 11, loader: relay, save: true }));
rows.push(await scenario(3, { title: 'Triangle · Hanzi + Picture · I–III · relay · A5', shape: 'triangle-9', mode: 'hanzi-picture', setList: [0, 1, 2], seed: 11, loader: relay, save: true, format: FORMATS.A5 }));
rows.push(await scenario(4, { title: 'Triangle · Pinyin + Picture · II–III (detailed + simple flags) · relay · A6', shape: 'triangle-9', mode: 'pinyin-picture', setList: [1, 2], seed: 4, loader: relay, save: true }));
rows.push(await scenario(5, { title: 'Extended Hexagon · Pinyin + Picture · I–III · relay · A6', shape: 'hexagon-10', mode: 'pinyin-picture', setList: [0, 1, 2], seed: 5, loader: relay, save: true }));
rows.push(await scenario(6, { title: 'Triangle · Hanzi + English · I–III · direct (text only) · A6', shape: 'triangle-9', mode: 'hanzi-english', setList: [0, 1, 2], seed: 7, loader: u => u, save: true }));
rows.push(await scenario(7, { title: 'Triangle · Hanzi + English · I–III · direct (text only) · A5', shape: 'triangle-9', mode: 'hanzi-english', setList: [0, 1, 2], seed: 7, loader: u => u, save: true, format: FORMATS.A5 }));
rows.push(await scenario(8, { title: 'Triangle · Pinyin + Picture · one picture made to fail', shape: 'triangle-9', mode: 'pinyin-picture', setList: [0, 1, 2], seed: 9, loader: relay, breakOne: true }));
const taint = await taintCheck();
const share = typeof navigator.canShare === 'function' ? navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })] }) : 'canShare not available';
window.__poc = { rows, taint, share, toBlob: typeof HTMLCanvasElement.prototype.toBlob === 'function', createImageBitmap: typeof createImageBitmap === 'function' };
$('status').textContent = `Done. Root-cause check: ${taint}. navigator.canShare(files) in this browser: ${share}.`;
