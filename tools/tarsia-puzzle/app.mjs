// Tarsia Puzzle v0.1 — Student Setup (Phase B2). No sign-in, no saving, no writes.
// All rules live in setup-model.mjs and the engine; this file only draws and listens.
import { loadCatalogueWithTimeout } from '../vocabulary-games-core/library.mjs';
import { setupView, setGroups, selectionFromParams, selectionToParams } from './setup-model.mjs';
import { getTemplate, cellCorners, randomSeed } from './engine/index.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let sets = [], selection = selectionFromParams(new URLSearchParams(location.search)), view = null;

// ---------- Vocabulary (read-only, through the shared Library loader) ----------
async function load() {
  $('load-status').textContent = 'Loading published vocabulary…';
  $('sets').setAttribute('aria-busy', 'true');
  // The loader falls back to this browser's last copy when the live read fails and only says so in a warning.
  const warnings = [], warn = console.warn;
  console.warn = (...args) => { warnings.push(args.map(String).join(' ')); warn(...args); };
  try {
    sets = (await loadCatalogueWithTimeout()).sets.filter(s => s.items.length);
    const cached = warnings.some(w => w.includes('Vocabulary Cloud'));
    $('load-status').textContent = !sets.length ? 'No published vocabulary could be loaded. Check your connection and choose Reload vocabulary.'
      : cached ? `Showing the vocabulary saved on this device (${sets.length} sets). Check your connection for the newest words.`
      : `${sets.length} published Vocabulary Sets.`;
  } catch {
    sets = [];
    $('load-status').textContent = 'Vocabulary could not be loaded. Check your connection and choose Reload vocabulary.';
  } finally { console.warn = warn; $('sets').setAttribute('aria-busy', 'false'); }
  render();
  // Bring the first chosen set into view inside the set list (not the page), e.g. after following a shared link.
  const first = document.querySelector('.set-card:has(input:checked)'), list = $('sets');
  if (first) list.scrollTop = first.offsetTop - 8; // .set-cards is the offset parent
}

// ---------- Drawing ----------
function shapeIcon(templateId, w = 58, h = 50) {
  const t = getTemplate(templateId), tris = t.slots.map(s => cellCorners(s.row, s.col)), all = tris.flat();
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x)), minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  const k = Math.min((w - 4) / (maxX - minX), (h - 4) / (maxY - minY)), ox = (w - (maxX - minX) * k) / 2, oy = (h - (maxY - minY) * k) / 2;
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${tris.map(tri => `<polygon points="${tri.map(p => `${(ox + (p.x - minX) * k).toFixed(1)},${(oy + (p.y - minY) * k).toFixed(1)}`).join(' ')}" fill="#fffdf6" stroke="#176a5a" stroke-width="1.4"/>`).join('')}</svg>`;
}
const part = l => !l ? '<span>—</span>' : l.kind === 'picture' ? `<img src="${esc(l.image)}" alt="">`
  : `<span class="${l.kind}"${l.kind === 'hanzi' ? ' lang="zh-Hans"' : ''}>${esc(l.text)}</span>`;

function render() {
  view = setupView(sets, selection);
  selection = view.selection;
  const chosen = new Set(selection.setIds);
  $('sets').innerHTML = sets.length ? setGroups(sets).map(g => `<p class="year-title">${esc(g.label)}</p><div class="card-grid">${g.sets.map(s => `
    <label class="set-card"><input class="choice-input" type="checkbox" name="set" value="${esc(s.id)}" ${chosen.has(s.id) ? 'checked' : ''}>
      <span class="tz-cover">${s.cover ? `<img src="${esc(s.cover)}" alt="" loading="lazy" decoding="async">` : '<span class="tz-placeholder" lang="zh-Hans" aria-hidden="true">词</span>'}</span>
      <span class="meta"><strong>${esc(s.title)}</strong>${s.chineseTitle ? `<span class="zh" lang="zh-Hans">${esc(s.chineseTitle)}</span>` : ''}<small>${s.items.length} words</small></span>
      <span class="tick" aria-hidden="true">✓</span></label>`).join('')}</div>`).join('') : '<p class="help">No Vocabulary Sets yet.</p>';
  $('chosen-badge').textContent = `${view.setCount} chosen`;
  $('set-summary').textContent = view.setCount ? `${view.setCount} ${view.setCount === 1 ? 'set' : 'sets'} · ${view.words} different words${view.duplicates ? ` (${view.duplicates} repeated, counted once)` : ''}` : '';

  $('shapes').innerHTML = '<legend class="sr-only">Puzzle shape</legend>' + view.shapes.map(sh => `
    <label class="choice shape-choice${sh.available ? '' : ' unavailable'}"><input class="choice-input" type="radio" name="shape" value="${sh.templateId}" ${sh.selected ? 'checked' : ''}>${shapeIcon(sh.templateId, 70, 60)}
      <span><strong>${esc(sh.name)}</strong><small>${sh.pieceCount} pieces · ${sh.requiredPairs} word pairs</small>${sh.available || !view.setCount ? '' : `<small class="need">${esc(sh.reason)}</small>`}</span></label>`).join('');

  $('modes').innerHTML = '<legend class="sr-only">Matching</legend>' + view.modes.map(m => `
    <label class="mode${m.available ? '' : ' unavailable'}"><input class="choice-input" type="radio" name="mode" value="${m.modeId}" ${m.selected ? 'checked' : ''}>
      <span class="mode-top"><strong>${esc(m.label)}</strong><span class="count ${m.available ? 'ok' : 'short'}">${m.available ? `${m.usable} words ready` : `${m.usable} of ${m.required} words`}</span></span>
      ${m.example ? `<span class="example" aria-hidden="true">${part(m.example[0])}<span class="pair-line"></span>${part(m.example[1])}</span>` : ''}</label>`).join('');

  const f = view.feedback;
  $('setup-feedback').innerHTML = !f || !sets.length ? '' : `<div class="tz-feedback">${f.kind === 'too-few'
    ? `<strong>The ${esc(f.shapeName)} needs ${f.required} different words.</strong>Your sets have ${f.usable} ${f.usable === 1 ? 'word' : 'words'} that work with ${esc(f.modeLabel)}. Add another Vocabulary Set${f.smallerShapes.length ? `, or choose a smaller shape (${esc(f.smallerShapes.join(', '))})` : ''}.`
    : `<strong>${esc(f.message)}</strong>`}
    ${f.suggestions.length ? `<div class="suggest">${f.suggestions.map(s => `<button type="button" data-add="${esc(s.id)}" aria-label="Add ${esc(s.title)}">+ ${esc(s.title)}</button>`).join('')}</div>` : ''}</div>`;
  const readyText = view.ready ? `Ready: ${view.summary}` : 'Not ready yet — choose your words.';
  $('ready').textContent = readyText;
  $('touch-ready').textContent = view.ready ? readyText : f?.kind === 'too-few'
    ? `The ${f.shapeName} needs ${f.required} words · you have ${f.usable}.` : 'Choose one or more Vocabulary Sets to begin.';
  $('start').disabled = !view.ready; $('touch-start-button').disabled = !view.ready;
  $('touch-start').hidden = false;
  history.replaceState(null, '', `?${selectionToParams(selection)}`);
}

// ---------- Hero: a finished long-hexagon board drawn from the real template ----------
function hero() {
  const t = getTemplate('hexagon-10');
  const words = [['zhong guo', 'China'], ['ri ben', 'Japan'], ['fa guo', 'France'], ['de guo', 'Germany'], ['yin du', 'India'], ['tai guo', 'Thailand'],
    ['xi la', 'Greece'], ['han guo', 'South Korea'], ['yue nan', 'Vietnam'], ['yi da li', 'Italy'], ['mei guo', 'United States']];
  const S = 104, ox = 52, oy = 60, pt = p => ({ x: ox + (p.x + 0.5) * S, y: oy + p.y * S });
  const tris = t.slots.map((s, i) => `<polygon points="${cellCorners(s.row, s.col).map(pt).map(p => `${p.x},${p.y}`).join(' ')}" fill="${i % 3 ? '#fffdf6' : '#eef6ea'}" stroke="#176a5a" stroke-width="2"/>`).join('');
  const edgeEnds = (s, dir) => { const c = cellCorners(s.row, s.col); return s.up ? (dir === 300 ? [c[2], c[0]] : dir === 60 ? [c[0], c[1]] : [c[1], c[2]]) : (dir === 0 ? [c[0], c[1]] : dir === 120 ? [c[1], c[2]] : [c[2], c[0]]); };
  const pairs = t.internalEdges.map((e, i) => {
    const [a, b] = edgeEnds(t.slotById.get(e.a), e.aDir).map(pt);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, r = ang > 90 || ang < -90 ? ang + 180 : ang;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#2b9c72" stroke-width="4" stroke-linecap="round" opacity=".55"/>
      <g transform="translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${r})"><text y="-7" text-anchor="middle" font-size="12" fill="#b0170e" font-weight="600">${words[i][0]}</text><text y="15" text-anchor="middle" font-size="12" fill="#0d4b8f">${words[i][1]}</text></g>`;
  }).join('');
  $('hero-art').innerHTML = tris + pairs;
}

