// Tarsia Puzzle workspace. Draws the engine state and turns taps, long presses and keys into engine actions
// (D3, 27 Nov 2026: tap only — no dragging). The engine state is the only source of truth; the board and tray are redrawn from it after every action.
import { rotatePiece, placePiece, removePiece, resetState, edgeStatuses, cellCorners, cellCentroid, cellEdge,
  createRandom, wordBank, tarsiaCompletionRecord, H } from './engine/index.mjs';
import { fitPiece, placeLabel } from './label-layout.mjs';
import { progressOf, shuffleTray, hasProgress, puzzleInfo, tapPiece, tapSlot, boardTapAction, LONG_PRESS_MS, slotNeighbour, pieceDescription, slotDescription } from './workspace-model.mjs';
import { createGesture } from './gesture.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const FONTS = { hanzi: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif',
  latin: '"Avenir Next",Avenir,"Segoe UI",Arial,sans-serif' };
// D3: phone-width screens use a vertically scrolling layout (see styles.css, same breakpoint).
const PHONE = '(max-width: 600px)';
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

export async function openWorkspace({ puzzle, template, sets, onExit, onComplete }) {
  const $ = id => document.getElementById(id);
  const ac = new AbortController(), on = { signal: ac.signal }; // every listener is removed when the puzzle closes
  const setTitles = sets.map(s => s.title);
  const words = new Map(puzzle.words.map(w => [w.key, w]));
  const pictures = await loadPictures(puzzle);
  const random = createRandom(puzzle.seed ^ 0x5f3759df);
  const pieceById = new Map(puzzle.pieces.map(p => [p.id, p]));
  let state = resetState(puzzle), S = 0, layouts = new Map(), origin = { x: 0, y: 0 }, completed = false, broken = new Set();
  let selected = null;                         // the tray piece chosen by a tap (or Enter), waiting for a space
  // Completion time (D3): starts when the board is ready to play, stops at the completing move, then stays frozen.
  // Word Bank time counts (the puzzle is still in progress); setup, name/class, record making and saving do not.
  let startedAt = null, timeTakenMs = null;
  let cursorSlot = null, focusAfter = null;   // keyboard: space cursor and the element to refocus after a redraw
  const say = text => { $('kb-status').textContent = ''; requestAnimationFrame(() => { $('kb-status').textContent = text; }); };
  const describe = id => pieceDescription(pieceById.get(id), words);

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
    if (matchMedia(PHONE).matches) {
      // D3 (phones ≤ 600 px wide): the page scrolls, so the board takes the full width and exactly the height its
      // shape needs; the tray follows below. iPads and phones in landscape (wider than 600 px) never come here.
      ws.style.gridTemplateRows = '';
      const width = $('board-wrap').getBoundingClientRect().width, side = (width - 16) / (bounds.maxX - bounds.minX);
      $('board-wrap').style.height = `${Math.floor(side * (bounds.maxY - bounds.minY) + 16)}px`;
    } else if (portrait) {
      $('board-wrap').style.height = '';
      const box = ws.getBoundingClientRect(), sideAtWidth = (box.width - 16) / (bounds.maxX - bounds.minX);
      const boardH = Math.round(sideAtWidth * (bounds.maxY - bounds.minY) + 16), trayMin = 170;
      ws.style.gridTemplateRows = boardH + trayMin + 10 <= box.height ? `${boardH}px minmax(${trayMin}px, 1fr)` : '';
    } else { ws.style.gridTemplateRows = ''; $('board-wrap').style.height = ''; }
    const wrap = $('board-wrap').getBoundingClientRect(), pad = 8; // D1: tighter inner margin → larger pieces
    const next = Math.floor(Math.min((wrap.width - 2 * pad) / (bounds.maxX - bounds.minX), (wrap.height - 2 * pad) / (bounds.maxY - bounds.minY)));
    if (next !== S && next > 20) {
      S = next;
      layouts = new Map(puzzle.pieces.map(p => [p.id, fitPiece(labelsOf(p), S, measure)])); // re-fitted whenever S changes (resize, rotation)
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
        return `<g transform="translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${at.angle})"><rect x="${(-item.imageW / 2).toFixed(1)}" y="${(-item.imageH / 2).toFixed(1)}" width="${item.imageW.toFixed(1)}" height="${item.imageH.toFixed(1)}" rx="4" class="pic-missing"/><text class="label english" style="font-size:${Math.max(12, item.imageH / 3).toFixed(1)}px" dominant-baseline="central" text-anchor="middle">${esc(word?.english || '?')}</text></g>`;
      }
      const box = `x="${(-item.imageW / 2).toFixed(1)}" y="${(-item.imageH / 2).toFixed(1)}" width="${item.imageW.toFixed(1)}" height="${item.imageH.toFixed(1)}"`;
      return `<g transform="translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${at.angle})"><image href="${esc(label.image)}" ${box} preserveAspectRatio="xMidYMid meet" data-src="${esc(label.image)}"/><rect ${box} class="pic-frame"/></g>`;
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
    for (const slot of template.slots) parts.push(`<polygon class="slot${selected && !occupied.has(slot.id) ? ' tap-target' : ''}" data-slot="${slot.id}" points="${pts(cellCorners(slot.row, slot.col).map(toBoard))}" tabindex="-1" role="button" aria-label="${esc(slotDescription(template, slot.id, occupied.has(slot.id)))}"/>`);
    for (const piece of puzzle.pieces) {
      const p = state.pieces[piece.id];
      if (!p.slot) continue;
      const c = slotCentre(p.slot);
      parts.push(`<g class="piece${p.locked ? ' is-locked' : ''}${selected === piece.id ? ' selected' : ''}" data-piece="${piece.id}" transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})" ${p.locked ? '' : 'tabindex="0" role="button" aria-describedby="kb-help"'} aria-label="${esc(p.locked ? `Starting piece (fixed). ${describe(piece.id)}` : `${describe(piece.id)}. On the board, ${slotDescription(template, p.slot, true)}`)}">${pieceInner(piece, p.rotation, p.locked)}</g>`);
    }
    // Subtle positive feedback: a short green mark on each correctly matched shared edge.
    for (const e of edgeStatuses(puzzle, state, template)) if (e.status === 'match') {
      const s = template.slotById.get(e.a), [a, b] = cellEdge(s.row, s.col, e.aDir).map(toBoard), k = 0.3;
      parts.push(`<line class="match-mark" x1="${(a.x + (b.x - a.x) * k).toFixed(1)}" y1="${(a.y + (b.y - a.y) * k).toFixed(1)}" x2="${(b.x - (b.x - a.x) * k).toFixed(1)}" y2="${(b.y - (b.y - a.y) * k).toFixed(1)}"/>`);
    }
    if (cursorSlot) parts.push(`<polygon class="slot-cursor" points="${pts(cellCorners(template.slotById.get(cursorSlot).row, template.slotById.get(cursorSlot).col).map(toBoard))}"/>`);
    $('board').innerHTML = parts.join('');
    renderTray();
    renderProgress();
    if (focusAfter) { // keep keyboard focus on the same piece or space after the redraw
      const el = focusAfter.slot ? document.querySelector(`.slot[data-slot="${focusAfter.slot}"]`) : document.querySelector(`[data-piece="${focusAfter.piece}"]`);
      focusAfter = null; el?.focus({ preventScroll: false });
    }
  }

  // ---------- Tray: same drawing, scaled to fit, scrolls on its own ----------
  function renderTray() {
    const tray = $('tray'), box = tray.getBoundingClientRect(), portrait = box.width > box.height * 1.4;
    const h = S * H, gap = 10;
    let scale;
    // D3: measure the room left under the tray header and play hint (the hint can wrap), not a fixed 28 px.
    if (matchMedia(PHONE).matches) scale = 0.9; // phones: the tray grows downwards (page scrolls), pieces stay large
    else if (portrait) { const used = $('tray-list').getBoundingClientRect().top - box.top; scale = Math.min(0.85, (box.height - used - 12) / (h * 1.04)); }
    else { const inner = box.width - 24, cols = Math.max(1, Math.floor((inner + gap) / (0.72 * S + gap))); scale = Math.min(0.85, (inner - (cols - 1) * gap) / cols / S); }
    tray.style.setProperty('--piece-w', `${(S * scale).toFixed(1)}px`);
    tray.style.setProperty('--piece-h', `${(h * scale * 1.02).toFixed(1)}px`);
    $('tray-count').textContent = state.tray.length ? `${state.tray.length} ${state.tray.length === 1 ? 'piece' : 'pieces'} left` : 'All pieces are on the board';
    $('tray-list').innerHTML = state.tray.map(id => {
      const p = state.pieces[id], up = p.rotation % 2 === 0, top = up ? -2 * h / 3 : -h / 3;
      return `<div class="tray-item${selected === id ? ' selected' : ''}" data-piece="${id}" tabindex="0" role="button" aria-describedby="kb-help" aria-label="${esc(describe(id))}. In the tray.">
        <svg viewBox="${(-S / 2 - 3).toFixed(1)} ${(top - 3).toFixed(1)} ${(S + 8).toFixed(1)} ${(h + 8).toFixed(1)}" aria-hidden="true" focusable="false">${pieceInner(pieceById.get(id), p.rotation, false)}</svg></div>`;
    }).join('');
  }

  function renderProgress() {
    const pr = progressOf(puzzle, state, template);
    $('progress-text').textContent = `${pr.matched} / ${pr.total} matches`;
    $('progress-bar').style.width = `${(100 * pr.matched / pr.total).toFixed(1)}%`;
    $('progress').setAttribute('aria-valuenow', pr.matched); $('progress').setAttribute('aria-valuemax', pr.total);
    if (pr.complete && !completed) {
      completed = true; selected = null;
      timeTakenMs = startedAt === null ? 0 : Math.round(performance.now() - startedAt);
      document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      $('complete-note').hidden = false;
      $('complete-note').innerHTML = `All ${pr.total} word pairs are matched. Puzzle complete! <button id="record-open" type="button" class="tool-button">Learning record</button>`;
      document.body.classList.add('puzzle-complete');
      // Phase C listens for this to build the Evidence of Learning (data only; nothing is sent anywhere).
      document.dispatchEvent(new CustomEvent('tarsia:complete', { detail: tarsiaCompletionRecord(puzzle, state, { vocabularySets: sets, timeTakenMs }) }));
      onComplete?.({ puzzle, state, sets, timeTakenMs }); // completion experience (C2): opens the learning-record panel
    }
  }

  // ---------- Input (D3): tap only ----------
  // Tray: tap a piece to select it (tap again to cancel). Board: tap an empty space to place the selected piece (with
  // the geometric orientation turn); tap a placed piece to turn it 120°; hold it ~0.5 s to send it back to the tray.
  // With a tray piece selected, tapping a placed piece does nothing to it (no accidental turn or replacement).
  function apply(result) { if (result.ok) state = result.state; render(); return result; }
  const workspace = $('workspace');
  // The click a browser fires after a tap or hold lands on whatever is now under the finger (e.g. the empty space a
  // returned piece left). Only that click — same place, straight after — is ignored; taps elsewhere work at once.
  let press = null, lastPress = { x: 0, y: 0, t: -1e9 };
  const echoClick = event => performance.now() - lastPress.t < 600 && Math.hypot(event.clientX - lastPress.x, event.clientY - lastPress.y) < 24;
  function cancelPress() { if (!press) return; clearTimeout(press.timer); press.el?.classList.remove('pressing'); press = null; }
  function backToTray(id) {
    if (selected === id) selected = null;
    apply(removePiece(state, template, id)); say('Back in the tray.');
  }
  function tapOnPiece(id) {
    const p = state.pieces[id];
    if (!p || p.locked) return;
    if (!p.slot) { selected = tapPiece(state, selected, id); cursorSlot = null; render(); say(selected ? `Selected. ${describe(id)}. Tap an empty space.` : 'Selection cleared.'); return; }
    const action = boardTapAction(state, selected, id);
    if (action === 'rotate') { apply(rotatePiece(state, template, id)); say('Turned 120 degrees.'); }
    else if (action === 'occupied') say('That space already has a piece. Tap an empty space.');
  }
  workspace.addEventListener('pointerdown', event => {
    if (completed || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const el = event.target.closest('[data-piece]');
    cancelPress();
    if (!el || state.pieces[el.dataset.piece]?.locked) return;
    const id = el.dataset.piece, onBoard = !!state.pieces[id].slot;
    press = { id, el, x: event.clientX, y: event.clientY, pointerId: event.pointerId, handled: false, gesture: createGesture({ pointerType: event.pointerType, x: event.clientX, y: event.clientY, time: event.timeStamp }) };
    if (onBoard && boardTapAction(state, selected, id) === 'rotate') {
      el.classList.add('pressing'); // visual feedback: a ring fills while the piece is held
      press.timer = setTimeout(() => {
        if (!press || press.id !== id) return;
        press.handled = true; lastPress = { x: press.x, y: press.y, t: performance.now() };
        el.classList.remove('pressing'); backToTray(id);
      }, LONG_PRESS_MS);
    }
  }, on);
  workspace.addEventListener('pointermove', event => {
    if (press && event.pointerId === press.pointerId && press.gesture.move(event.clientX, event.clientY)) cancelPress(); // moved: neither tap nor hold
  }, on);
  workspace.addEventListener('pointerup', event => {
    if (!press || event.pointerId !== press.pointerId) return;
    const p = press, moved = p.gesture.dragging; clearTimeout(p.timer); p.el?.classList.remove('pressing'); press = null;
    if (p.handled || moved) return;   // a long press already returned the piece; a slide is ignored
    lastPress = { x: event.clientX, y: event.clientY, t: performance.now() }; // its own click must not reach a space underneath
    tapOnPiece(p.id);
  }, on);
  workspace.addEventListener('pointercancel', cancelPress, on);
  workspace.addEventListener('contextmenu', event => event.preventDefault(), on); // no native menu on long press
  workspace.addEventListener('dragstart', event => event.preventDefault(), on);
  $('board').addEventListener('click', event => {
    const slot = event.target.closest?.('.slot');
    if (!slot || completed || echoClick(event)) return;
    const result = tapSlot(state, template, selected, slot.dataset.slot);
    if (result.ok) { state = result.state; selected = result.selected; cursorSlot = null; render(); const pr = progressOf(puzzle, state, template); if (!completed) say(`Placed. ${pr.matched} of ${pr.total} matches.`); }
  }, on);
  // Keyboard (D1): Tab to a piece · Enter/Space select · arrow keys choose a space · Enter/Space place · R turn ·
  // Delete/Backspace back to the tray · Escape cancel. Works in both Drag and Tap modes; locked pieces are skipped.
  workspace.addEventListener('keydown', event => {
    if (completed) return;
    const key = event.key, pieceEl = event.target.closest?.('[data-piece]'), slotEl = event.target.closest?.('.slot');
    const isSelect = key === 'Enter' || key === ' ', isTurn = key === 'r' || key === 'R', isBack = key === 'Delete' || key === 'Backspace';
    if (key === 'Escape' && (selected || cursorSlot)) {
      event.preventDefault(); const id = selected; selected = null; cursorSlot = null;
      focusAfter = id ? { piece: id } : null; render(); say('Cancelled.'); return;
    }
    if (pieceEl && state.pieces[pieceEl.dataset.piece] && !state.pieces[pieceEl.dataset.piece].locked) {
      const id = pieceEl.dataset.piece;
      if (isSelect) {
        event.preventDefault(); selected = tapPiece(state, selected, id);
        if (selected) {
          const empty = template.slots.find(sl => !Object.values(state.pieces).some(p => p.slot === sl.id));
          cursorSlot = state.pieces[id].slot || empty?.id || template.slots[0].id; focusAfter = { slot: cursorSlot };
          say(`Selected. ${describe(id)}. Use the arrow keys to choose a space, Enter to place it, R to turn it, Escape to cancel.`);
        } else { cursorSlot = null; focusAfter = { piece: id }; say('Selection cleared.'); }
        render(); return;
      }
      if (isTurn) { event.preventDefault(); focusAfter = { piece: id }; apply(rotatePiece(state, template, id)); say(state.pieces[id].slot ? 'Turned 120 degrees.' : 'Turned 60 degrees.'); return; }
      if (isBack && state.pieces[id].slot) {
        event.preventDefault(); if (selected === id) { selected = null; cursorSlot = null; }
        focusAfter = { piece: id }; apply(removePiece(state, template, id)); say('Back in the tray.'); return;
      }
    }
    if (slotEl && selected) {
      const slotId = slotEl.dataset.slot;
      if (key.startsWith('Arrow')) {
        event.preventDefault(); cursorSlot = slotNeighbour(template, slotId, key); focusAfter = { slot: cursorSlot }; render();
        say(slotDescription(template, cursorSlot, Object.values(state.pieces).some(p => p.slot === cursorSlot))); return;
      }
      if (isSelect) {
        event.preventDefault(); const id = selected, r = tapSlot(state, template, selected, slotId);
        if (!r.ok) { say(r.reason === 'occupied' ? 'This space already has a piece. Choose an empty space.' : 'The piece cannot go there.'); return; }
        state = r.state; selected = null; cursorSlot = null; focusAfter = { piece: id }; render();
        const pr = progressOf(puzzle, state, template); say(`Placed. ${pr.matched} of ${pr.total} matches.`); return;
      }
      if (isTurn) { event.preventDefault(); focusAfter = { slot: slotId }; apply(rotatePiece(state, template, selected)); say('Turned.'); return; }
      if (isBack && state.pieces[selected].slot) {
        event.preventDefault(); const id = selected; selected = null; cursorSlot = null;
        focusAfter = { piece: id }; apply(removePiece(state, template, id)); say('Back in the tray.'); return;
      }
    }
  }, on);
  $('board').addEventListener('error', event => { const src = event.target.getAttribute?.('data-src'); if (src && !broken.has(src)) { broken.add(src); render(); } }, { capture: true, signal: ac.signal });

  // ---------- Controls ----------
  const confirmDialog = (message, ok) => new Promise(resolve => {
    const d = $('confirm'); $('confirm-text').textContent = message; $('confirm-ok').textContent = ok;
    d.returnValue = ''; d.showModal();
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
  });
  const controls = {
    'shuffle-btn': () => { state = shuffleTray(state, random); render(); },
    'restart-btn': async () => {
      if (hasProgress(puzzle, state) && !await confirmDialog('Start this puzzle again? The pieces you have placed will go back to the tray.', 'Start again')) return;
      state = resetState(puzzle); selected = null; completed = false; $('complete-note').hidden = true; document.body.classList.remove('puzzle-complete'); render();
      startedAt = performance.now(); timeTakenMs = null; // a restarted puzzle is a new game: the time starts again
    },
    'setup-btn': async () => {
      if (!completed && hasProgress(puzzle, state) && !await confirmDialog('Go back to choosing words? This puzzle will be closed.', 'Back to setup')) return;
      teardown(); onExit();
    },
    'bank-btn': () => toggleBank(true), 'bank-close': () => toggleBank(false)
  };
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
  function teardown() { cancelPress(); observer.disconnect(); ac.abort(); }
  resize();
  startedAt = performance.now(); // the board is drawn and ready for the first tap
  // Test/diagnostic hooks (no effect on play).
  return { get state() { return state; }, get side() { return S; }, get layouts() { return layouts; }, get timeTakenMs() { return timeTakenMs; }, teardown };
}
