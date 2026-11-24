// Tarsia Puzzle workspace (Phase B3.1 prototype). Draws the engine state and turns touch/mouse input into engine
// actions. The engine state is the only source of truth; the board and tray are redrawn from it after every action.
import { rotatePiece, placePiece, removePiece, resetState, edgeStatuses, cellCorners, cellCentroid, cellEdge,
  createRandom, wordBank, tarsiaCompletionRecord, H } from './engine/index.mjs';
import { layoutPiece, placeLabel } from './label-layout.mjs';
import { progressOf, shuffleTray, hasProgress, puzzleInfo, tapPiece, tapSlot } from './workspace-model.mjs';
import { createGesture } from './gesture.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const FONTS = { hanzi: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif',
  latin: '"Avenir Next",Avenir,"Segoe UI",Arial,sans-serif' };
const fontFor = kind => kind === 'hanzi' ? FONTS.hanzi : FONTS.latin;
const ctx = document.createElement('canvas').getContext('2d');
const measure = (text, px, kind) => { ctx.font = `600 ${px}px ${fontFor(kind)}`; return ctx.measureText(text).width; };

// Load every picture once to learn its proportions; failures fall back to a text label in the same circle.
async function loadPictures(puzzle) {
  const urls = [...new Set(puzzle.pieces.flatMap(p => p.edges).filter(l => l?.kind === 'picture').map(l => l.image))];
  const info = new Map();
  await Promise.all(urls.map(url => new Promise(resolve => {
    const img = new Image(); let done = false;
    const end = ok => { if (done) return; done = true; info.set(url, ok ? { aspect: img.naturalWidth / img.naturalHeight } : { broken: true }); resolve(); };
    img.onload = () => end(img.naturalWidth > 0); img.onerror = () => end(false); setTimeout(() => end(img.naturalWidth > 0), 8000);
    img.src = url;
  })));
  return info;
}

