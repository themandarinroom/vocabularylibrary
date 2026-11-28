// Developer check (D1): finish the current puzzle with KEYBOARD EVENTS ONLY, the way a keyboard user would:
// focus a tray piece (stands in for Tab), Enter to select, arrow keys to a space, Enter to place, R to turn,
// Delete to send it back. It knows nothing about the answer: it tries pieces next to the pieces already placed
// and keeps one only when the match count goes up (each label has exactly one partner, so that is the right piece).
import { getTemplate } from '../engine/index.mjs';
import { slotNeighbour } from '../workspace-model.mjs';

const wait = ms => new Promise(r => setTimeout(r, ms));
const press = key => { const el = document.activeElement; el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); return el; };
const matches = () => parseInt(document.getElementById('progress-text').textContent);
const done = () => document.body.classList.contains('puzzle-complete');

function arrowPath(t, from, to) { // shortest sequence of arrow keys between two spaces (planning aid only)
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) { const cur = q.shift(); if (cur === to) break;
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) { const n = slotNeighbour(t, cur, k); if (!prev.has(n)) { prev.set(n, [cur, k]); q.push(n); } } }
  const keys = []; for (let c = to; prev.get(c); c = prev.get(c)[0]) keys.unshift(prev.get(c)[1]); return keys;
}

export async function finishWithKeyboard(templateId) {
  const t = getTemplate(templateId), w = window.__tarsiaWorkspace, log = { keys: 0, announcements: new Set() };
  const k = async key => { press(key); log.keys++; await wait(15); const s = document.getElementById('kb-status').textContent; if (s) log.announcements.add(s.replace(/\d+ of \d+/, 'N of M').slice(0, 60)); };
  const filled = () => new Set(Object.values(w.state.pieces).map(p => p.slot).filter(Boolean));
  const adj = id => { const s = t.slotById.get(id); return t.slots.filter(o => t.internalEdges.some(e => (e.a === id && e.b === o.id) || (e.b === id && e.a === o.id))).map(o => o.id); };
  for (let guard = 0; guard < 400 && !done(); guard++) {
    const f = filled(), targets = f.size ? t.slots.map(s => s.id).filter(id => !f.has(id) && adj(id).some(n => f.has(n))) : [t.slots[0].id];
    let placed = false;
    for (const target of targets) {
      for (const id of [...w.state.tray]) {
        const base = matches();
        document.querySelector(`.tray-item[data-piece="${id}"]`).focus(); // = Tab to the piece
        await k('Enter');                                                      // select → focus moves to a space
        const start = document.activeElement.dataset.slot;
        for (const key of arrowPath(t, start, target)) await k(key);
        await k('Enter');                                                      // place
        if (w.state.pieces[id].slot !== target) { await k('Escape'); continue; }
        let ok = matches() > base || done();
        for (let r = 0; r < 2 && !ok; r++) { await k('r'); ok = matches() > base || done(); } // focus is on the placed piece
        if (ok || (f.size === 0)) { placed = true; break; }
        await k('Delete');                                                     // back to the tray
      }
      if (placed) break;
    }
    if (!placed) break;
  }
  return { complete: done(), progress: document.getElementById('progress-text').textContent, keys: log.keys, announcements: [...log.announcements] };
}

// Tab order the browser will use: every unlocked piece (tray, then board), then nothing else inside the board.
export const tabStops = () => [...document.querySelectorAll('.workspace [tabindex="0"]')].map(el => `${el.className.baseVal ?? el.className}:${el.dataset.piece}`);
