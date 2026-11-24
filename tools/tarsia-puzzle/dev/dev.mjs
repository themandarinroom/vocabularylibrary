// Developer prototype: plain SVG rendering of the engine state. Proves the engine; not the final design.
// The logical state (engine) is the only source of truth; the SVG is redrawn from it after every action.
import {
  LEVELS, MODES, getTemplate, createPuzzle, availableOptions, VocabularyError, randomSeed, normaliseSeed,
  rotatePiece, placePiece, removePiece, resetState, stateProblems, checkCompletion, edgeStatuses, matchCount,
  cellCentroid, cellCorners, cellEdge, UP_DIRS, H, wordBank, tarsiaCompletionRecord
} from '../engine/index.mjs';
import { createGesture } from '../gesture.mjs';
import { catalogueFromSets, mergeSets } from '../../vocabulary-games-core/vocabulary.mjs';
import { FIXTURE_SETS } from './fixtures.mjs';

const S = 150, HS = S * H, PAD = 24;
const $ = id => document.getElementById(id);
const svg = $('svg');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const params = new URLSearchParams(location.search);
if (params.get('panel') === 'hide') document.body.classList.add('no-panel'); // developer screenshots: board at full width

let catalogue = { sets: [] }, puzzle = null, template = null, state = null, layout = null, drag = null;

// ---------- Vocabulary ----------

async function loadSource(source) {
  setMessage(source === 'published' ? 'Loading published vocabulary (read-only)…' : '');
  try {
    if (source === 'published') {
      const config = await import('../../vocabulary-games-core/shared/solo-runtime-config.mjs');
      config.assertSoloRuntime();
      const { loadCatalogueWithTimeout } = await import('../../vocabulary-games-core/library.mjs');
      catalogue = await loadCatalogueWithTimeout();
    } else catalogue = catalogueFromSets(FIXTURE_SETS, { allowData: true });
    setMessage(source === 'published' ? `${catalogue.sets.length} published sets loaded.` : '');
  } catch (error) {
    catalogue = { sets: [] }; setMessage(`Could not load vocabulary: ${error.message}`, true);
  }
  const wanted = (params.get('sets') || '').split(',').filter(Boolean);
  $('sets').innerHTML = catalogue.sets.map((set, i) => `<label><input type="checkbox" value="${esc(set.id)}" ${
    (wanted.length ? wanted.includes(set.id) : source === 'fixtures' && i < 2) ? 'checked' : ''}> ${esc(set.title)} <span class="help">(${set.items.length})</span></label>`).join('');
  refreshOptions();
}
const selectedSetIds = () => [...$('sets').querySelectorAll('input:checked')].map(i => i.value);
const pool = () => mergeSets(catalogue.sets, selectedSetIds());

// ---------- Setup options (only compatible combinations are offered) ----------

function refreshOptions() {
  const level = LEVELS[$('level').value];
  const { entries, duplicates } = pool();
  const options = availableOptions(entries, level.id);
  const currentMode = $('mode').value;
  $('mode').innerHTML = options.map(o => `<option value="${o.modeId}">${o.label} (${o.usable} usable words)</option>`).join('');
  if (options.some(o => o.modeId === currentMode)) $('mode').value = currentMode;
  const mode = options.find(o => o.modeId === $('mode').value);
  $('shape').innerHTML = mode.shapes.map(s => `<option value="${s.templateId}" ${s.available ? '' : 'disabled'}>${s.name} · ${s.pieceCount} pieces · ${s.requiredPairs} words${s.available ? '' : ' (not enough words)'}</option>`).join('');
  const shape = mode.shapes.find(s => s.available) || mode.shapes[0];
  $('shape').value = shape.templateId;
  const t = getTemplate(shape.templateId);
  $('start').innerHTML = t.startingConfigurations.filter(c => c.slots.length === level.startingPieces)
    .map(c => `<option value="${c.id}" ${c.id === level.defaultStart[t.id] ? 'selected' : ''}>${c.name}</option>`).join('');
  $('pool').textContent = `${entries.length} different words selected${duplicates ? ` (${duplicates} repeated across sets, counted once)` : ''}.`;
  $('generate').disabled = !shape.available;
  if (!shape.available) setMessage(shape.reason, true); else if ($('message').classList.contains('error')) setMessage('');
}
function setMessage(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }

// ---------- Puzzle lifecycle ----------