export async function openWorkspace({ puzzle, template, sets, onExit }) {
  const $ = id => document.getElementById(id);
  const ac = new AbortController(), on = { signal: ac.signal }; // every listener is removed when the puzzle closes
  const setTitles = sets.map(s => s.title);
  const words = new Map(puzzle.words.map(w => [w.key, w]));
  const pictures = await loadPictures(puzzle);
  const random = createRandom(puzzle.seed ^ 0x5f3759df);
  const pieceById = new Map(puzzle.pieces.map(p => [p.id, p]));
  let state = resetState(puzzle), S = 0, layouts = new Map(), origin = { x: 0, y: 0 }, drag = null, completed = false, broken = new Set();
  let interaction = 'drag', selected = null; // Tap-to-place: tap selects, Turn button rotates

  // ---------- Header info ----------
  const info = puzzleInfo(puzzle, setTitles);
  $('game-level').textContent = info.shape;
  $('game-mode').textContent = info.mode;
  $('game-sets').textContent = info.sets;

  // ---------- Geometry and sizes ----------
  const corners = template.slots.flatMap(s => cellCorners(s.row, s.col));
  const bounds = { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)), minY: Math.min(...corners.map(p => p.y)), maxY: Math.max(...corners.map(p => p.y)) };
  const labelsOf = piece => piece.edges.map(l => !l ? null : l.kind === 'picture'
    ? { kind: 'picture', aspect: pictures.get(l.image)?.aspect || 1.5 } : { kind: l.kind, text: l.text });
  function resize() {
    // Portrait: give the board only the height its shape needs at full width; the tray gets the rest.
    const ws = $('workspace'), portrait = matchMedia('(orientation: portrait)').matches;
    if (portrait) {
      const box = ws.getBoundingClientRect(), sideAtWidth = (box.width - 28) / (bounds.maxX - bounds.minX);
      const boardH = Math.round(sideAtWidth * (bounds.maxY - bounds.minY) + 28), trayMin = 170;
      ws.style.gridTemplateRows = boardH + trayMin + 10 <= box.height ? `${boardH}px minmax(${trayMin}px, 1fr)` : '';
    } else ws.style.gridTemplateRows = '';
    const wrap = $('board-wrap').getBoundingClientRect(), pad = 14;
    const next = Math.floor(Math.min((wrap.width - 2 * pad) / (bounds.maxX - bounds.minX), (wrap.height - 2 * pad) / (bounds.maxY - bounds.minY)));
    if (next !== S && next > 20) {
      S = next;
      layouts = new Map(puzzle.pieces.map(p => [p.id, layoutPiece(labelsOf(p), S, measure)]));
    }
    origin = { x: (wrap.width - (bounds.maxX - bounds.minX) * S) / 2 - bounds.minX * S, y: (wrap.height - (bounds.maxY - bounds.minY) * S) / 2 - bounds.minY * S };
    $('board').setAttribute('viewBox', `0 0 ${wrap.width} ${wrap.height}`);
    $('board').setAttribute('width', wrap.width); $('board').setAttribute('height', wrap.height);
    render();
  }
  const toBoard = p => ({ x: origin.x + p.x * S, y: origin.y + p.y * S });
  const slotCentre = id => { const s = template.slotById.get(id); return toBoard(cellCentroid(s.row, s.col)); };

  // ---------- Piece drawing (piece frame, centroid at 0,0, at board size S) ----------
  function triangle(rotation) {
    const h = S * H, base = [{ x: 0, y: -2 * h / 3 }, { x: S / 2, y: h / 3 }, { x: -S / 2, y: h / 3 }], a = rotation * Math.PI / 3;
    return base.map(p => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }));
  }
  const pts = list => list.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  function labelSvg(piece, i, rotation) {
    const label = piece.edges[i], item = layouts.get(piece.id)[i];
    if (!label || !item) return '';
    const at = placeLabel(item, i, rotation, label.side); // printed on the piece: turns with it
    if (label.kind === 'picture') {
      if (pictures.get(label.image)?.broken || broken.has(label.image)) {
        const word = words.get(label.pair);
        return `<g transform="translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${at.angle})"><circle r="${(item.D / 2).toFixed(1)}" class="pic-missing"/><text class="label english" style="font-size:${Math.max(12, item.D / 5).toFixed(1)}px" dominant-baseline="central" text-anchor="middle">${esc(word?.english || '?')}</text></g>`;
      }
      return `<image href="${esc(label.image)}" x="${(-item.imageW / 2).toFixed(1)}" y="${(-item.imageH / 2).toFixed(1)}" width="${item.imageW.toFixed(1)}" height="${item.imageH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" transform="translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${at.angle})" data-src="${esc(label.image)}"/>`;
    }
    const lh = item.fontPx * 1.18, n = item.lines.length;
    return `<text class="label ${label.kind}" style="font-size:${item.fontPx.toFixed(1)}px" text-anchor="middle" dominant-baseline="central" transform="translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${at.angle})"${label.kind === 'hanzi' ? ' lang="zh-Hans"' : ''}>${
      item.lines.map((line, k) => `<tspan x="0" y="${((k - (n - 1) / 2) * lh).toFixed(1)}">${esc(line)}</tspan>`).join('')}</text>`;
  }
  const LOCK = '<path class="lock" d="M-5 -1 h10 v8 h-10 z M-3 -1 v-3 a3 3 0 0 1 6 0 v3" />';
  function pieceInner(piece, rotation, locked) {
    const tri = triangle(rotation);
    return `<polygon class="piece-shadow" points="${pts(tri.map(p => ({ x: p.x + 1.5, y: p.y + 3 })))}"/>` +
      `<polygon class="piece-face${locked ? ' locked' : ''}" points="${pts(tri)}"/>` +
      [0, 1, 2].map(i => labelSvg(piece, i, rotation)).join('') + (locked ? LOCK : '');
  }

  // ---------- Board ----------
  function render() {
    if (!S) return;
    const parts = [];
    const occupied = new Set(Object.values(state.pieces).map(p => p.slot).filter(Boolean));
    for (const slot of template.slots) parts.push(`<polygon class="slot${selected && !occupied.has(slot.id) ? ' tap-target' : ''}" data-slot="${slot.id}" points="${pts(cellCorners(slot.row, slot.col).map(toBoard))}"/>`);
    for (const piece of puzzle.pieces) {
      const p = state.pieces[piece.id];
      if (!p.slot) continue;
      const c = slotCentre(p.slot);
      parts.push(`<g class="piece${p.locked ? ' is-locked' : ''}${selected === piece.id ? ' selected' : ''}" data-piece="${piece.id}" transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})" ${p.locked ? '' : 'tabindex="0" role="button"'} aria-label="${p.locked ? 'Starting piece (fixed)' : 'Puzzle piece on the board. Tap to turn, drag to move.'}">${pieceInner(piece, p.rotation, p.locked)}</g>`);
    }
    // Subtle positive feedback: a short green mark on each correctly matched shared edge.
    for (const e of edgeStatuses(puzzle, state, template)) if (e.status === 'match') {
      const s = template.slotById.get(e.a), [a, b] = cellEdge(s.row, s.col, e.aDir).map(toBoard), k = 0.3;
      parts.push(`<line class="match-mark" x1="${(a.x + (b.x - a.x) * k).toFixed(1)}" y1="${(a.y + (b.y - a.y) * k).toFixed(1)}" x2="${(b.x - (b.x - a.x) * k).toFixed(1)}" y2="${(b.y - (b.y - a.y) * k).toFixed(1)}"/>`);
    }
    $('board').innerHTML = parts.join('');
    renderTray();
    renderProgress();
  }

  // ---------- Tray: same drawing, scaled to fit, scrolls on its own ----------
  function renderTray() {
    const tray = $('tray'), box = tray.getBoundingClientRect(), portrait = box.width > box.height * 1.4;
    const h = S * H, gap = 10;
    let scale;
    if (portrait) scale = Math.min(0.85, (box.height - 28) / (h * 1.04));
    else { const inner = box.width - 24, cols = Math.max(1, Math.floor((inner + gap) / (0.72 * S + gap))); scale = Math.min(0.85, (inner - (cols - 1) * gap) / cols / S); }
    tray.style.setProperty('--piece-w', `${(S * scale).toFixed(1)}px`);
    tray.style.setProperty('--piece-h', `${(h * scale * 1.02).toFixed(1)}px`);
    $('tray-count').textContent = state.tray.length ? `${state.tray.length} ${state.tray.length === 1 ? 'piece' : 'pieces'} left` : 'All pieces are on the board';
    $('tray-list').innerHTML = state.tray.map(id => {
      const p = state.pieces[id], up = p.rotation % 2 === 0, top = up ? -2 * h / 3 : -h / 3;
      return `<div class="tray-item${selected === id ? ' selected' : ''}" data-piece="${id}" tabindex="0" role="button" aria-label="Puzzle piece. Tap to turn, drag to the board.">
        <svg viewBox="${(-S / 2 - 3).toFixed(1)} ${(top - 3).toFixed(1)} ${(S + 8).toFixed(1)} ${(h + 8).toFixed(1)}" aria-hidden="true" focusable="false">${pieceInner(pieceById.get(id), p.rotation, false)}</svg></div>`;
    }).join('');
  }

  function renderProgress() {
    const pr = progressOf(puzzle, state, template);
    $('progress-text').textContent = `${pr.matched} / ${pr.total} matches`;
    $('progress-bar').style.width = `${(100 * pr.matched / pr.total).toFixed(1)}%`;
    $('progress').setAttribute('aria-valuenow', pr.matched); $('progress').setAttribute('aria-valuemax', pr.total);
    if (pr.complete && !completed) {
      completed = true; selected = null; updateTapTools();
      document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      $('complete-note').hidden = false;
      $('complete-note').textContent = `All ${pr.total} word pairs are matched. Puzzle complete!`;
      document.body.classList.add('puzzle-complete');
      // Phase C listens for this to build the Evidence of Learning (data only; nothing is sent anywhere).
      document.dispatchEvent(new CustomEvent('tarsia:complete', { detail: tarsiaCompletionRecord(puzzle, state, { vocabularySets: sets }) }));
    }
  }

  // ---------- Input: tap turns, drag moves (pointer events, touch-safe) ----------
  const ghost = $('drag-ghost');
  const capture = (el, id) => { try { el.setPointerCapture?.(id); } catch { /* pointer already gone: carry on without capture */ } };
  function apply(result) { if (result.ok) state = result.state; render(); return result; }
  function nearestSlot(c) {
    let best = null, bestD = S * 0.5;
    for (const slot of template.slots) { const p = slotCentre(slot.id), d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bestD) { best = slot.id; bestD = d; } }
    return best;
  }
  function boardPoint(clientX, clientY) {
    const pt = $('board').createSVGPoint(); pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform($('board').getScreenCTM().inverse());
  }
  function moveGhost(event) {
    // Touch: lift the piece above the finger so the vocabulary stays visible. Mouse: keep the grab point.
    const lift = drag.pointerType === 'touch' ? S * 0.55 : 0;
    const cx = event.clientX - drag.grab.x, cy = event.clientY - drag.grab.y - lift;
    ghost.style.transform = `translate(${(cx - S / 2 - 4).toFixed(1)}px, ${(cy - drag.top - 4).toFixed(1)}px)`;
    const b = boardPoint(cx, cy), wrap = $('board-wrap').getBoundingClientRect(), trayBox = $('tray').getBoundingClientRect();
    const overBoard = cx >= wrap.left && cx <= wrap.right && cy >= wrap.top && cy <= wrap.bottom;
    const slot = overBoard ? nearestSlot(b) : null;
    const occupant = slot && Object.keys(state.pieces).find(id => state.pieces[id].slot === slot);
    drag.target = slot && (!occupant || occupant === drag.id) ? slot : null;
    drag.overTray = event.clientX >= trayBox.left && event.clientX <= trayBox.right && event.clientY >= trayBox.top && event.clientY <= trayBox.bottom;
    document.querySelectorAll('.slot.hover').forEach(el => el.classList.remove('hover'));
    if (drag.target) document.querySelector(`.slot[data-slot="${drag.target}"]`)?.classList.add('hover');
    $('tray').classList.toggle('drop-here', drag.overTray && !!state.pieces[drag.id].slot);
  }
  function startDragVisual(event) {
    const p = state.pieces[drag.id], h = S * H;
    drag.top = p.rotation % 2 === 0 ? 2 * h / 3 : h / 3;
    ghost.setAttribute('viewBox', `${(-S / 2 - 4).toFixed(1)} ${(-drag.top - 4).toFixed(1)} ${(S + 8).toFixed(1)} ${(h + 8).toFixed(1)}`);
    ghost.setAttribute('width', S + 8); ghost.setAttribute('height', h + 8);
    ghost.innerHTML = pieceInner(pieceById.get(drag.id), p.rotation, false);
    ghost.hidden = false;
    drag.el.classList.add('lifted');
    moveGhost(event);
  }
  function endDrag(cancelled, event) {
    const d = drag; drag = null;
    ghost.hidden = true; ghost.innerHTML = '';
    document.querySelectorAll('.slot.hover').forEach(el => el.classList.remove('hover'));
    $('tray').classList.remove('drop-here');
    d.el.classList.remove('lifted');
    const kind = cancelled ? d.gesture.cancel() : d.gesture.end(event.timeStamp);
    if (kind === 'tap') {
      if (interaction === 'tap') { selected = tapPiece(state, selected, d.id); updateTapTools(); return render(); }
      return apply(rotatePiece(state, template, d.id));
    }
    if (kind !== 'drag') return render();
    if (d.target) { if (selected === d.id) selected = null; updateTapTools(); return apply(placePiece(state, template, d.id, d.target)); }
    if (d.overTray && state.pieces[d.id].slot) return apply(removePiece(state, template, d.id));
    render(); // dropped elsewhere: the piece goes back exactly where it was
  }
  const workspace = $('workspace');
  workspace.addEventListener('pointerdown', event => {
    if (drag) { if (event.pointerId !== drag.pointerId) { drag.gesture.cancel(); endDrag(true, event); } return; }
    if (completed || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const el = event.target.closest('[data-piece]');
    if (!el || state.pieces[el.dataset.piece]?.locked) return;
    const box = el.getBoundingClientRect(), p = state.pieces[el.dataset.piece];
    // Grab offset relative to the piece centroid on screen.
    const centre = p.slot ? (() => { const c = slotCentre(p.slot), m = $('board').getScreenCTM(); return { x: m.a * c.x + m.e, y: m.d * c.y + m.f }; })()
      : { x: box.left + box.width / 2, y: box.top + box.height * (p.rotation % 2 === 0 ? 0.64 : 0.36) };
    drag = { id: el.dataset.piece, el, pointerId: event.pointerId, pointerType: event.pointerType, grab: { x: event.clientX - centre.x, y: event.clientY - centre.y }, target: null, overTray: false,
      gesture: createGesture({ pointerType: event.pointerType, x: event.clientX, y: event.clientY, time: event.timeStamp }) };
    if (event.pointerType !== 'touch' || p.slot) capture(el, event.pointerId);
  }, on);
  workspace.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const wasDragging = drag.gesture.dragging;
    if (!drag.gesture.move(event.clientX, event.clientY)) return;
    if (!wasDragging) { capture(drag.el, event.pointerId); startDragVisual(event); }
    event.preventDefault();
    moveGhost(event);
  }, { passive: false, signal: ac.signal });
  workspace.addEventListener('pointerup', event => { if (drag && event.pointerId === drag.pointerId) endDrag(false, event); }, on);
  workspace.addEventListener('pointercancel', event => { if (drag && event.pointerId === drag.pointerId) endDrag(true, event); }, on);
  workspace.addEventListener('contextmenu', event => event.preventDefault(), on);
  workspace.addEventListener('dragstart', event => event.preventDefault(), on);
  workspace.addEventListener('keydown', event => {
    const el = event.target.closest?.('[data-piece]');
    if (!el || completed || !(event.key === 'Enter' || event.key === ' ')) return;
    event.preventDefault();
    const id = el.dataset.piece;
    if (interaction === 'tap') { selected = tapPiece(state, selected, id); updateTapTools(); render(); } else apply(rotatePiece(state, template, id));
    document.querySelector(`[data-piece="${id}"]`)?.focus();
  }, on);
  $('board').addEventListener('error', event => { const src = event.target.getAttribute?.('data-src'); if (src && !broken.has(src)) { broken.add(src); render(); } }, { capture: true, signal: ac.signal });

  // ---------- Controls ----------
  const confirmDialog = (message, ok) => new Promise(resolve => {
    const d = $('confirm'); $('confirm-text').textContent = message; $('confirm-ok').textContent = ok;
    d.returnValue = ''; d.showModal();
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
  });
  const controls = {
    'shuffle-btn': () => { state = shuffleTray(state, random); updateTapTools(); render(); },
    'restart-btn': async () => {
      if (hasProgress(puzzle, state) && !await confirmDialog('Start this puzzle again? The pieces you have placed will go back to the tray.', 'Start again')) return;
      state = resetState(puzzle); selected = null; updateTapTools(); completed = false; $('complete-note').hidden = true; document.body.classList.remove('puzzle-complete'); render();
    },
    'setup-btn': async () => {
      if (!completed && hasProgress(puzzle, state) && !await confirmDialog('Go back to choosing words? This puzzle will be closed.', 'Back to setup')) return;
      teardown(); onExit();
    },
    'bank-btn': () => toggleBank(true), 'bank-close': () => toggleBank(false),
    'mode-drag': () => setInteraction('drag'), 'mode-tap': () => setInteraction('tap'),
    'turn-btn': () => { if (selected) apply(rotatePiece(state, template, selected)); },
    'back-btn': () => { if (selected && state.pieces[selected].slot) { apply(removePiece(state, template, selected)); } }
  };
  function setInteraction(mode) { // switching never changes the puzzle state
    interaction = mode; selected = null;
    $('mode-drag').setAttribute('aria-pressed', String(mode === 'drag')); $('mode-tap').setAttribute('aria-pressed', String(mode === 'tap'));
    $('tap-tools').hidden = mode !== 'tap'; updateTapTools(); render();
  }
  function updateTapTools() {
    $('turn-btn').disabled = !selected; $('back-btn').disabled = !(selected && state.pieces[selected]?.slot);
  }
  $('board').addEventListener('click', event => {
    const slot = event.target.closest?.('.slot');
    if (interaction !== 'tap' || !slot || completed) return;
    const result = tapSlot(state, template, selected, slot.dataset.slot);
    if (result.ok) { state = result.state; selected = result.selected; updateTapTools(); render(); }
  }, on);
  const onClick = event => { const b = event.target.closest('button[id]'); if (b && controls[b.id]) controls[b.id](); };
  document.addEventListener('click', onClick, on);

  // ---------- Word Bank (overlay: never moves pieces or resizes the board) ----------
  $('bank-list').innerHTML = wordBank(puzzle).map(w => `<li>${w.image ? `<img src="${esc(w.image)}" alt="" draggable="false">` : '<span class="no-pic" aria-hidden="true"></span>'}
    <span><strong lang="zh-Hans">${esc(w.hanzi)}</strong><span class="py">${esc(w.pinyin)}</span><span class="en">${esc(w.english)}</span></span></li>`).join('');
  function toggleBank(open) {
    $('word-bank').hidden = !open; $('bank-btn').setAttribute('aria-expanded', String(open));
    (open ? $('bank-close') : $('bank-btn')).focus();
  }
  const onKey = event => { if (event.key === 'Escape' && !$('word-bank').hidden) toggleBank(false); };
  document.addEventListener('keydown', onKey, on);

  const observer = new ResizeObserver(() => resize());
  observer.observe($('board-wrap')); observer.observe($('tray'));
  function teardown() { observer.disconnect(); ac.abort(); }
  resize();
  // Test/diagnostic hooks (no effect on play).
  return { get state() { return state; }, get side() { return S; }, get layouts() { return layouts; }, teardown };
}
