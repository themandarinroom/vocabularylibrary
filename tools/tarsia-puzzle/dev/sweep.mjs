// Developer check: start every student shape on the live setup page and report the measured board and label sizes.
// Run from the browser console on tools/tarsia-puzzle/ (or via the preview tooling); it only drives the page's own UI.
export async function sweep(offset = 0) {
  const out = [], modes = ['pinyin-picture', 'pinyin-english', 'hanzi-pinyin', 'hanzi-picture', 'hanzi-english'];
  let i = offset;
  for (const shape of ['small-triangle-4', 'hexagon-6', 'triangle-9', 'hexagon-10']) {
    const mode = modes[i++ % 5];
    document.querySelector(`input[name=shape][value="${shape}"]`).click();
    document.querySelector(`input[name=mode][value="${mode}"]`).click();
    await new Promise(r => setTimeout(r, 100));
    window.__tarsiaWorkspace = null;
    (document.getElementById('start').offsetParent ? document.getElementById('start') : document.getElementById('touch-start-button')).click();
    for (let k = 0; k < 40 && !window.__tarsiaWorkspace; k++) await new Promise(r => setTimeout(r, 250));
    await new Promise(r => setTimeout(r, 600));
    const w = window.__tarsiaWorkspace, all = [...w.layouts.values()].flat().filter(Boolean), tray = document.querySelector('.tray-item');
    out.push({ shape, mode, side: w.side, minFont: +Math.min(...all.filter(x => x.fontPx).map(x => x.fontPx)).toFixed(1),
      minPic: all.some(x => x.D) ? Math.round(Math.min(...all.filter(x => x.D).map(x => x.D))) : null, overflow: all.filter(x => x.overflow).length,
      trayPieceW: tray ? Math.round(tray.getBoundingClientRect().width) : 0, hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth });
    document.getElementById('setup-btn').click();
    await new Promise(r => setTimeout(r, 300));
  }
  return out;
}