function start() {
  const seed = $('seed').value.trim() || String(randomSeed());
  $('seed').value = seed;
  try {
    puzzle = createPuzzle({ entries: pool().entries, levelId: $('level').value, modeId: $('mode').value,
      templateId: $('shape').value, startConfigId: $('start').value, seed: /^\d+$/.test(seed) ? Number(seed) : seed });
  } catch (error) {
    setMessage(error instanceof VocabularyError ? `${error.message} ${error.details.reasons.join('; ')}.` : error.message, true);
    return;
  }
  template = getTemplate(puzzle.templateId);
  state = resetState(puzzle);
  setMessage(`Seed ${puzzle.seed} · ${MODES[puzzle.modeId].label} · ${template.name}`);
  const query = new URLSearchParams({ level: puzzle.levelId, mode: puzzle.modeId, start: puzzle.startConfigId, seed: $('seed').value });
  const sourceValue = document.querySelector('input[name=source]:checked').value;
  if (sourceValue === 'published') query.set('source', 'published');
  query.set('sets', selectedSetIds().join(','));
  if (params.get('panel')) query.set('panel', params.get('panel'));
  history.replaceState(null, '', `?${query}`);
  layout = computeLayout();
  render();
}

function apply(result) {
  if (result.ok) state = result.state;
  render();
  return result;
}

// ---------- Layout ----------

function computeLayout() {
  const corners = template.slots.flatMap(s => cellCorners(s.row, s.col));
  const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
  const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
  const boardW = (maxX - minX) * S, boardH = (maxY - minY) * S;
  const toPx = p => ({ x: PAD + (p.x - minX) * S, y: PAD + (p.y - minY) * S });
  const cellW = S * 1.08, cellH = HS * 1.42;
  const cols = Math.max(4, Math.floor((boardW) / cellW));
  const width = Math.max(boardW, cols * cellW) + 2 * PAD;
  const trayTop = PAD + boardH + 40;
  const rows = Math.ceil(puzzle.pieces.length / cols);
  const height = trayTop + 22 + rows * cellH + PAD;
  const slotPx = new Map(template.slots.map(s => [s.id, toPx(cellCentroid(s.row, s.col))]));
  const trayPos = i => ({ x: PAD + (i % cols) * cellW + cellW / 2, y: trayTop + 22 + Math.floor(i / cols) * cellH + cellH * 0.5 });
  return { toPx, width, height, trayTop, slotPx, trayPos, cols, cellW, cellH };
}

// ---------- Rendering ----------

const TRI_PATH = `M0 ${-2 * HS / 3} L${S / 2} ${HS / 3} L${-S / 2} ${HS / 3} Z`;
function labelSvg(label, edgeIndex) {
  if (!label) return '';
  const theta = UP_DIRS[edgeIndex], rad = theta * Math.PI / 180;
  const d = HS / 3 - S * (label.kind === 'picture' ? 0.13 : 0.075);
  const x = d * Math.sin(rad), y = -d * Math.cos(rad);
  const rot = label.side === 'A' ? theta - 180 : theta; // A: baseline towards the edge; B: top towards it
  if (label.kind === 'picture') {
    const size = S * 0.22;
    return `<image href="${esc(label.image)}" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" transform="translate(${x} ${y}) rotate(${rot})"/>`;
  }
  const units = [...label.text].reduce((sum, ch) => sum + (/[㐀-鿿]/.test(ch) ? 1 : 0.56), 0);
  const size = Math.min(S * 0.11, (S * 0.52) / Math.max(units, 1));
  return `<text class="label ${label.kind}" style="font-size:${size.toFixed(1)}px" transform="translate(${x} ${y}) rotate(${rot})" lang="${label.kind === 'hanzi' ? 'zh-Hans' : 'en'}">${esc(label.text)}</text>`;
}
function pieceSvg(piece, pos, rotation, locked) {
  return `<g class="piece${locked ? ' locked' : ''}" data-id="${piece.id}" transform="translate(${pos.x} ${pos.y})"><g transform="rotate(${rotation * 60})">` +
    `<path d="${TRI_PATH}"/>${piece.edges.map(labelSvg).join('')}</g></g>`;
}

