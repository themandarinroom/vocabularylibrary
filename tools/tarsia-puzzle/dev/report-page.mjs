// Developer page: runs the Phase B1 validation on live published vocabulary (read-only) and probes the flag images.
import { vocabularyReport } from './vocabulary-report.mjs';
import { MODES } from '../engine/index.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const params = new URLSearchParams(location.search);
const TITLES = (params.get('titles') || 'Countries I,Countries II,Countries III').split(',');
const SEEDS = Number(params.get('seeds') || 500);

// Live read through the same loader as Bingo Solo / Great Wall. The loader falls back to a browser cache on
// failure and only says so with console.warn, so watch for that to label the data source honestly.
const warnings = [], warn = console.warn;
console.warn = (...args) => { warnings.push(args.map(String).join(' ')); warn(...args); };
const config = await import('../../vocabulary-games-core/shared/solo-runtime-config.mjs');
config.assertSoloRuntime();
const { loadCatalogueWithTimeout } = await import('../../vocabulary-games-core/library.mjs');
const catalogue = await loadCatalogueWithTimeout();
console.warn = warn;
const source = warnings.some(w => w.includes('Vocabulary Cloud')) ? 'BROWSER CACHE FALLBACK (live read failed)' : 'live Firestore read (published sets, anonymous, read-only)';

const ids = TITLES.map(t => catalogue.sets.find(s => s.title === t)?.id).filter(Boolean);
const missingTitles = TITLES.filter(t => !catalogue.sets.some(s => s.title === t));
const report = vocabularyReport(catalogue.sets, ids, { seeds: SEEDS });
const titleOf = id => catalogue.sets.find(s => s.id === id)?.title || id;

// ---- Flag images: size, aspect ratio, CORS (needed later for canvas PNG export), byte identity, visual similarity ----
async function probe(entry) {
  const result = { key: entry.key, set: titleOf(entry.setId), word: entry.chinese, english: entry.english, url: entry.image };
  const plain = new Image(); plain.decoding = 'async'; plain.src = entry.image;
  try { await plain.decode(); result.width = plain.naturalWidth; result.height = plain.naturalHeight; result.aspect = +(plain.naturalWidth / plain.naturalHeight).toFixed(3); }
  catch { result.loadError = true; return result; }
  try {
    const response = await fetch(entry.image, { mode: 'cors' });
    const bytes = await response.arrayBuffer();
    result.corsFetch = response.ok; result.bytes = bytes.byteLength; result.contentType = response.headers.get('content-type');
    result.sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) { result.corsFetch = false; result.corsError = String(error); }
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = entry.image;
  try {
    await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 16;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 24, 16);
    result.thumb = [...ctx.getImageData(0, 0, 24, 16).data];
    canvas.toDataURL('image/png'); // throws if the canvas is tainted
    result.canvasExport = true;
  } catch (error) { result.canvasExport = false; result.canvasError = String(error); }
  return result;
}
const entries = ids.flatMap(id => catalogue.sets.find(s => s.id === id).items).filter(e => e.image);
const images = await Promise.all(entries.map(probe));
const similar = [];
for (let i = 0; i < images.length; i++) for (let j = i + 1; j < images.length; j++) {
  const a = images[i].thumb, b = images[j].thumb;
  if (!a || !b) continue;
  let diff = 0; for (let k = 0; k < a.length; k += 4) diff += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
  similar.push({ a: `${images[i].word} ${images[i].english}`, b: `${images[j].word} ${images[j].english}`, difference: +(diff / (a.length / 4) / 765).toFixed(3),
    sameBytes: images[i].sha256 && images[i].sha256 === images[j].sha256 });
}
similar.sort((x, y) => x.difference - y.difference);
images.forEach(i => delete i.thumb);
window.__report = { source, warnings, missingTitles, ids, report, images, mostSimilarFlags: similar.slice(0, 12), seeds: SEEDS };

// ---- Render ----
const yn = v => `<span class="${v ? 'yes' : 'no'}">${v ? 'yes' : 'no'}</span>`;
const html = [];
html.push(`<p><strong>Source:</strong> ${esc(source)} · ${catalogue.sets.length} published sets · seeds per available mode: ${SEEDS}</p>`);
if (missingTitles.length) html.push(`<p class="message error">Not found in published data: ${esc(missingTitles.join(', '))}. No substitute data was used.</p>`);
html.push('<h2>Sets</h2><table><tr><th>Set</th><th>ID</th><th>Items</th><th>No Pinyin</th><th>No English</th><th>No own picture</th></tr>' +
  report.sets.map(s => `<tr><td>${esc(s.title)} ${esc(s.chineseTitle)}</td><td>${esc(s.id)}</td><td>${s.items}</td><td>${s.missing.pinyin.length}</td><td>${s.missing.english.length}</td><td>${s.missing.picture.length}</td></tr>`).join('') + '</table>');
const modeIds = Object.keys(MODES);
html.push('<h2>Combinations × modes (usable unambiguous words / required)</h2><table><tr><th>#</th><th>Sets</th><th>Words</th>' +
  modeIds.map(m => `<th>${esc(MODES[m].label)}</th>`).join('') + '</tr>' +
  report.combinations.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.setIds.map(titleOf).join(' + '))}</td><td>${c.total}</td>` +
    modeIds.map(m => { const r = c.modes.find(x => x.modeId === m); return `<td>${r.usable}/${r.required} ${yn(r.available)}${r.available ? `<br><small>${r.seeds} seeds, ${r.failures} failures, ${r.wordsOutsideSelection} outside</small>` : `<br><small>${esc(r.refusal)}</small>`}</td>`; }).join('') + '</tr>').join('') + '</table>');
html.push('<h2>Collisions kept apart by the ambiguity policy (all three sets)</h2><table><tr><th>Type</th><th>Key</th><th>Words</th></tr>' +
  Object.entries(report.ambiguity).flatMap(([type, groups]) => groups.map(g => `<tr><td>${type}</td><td>${esc(g.key)}</td><td>${esc(g.words.join(' | '))}</td></tr>`)).join('') + '</table>');
html.push('<h2>Flag images</h2><div class="flags">' + images.map(i => `<figure><img src="${esc(i.url)}" alt=""><figcaption>${esc(i.word)} · ${esc(i.english)}<br>${i.width}×${i.height} (${i.aspect}) · CORS ${i.canvasExport ? 'ok' : 'blocked'}</figcaption></figure>`).join('') + '</div>');
html.push('<h2>Most similar flag pairs (24×16 colour comparison, 0 = identical)</h2><table><tr><th>A</th><th>B</th><th>Difference</th><th>Same file bytes</th></tr>' +
  similar.slice(0, 12).map(s => `<tr><td>${esc(s.a)}</td><td>${esc(s.b)}</td><td>${s.difference}</td><td>${s.sameBytes ? 'yes' : 'no'}</td></tr>`).join('') + '</table>');
$('out').innerHTML = html.join('');
$('status').textContent = 'Done.';
