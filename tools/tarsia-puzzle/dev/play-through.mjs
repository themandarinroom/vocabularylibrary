// Developer check: finish the current Small Triangle puzzle using only the student controls (Tap-to-place + Turn).
export async function finishSmallTriangle() {
  const w = window.__tarsiaWorkspace, wait = ms => new Promise(r => setTimeout(r, ms)), matches = () => parseInt(document.getElementById('progress-text').textContent);
  let pid = 900; const tap = el => { if (!el) return; const o = { bubbles: true, pointerId: ++pid, pointerType: 'touch', isPrimary: true, clientX: 5, clientY: 5 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); };
  const done = () => document.body.classList.contains('puzzle-complete');
  document.getElementById('mode-tap').click(); await wait(50);
  const labels = id => document.querySelectorAll(`.tray-item[data-piece="${id}"] text, .tray-item[data-piece="${id}"] image`).length;
  const centre = w.state.tray.find(id => labels(id) === 3);
  tap(document.querySelector(`.tray-item[data-piece="${centre}"]`)); await wait(20);
  document.querySelector('.slot[data-slot="r1c2"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(20);
  for (const id of [...w.state.tray]) for (const slot of ['r0c2', 'r1c1', 'r1c3']) {
    if (done() || Object.values(w.state.pieces).some(p => p.slot === slot)) continue;
    const base = matches(); tap(document.querySelector(`.tray-item[data-piece="${id}"]`)); await wait(20);
    document.querySelector(`.slot[data-slot="${slot}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(20);
    if (!w.state.pieces[id].slot) { if (document.querySelector('.tray-item.selected')) tap(document.querySelector(`.tray-item[data-piece="${id}"]`)); continue; }
    tap(document.querySelector(`g[data-piece="${id}"]`)); await wait(20);
    let ok = false; for (let r = 0; r < 3; r++) { if (matches() > base || done()) { ok = true; break; } document.getElementById('turn-btn').click(); await wait(20); }
    if (ok) { if (!done()) tap(document.querySelector(`g[data-piece="${id}"]`)); await wait(20); break; }
    document.getElementById('back-btn').click(); await wait(20); if (document.querySelector('.tray-item.selected')) tap(document.querySelector(`.tray-item[data-piece="${id}"]`)); await wait(10);
  }
  return { complete: done(), progress: document.getElementById('progress-text').textContent };
}