function render() {
  if (!puzzle) return;
  const { width, height, trayTop, slotPx, trayPos, toPx } = layout;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const parts = [];
  for (const slot of template.slots) {
    const pts = cellCorners(slot.row, slot.col).map(toPx).map(p => `${p.x},${p.y}`).join(' ');
    parts.push(`<polygon class="slot" data-slot="${slot.id}" points="${pts}"/>`);
  }
  parts.push(`<rect class="tray-bg" x="${PAD / 2}" y="${trayTop}" width="${width - PAD}" height="${height - trayTop - PAD / 2}" rx="10"/>`,
    `<text class="tray-caption" x="${PAD}" y="${trayTop + 18}">Pieces (${state.tray.length})</text>`);
  for (const piece of puzzle.pieces) {
    const p = state.pieces[piece.id];
    if (p.slot) parts.push(pieceSvg(piece, slotPx.get(p.slot), p.rotation, p.locked));
  }
  state.tray.forEach((id, i) => parts.push(pieceSvg(puzzle.pieces.find(p => p.id === id), trayPos(i), state.pieces[id].rotation, false)));
  for (const edge of edgeStatuses(puzzle, state, template)) if (edge.status === 'match') {
    const slot = template.slotById.get(edge.a);
    const [a, b] = cellEdge(slot.row, slot.col, edge.aDir).map(toPx);
    const k = 0.18; // short centre segment only: subtle feedback
    parts.push(`<line class="match" x1="${a.x + (b.x - a.x) * k}" y1="${a.y + (b.y - a.y) * k}" x2="${b.x - (b.x - a.x) * k}" y2="${b.y - (b.y - a.y) * k}"/>`);
  }
  svg.innerHTML = parts.join('');
  const matches = matchCount(puzzle, state, template);
  $('progress').textContent = `${matches} / ${template.requiredPairs} matches · ${puzzle.pieces.length - state.tray.length} / ${puzzle.pieces.length} placed`;
  renderDone(); renderBank(); renderDebug();
}

function renderDone() {
  const verdict = checkCompletion(puzzle, state, template);
  const panel = $('done');
  if (!verdict.complete) { panel.hidden = true; panel.innerHTML = ''; return; }
  if (!panel.hidden) return;
  panel.hidden = false;
  panel.innerHTML = `<strong>Puzzle complete — ${template.requiredPairs} matches!</strong>
    <p class="help">Proposed Evidence of Learning record. Layout proposal only: the real PNG export (1748 × 1240, made on this device) is Phase B. Nothing is saved or uploaded.</p>
    <label>First name (optional) <input id="rec-name" size="16" autocomplete="off"></label>
    <label>Class (optional) <input id="rec-class" size="8" autocomplete="off"></label>
    <div id="rec-preview"></div>
    <details><summary>Record data (JSON)</summary><pre id="rec"></pre></details>`;
  const update = () => {
    const vocabularySets = pool().sets.map(s => ({ id: s.id, title: s.title, chineseTitle: s.chineseTitle }));
    const record = tarsiaCompletionRecord(puzzle, state, { vocabularySets, student: { firstName: $('rec-name').value, className: $('rec-class').value } });
    $('rec').textContent = JSON.stringify({ ...record, content: `${record.content.slots.length} slots (${record.content.kind})` }, null, 2);
    $('rec-preview').innerHTML = recordPreviewSvg(record);
  };
  panel.addEventListener('input', update); update();
}

// ---------- Evidence of Learning: layout proposal drawn only from the record (A6 landscape, 1748 × 1240) ----------

