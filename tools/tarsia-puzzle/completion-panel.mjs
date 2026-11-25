// Tarsia completion experience (Phase C2): a modest celebration, optional first name and class, a live preview of
// the learning record, and Save (iPad share sheet → press-and-hold fallback → download).
// Privacy: the name and class live only in this page's memory and in the PNG made on this device. They are never
// stored, sent to Firebase/analytics or included in any request. The only network requests are the picture fetches
// (strict CORS loader), which carry no student data.
import { tarsiaCompletionRecord } from './engine/index.mjs';
import { drawTarsiaBoard, recordImageUrls, puzzleLine } from './record-board.mjs';
import { loadAllStrict, ImageLoadError } from '../learning-record-export/image-loader.mjs';
import { drawRecordCard, CARD } from '../learning-record-export/card.mjs';
import { canvasToPngBlob, recordFileName, shareOrOffer } from '../learning-record-export/export.mjs';

const $ = id => document.getElementById(id);

// Pure: what the panel says about the finished puzzle.
export function completionSummary(record) {
  const n = record.matchesCompleted;
  return `You matched all ${n} word ${n === 1 ? 'pair' : 'pairs'} in the ${record.content.shapeName} (${record.matchingMode.label}).`;
}

/**
 * @param {{ puzzle, state, sets: {id,title,chineseTitle}[], completedAt?: Date, rewrite?: (url:string)=>string,
 *           onPlayAgain: ()=>void, onSetup: ()=>void }} options
 */
export function openCompletionPanel({ puzzle, state, sets, completedAt = new Date(), rewrite, onPlayAgain, onSetup }) {
  const ac = new AbortController(), on = { signal: ac.signal };
  const panel = $('complete-panel');
  let images = null, emblem = null, blob = null, previewUrl = null, fallbackUrl = null, timer = null, closed = false, renderToken = 0;
  const record = student => tarsiaCompletionRecord(puzzle, state, { vocabularySets: sets, student, completedAt });
  const base = record({});
  $('cp-summary').textContent = completionSummary(base);
  $('cp-name').value = ''; $('cp-class').value = '';
  $('cp-fallback').hidden = true; $('cp-retry').hidden = true;
  $('cp-preview').closest('figure').hidden = true; // shown once a record has been made
  setStatus('Making your learning record…');

  function setStatus(text, kind = '') { $('cp-status').textContent = text; $('cp-status').dataset.kind = kind; }
  const student = () => ({ firstName: $('cp-name').value, className: $('cp-class').value });

  async function loadAssets() {
    $('cp-save').disabled = true; $('cp-retry').hidden = true;
    emblem = emblem || await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = '../../assets/brand/emblem-header.png'; });
    try { images = await loadAllStrict(recordImageUrls(base.content), { rewrite }); }
    catch (error) {
      images = null;
      setStatus(error instanceof ImageLoadError
        ? 'Some pictures could not be loaded, so your learning record cannot be made right now. Check the internet connection and try again.'
        : 'Your learning record could not be made. Please try again.', 'error');
      $('cp-retry').hidden = false;
      return false;
    }
    return true;
  }

  async function render() {
    if (!images) return;
    const token = ++renderToken, rec = record(student());
    const canvas = document.createElement('canvas'); canvas.width = CARD.width; canvas.height = CARD.height;
    drawRecordCard(canvas.getContext('2d'), rec, { emblem, puzzleLine: puzzleLine(rec.content), drawContent: (ctx, box) => drawTarsiaBoard(ctx, box, rec.content, images) });
    let next;
    try { next = await canvasToPngBlob(canvas); } catch { setStatus('Your learning record could not be made on this device.', 'error'); return; }
    if (token !== renderToken || closed) return; // a newer render (name typed) replaced this one
    blob = next;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    $('cp-preview').src = previewUrl; $('cp-preview').closest('figure').hidden = false;
    $('cp-save').disabled = false; $('cp-save').dataset.filename = recordFileName(rec);
    setStatus('Your learning record is ready.', 'ok');
  }

  async function save() {
    if (!blob) return;
    // Called straight from the tap, with the PNG already made, so iPad Safari keeps the share permission.
    const result = await shareOrOffer(blob, $('cp-save').dataset.filename);
    if (result === 'shared') { setStatus('Saved. Look for it where you chose to save it (for example Photos).', 'ok'); return; }
    if (result === 'cancelled') return;
    if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
    fallbackUrl = URL.createObjectURL(blob);
    $('cp-fallback-img').src = fallbackUrl;
    $('cp-download').href = fallbackUrl; $('cp-download').download = $('cp-save').dataset.filename;
    $('cp-fallback').hidden = false;
    $('cp-fallback').scrollIntoView({ block: 'nearest' });
  }

  const debounced = () => { clearTimeout(timer); $('cp-save').disabled = true; timer = setTimeout(render, 250); };
  $('cp-name').addEventListener('input', debounced, on);
  $('cp-class').addEventListener('input', debounced, on);
  $('cp-save').addEventListener('click', save, on);
  $('cp-retry').addEventListener('click', async () => { setStatus('Trying again…'); if (await loadAssets()) render(); }, on);
  $('cp-again').addEventListener('click', () => { close(); onPlayAgain(); }, on);
  $('cp-setup').addEventListener('click', () => { close(); onSetup(); }, on);
  $('cp-close').addEventListener('click', hide, on);
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); }, on);

  function show() { panel.hidden = false; $('cp-title').focus({ preventScroll: true }); }
  function hide() { panel.hidden = true; $('record-open')?.focus(); }
  function close() {
    closed = true; ac.abort(); clearTimeout(timer); panel.hidden = true;
    for (const u of [previewUrl, fallbackUrl]) if (u) URL.revokeObjectURL(u);
    $('cp-preview').removeAttribute('src'); $('cp-fallback-img').removeAttribute('src');
    $('cp-name').value = ''; $('cp-class').value = ''; // nothing about the student is kept after the puzzle closes
  }
  show();
  loadAssets().then(ok => ok && render());
  return { show, hide, close };
}