// ---------- Events ----------
document.addEventListener('change', event => {
  const input = event.target;
  if (input.name === 'set') selection = { ...selection, setIds: input.checked ? [...selection.setIds, input.value] : selection.setIds.filter(id => id !== input.value) };
  else if (input.name === 'mode') selection = { ...selection, modeId: input.value };
  else if (input.name === 'shape') selection = { ...selection, templateId: input.value };
  else return;
  render();
  // Keep keyboard focus on the control the student just used.
  document.querySelector(`input[name="${input.name}"][value="${CSS.escape(input.value)}"]`)?.focus({ preventScroll: true });
});
document.addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  if (add) { selection = { ...selection, setIds: [...selection.setIds, add.dataset.add] }; render(); $('start').focus({ preventScroll: true }); }
});
async function start() {
  if (!view?.ready) return;
  const { createStudentPuzzle, getTemplate: template } = await import('./engine/index.mjs');
  const { openWorkspace } = await import('./workspace.mjs');
  const { mergeSets } = await import('../vocabulary-games-core/vocabulary.mjs');
  const chosen = view.start.setIds.map(id => sets.find(s => s.id === id)).filter(Boolean);
  const puzzle = createStudentPuzzle({ entries: mergeSets(sets, view.start.setIds).entries, templateId: view.start.templateId, modeId: view.start.modeId, seed: randomSeed() });
  document.body.classList.add('playing');
  $('game').hidden = false;
  window.scrollTo(0, 0);
  workspace = await openWorkspace({ puzzle, template: template(puzzle.templateId), sets: chosen.map(s => ({ id: s.id, title: s.title, chineseTitle: s.chineseTitle })),
    onExit: () => { workspace = null; $('game').hidden = true; document.body.classList.remove('playing', 'puzzle-complete'); render(); $('start').focus({ preventScroll: true }); } });
  window.__tarsiaWorkspace = workspace; // diagnostics only
}
let workspace = null;
$('start').addEventListener('click', start);
$('touch-start-button').addEventListener('click', start);
$('reload').addEventListener('click', load);

hero();
$('setup').hidden = false;
await load();