function wrap(text, max) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) { if ((line + ' ' + word).trim().length > max) { lines.push(line); line = word; } else line = (line + ' ' + word).trim(); }
  return line ? [...lines, line] : lines;
}
function recordBoardSvg(content, box) {
  const corners = content.slots.flatMap(s => cellCorners(s.row, s.col));
  const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
  const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
  const side = Math.min(box.w / (maxX - minX), box.h / (maxY - minY));
  const ox = box.x + (box.w - (maxX - minX) * side) / 2, oy = box.y + (box.h - (maxY - minY) * side) / 2;
  const px = p => ({ x: ox + (p.x - minX) * side, y: oy + (p.y - minY) * side });
  const out = [];
  for (const slot of content.slots) {
    out.push(`<polygon points="${cellCorners(slot.row, slot.col).map(px).map(p => `${p.x},${p.y}`).join(' ')}" fill="#fff" stroke="#31507a" stroke-width="3"/>`);
    const c = px(cellCentroid(slot.row, slot.col));
    for (const edge of slot.edges) {
      if (edge.blank) continue;
      const rad = edge.dir * Math.PI / 180, d = side * H / 3 - side * (edge.kind === 'picture' ? 0.13 : 0.075);
      const x = c.x + d * Math.sin(rad), y = c.y - d * Math.cos(rad), rot = edge.side === 'A' ? edge.dir - 180 : edge.dir;
      if (edge.kind === 'picture') { const z = side * 0.22; out.push(`<image href="${esc(edge.image)}" x="${-z / 2}" y="${-z / 2}" width="${z}" height="${z}" transform="translate(${x} ${y}) rotate(${rot})"/>`); continue; }
      const units = [...edge.text].reduce((sum, ch) => sum + (/[\u3400-\u9fff]/.test(ch) ? 1 : 0.56), 0);
      const size = Math.min(side * 0.11, (side * 0.52) / Math.max(units, 1));
      out.push(`<text class="label ${edge.kind}" style="font-size:${size.toFixed(1)}px" transform="translate(${x} ${y}) rotate(${rot})">${esc(edge.text)}</text>`);
    }
  }
  return out.join('');
}
function recordPreviewSvg(record) {
  const date = new Date(`${record.completedAt}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const rows = [
    ['Name', record.student.firstName || '—'], ['Class', record.student.className || '—'], ['Date', date],
    ['Vocabulary', record.vocabularySets.map(s => s.title).join(', ')], ['Level', record.difficulty.label],
    ['Matching', record.matchingMode.label], ['Matches', `${record.matchesCompleted} of ${record.matchesCompleted} ✓`]
  ];
  const t = [];
  let y = 330;
  for (const [k, v] of rows) {
    t.push(`<text x="90" y="${y}" font-size="34" fill="#617797">${k}</text>`);
    for (const line of wrap(String(v), 30)) { t.push(`<text x="300" y="${y}" font-size="34" font-weight="600">${esc(line)}</text>`); y += 46; }
    y += 10;
  }
  y += 30;
  for (const [title, text] of [['Learning intention', record.learningIntention], ['Success criteria', record.successCriteria]]) {
    t.push(`<text x="90" y="${y}" font-size="30" font-weight="700" fill="#0d4b8f">${title}</text>`); y += 46;
    for (const line of wrap(text, 46)) { t.push(`<text x="90" y="${y}" font-size="32">${esc(line)}</text>`); y += 44; }
    y += 24;
  }
  const statement = wrap(record.statement, 78).map((line, i) => `<text x="90" y="${1160 + i * 34}" font-size="26" fill="#617797">${esc(line)}</text>`).join('');
  return `<svg class="record-preview" viewBox="0 0 1748 1240" role="img" aria-label="Proposed learning record">
    <rect width="1748" height="1240" fill="#fff"/><rect x="20" y="20" width="1708" height="1200" fill="none" stroke="#c9d1e0" stroke-width="4" rx="24"/>
    <text x="90" y="140" font-size="64" font-weight="700" fill="#0c193b">The Mandarin Room</text>
    <text x="90" y="200" font-size="36" fill="#617797">${esc(record.activity.category)} · ${esc(record.activity.name)} · Learning record</text>
    <text x="1658" y="140" font-size="40" font-weight="700" fill="#1f9d55" text-anchor="end">Completed ✓</text>
    <line x1="90" y1="240" x2="1658" y2="240" stroke="#dde2ec" stroke-width="4"/>
    ${t.join('')}${recordBoardSvg(record.content, { x: 900, y: 270, w: 770, h: 840 })}${statement}</svg>`;
}
function renderBank() {
  const bank = $('bank');
  if (bank.hidden) return;
  bank.innerHTML = wordBank(puzzle).map(w => `<div>${w.image ? `<img src="${esc(w.image)}" alt="">` : ''}<strong lang="zh-Hans">${esc(w.hanzi)}</strong><br>${esc(w.pinyin)}<br><span class="help">${esc(w.english)}</span></div>`).join('');
}
function renderDebug() {
  const out = $('debug-out');
  out.hidden = !$('debug').checked;
  if (out.hidden) return;
  const statuses = edgeStatuses(puzzle, state, template);
  out.textContent = JSON.stringify({ seed: puzzle.seed, template: puzzle.templateId, mode: puzzle.modeId, start: puzzle.startConfigId,
    invariants: stateProblems(puzzle, state, template), edges: Object.fromEntries(['open', 'match', 'mismatch'].map(s => [s, statuses.filter(e => e.status === s).length])),
    completion: checkCompletion(puzzle, state, template).problems.slice(0, 6), state }, null, 1);
}

// ---------- Interaction: tap rotates, drag moves (pointer events, iPad-safe) ----------

function svgPoint(event) {
  const pt = svg.createSVGPoint(); pt.x = event.clientX; pt.y = event.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function currentCentre(id) {
  const p = state.pieces[id];
  return p.slot ? layout.slotPx.get(p.slot) : layout.trayPos(state.tray.indexOf(id));
}
svg.addEventListener('pointerdown', event => {
  // A second finger while a piece is held (pinch, two-finger scroll) cancels the gesture: no turn, no move.
  if (drag) { if (event.pointerId !== drag.pointerId) cancelGesture(); return; }
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const el = event.target.closest('.piece');
  if (!el || el.classList.contains('locked')) return;
  event.preventDefault();
  const id = el.dataset.id, start = svgPoint(event), centre = currentCentre(id);
  drag = { id, el, pointerId: event.pointerId, offset: { x: start.x - centre.x, y: start.y - centre.y }, target: null,
    gesture: createGesture({ pointerType: event.pointerType, x: event.clientX, y: event.clientY, time: event.timeStamp }) };
  el.setPointerCapture(event.pointerId);
});
svg.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const wasDragging = drag.gesture.dragging;
  if (!drag.gesture.move(event.clientX, event.clientY)) return; // still within the tap allowance
  if (!wasDragging) { drag.el.classList.add('dragging'); svg.appendChild(drag.el); }
  const p = svgPoint(event), c = { x: p.x - drag.offset.x, y: p.y - drag.offset.y };
  drag.el.setAttribute('transform', `translate(${c.x} ${c.y})`);
  const target = nearestSlot(c);
  if (target !== drag.target) {
    svg.querySelector('.slot.target')?.classList.remove('target');
    if (target) svg.querySelector(`[data-slot="${target}"]`)?.classList.add('target');
    drag.target = target;
  }
});
function cancelGesture() {
  if (!drag) return;
  drag.gesture.cancel();
  try { drag.el.releasePointerCapture(drag.pointerId); } catch { /* already released */ }
  drag = null; render(); // the piece goes back exactly where it was
}
function nearestSlot(c) {
  let best = null, bestD = S * 0.42;
  for (const [id, p] of layout.slotPx) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bestD) { best = id; bestD = d; } }
  return best;
}
function finish(event, cancelled) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const { id, target, offset, gesture } = drag;
  drag = null;
  const kind = cancelled ? gesture.cancel() : gesture.end(event.timeStamp);
  if (kind === 'tap') { apply(rotatePiece(state, template, id)); return; }
  if (kind !== 'drag') { render(); return; } // long press or cancelled: nothing happens
  const p = svgPoint(event), c = { x: p.x - offset.x, y: p.y - offset.y };
  if (target) {
    const result = apply(placePiece(state, template, id, target));
    if (!result.ok) setMessage(result.reason === 'occupied' ? 'That space is already taken.' : `Not placed (${result.reason}).`);
  } else if (c.y > layout.trayTop - S * 0.3) {
    const col = Math.max(0, Math.min(layout.cols - 1, Math.floor((c.x - PAD) / layout.cellW)));
    const row = Math.max(0, Math.floor((c.y - layout.trayTop - 22) / layout.cellH));
    apply(removePiece(state, template, id, row * layout.cols + col));
  } else render(); // dropped elsewhere: the piece goes back where it was
}
svg.addEventListener('pointerup', event => finish(event, false));
svg.addEventListener('pointercancel', event => finish(event, true));
svg.addEventListener('contextmenu', event => event.preventDefault()); // no long-press menu on pieces

// ---------- Controls ----------

document.querySelectorAll('input[name=source]').forEach(r => r.addEventListener('change', () => loadSource(r.value)));
$('sets').addEventListener('change', refreshOptions);
$('level').addEventListener('change', refreshOptions);
$('mode').addEventListener('change', refreshOptions);
$('new-seed').addEventListener('click', () => { $('seed').value = String(randomSeed()); start(); });
$('generate').addEventListener('click', start);
$('reset').addEventListener('click', () => { if (puzzle) { state = resetState(puzzle); $('done').hidden = true; render(); } });
$('solve').addEventListener('click', () => {
  if (!puzzle) return;
  state = { pieces: Object.fromEntries(puzzle.pieces.map(p => [p.id, { slot: p.home.slot, rotation: p.home.rotation, locked: p.locked }])), tray: [] };
  render();
});
$('bank-toggle').addEventListener('click', () => {
  const bank = $('bank'); bank.hidden = !bank.hidden; $('bank-toggle').setAttribute('aria-expanded', String(!bank.hidden)); if (puzzle) renderBank();
});
$('debug').addEventListener('change', () => puzzle && renderDebug());

// Initial state from the URL (reproducible puzzles).
if (params.get('level') in LEVELS) $('level').value = params.get('level');
$('seed').value = params.get('seed') || String(normaliseSeed(randomSeed()));
const initialSource = params.get('source') === 'published' ? 'published' : 'fixtures';
document.querySelector(`input[name=source][value=${initialSource}]`).checked = true;
await loadSource(initialSource);
if (params.get('mode')) { $('mode').value = params.get('mode'); refreshOptions(); }
if (params.get('start')) $('start').value = params.get('start');
if (!$('generate').disabled) start();
