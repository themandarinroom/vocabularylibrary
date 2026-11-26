// Evidence of Learning — shared PNG export and hand-off (Phase C1 proof of concept). Everything stays on the device.

// canvas → PNG Blob. toBlob is supported by iPadOS Safari; toDataURL is the fallback for engines without it.
export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    const fromDataUrl = () => {
      try {
        const data = canvas.toDataURL('image/png'), bytes = atob(data.split(',')[1]), arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        resolve(new Blob([arr], { type: 'image/png' }));
      } catch (error) { reject(error); } // SecurityError here means a tainted canvas
    };
    if (typeof canvas.toBlob !== 'function') return fromDataUrl();
    try { canvas.toBlob(blob => blob ? resolve(blob) : fromDataUrl(), 'image/png'); } catch (error) { reject(error); }
  });
}

// "tarsia-puzzle-2026-11-25-mia.png" — ASCII-safe; the optional first name stays only in this local file name.
export function recordFileName(record) {
  const slug = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  return [slug(record.activity?.id) || 'learning-record', record.completedAt, slug(record.student?.firstName)].filter(Boolean).join('-') + '.png';
}

/**
 * Offer the PNG to the student. Never assumes the image lands in Photos by itself.
 *  - iPadOS 15+ Safari: native share sheet with the file ("Save Image" saves to Photos), when supported.
 *  - Otherwise: 'offer' — the caller shows the image (press and hold → Save to Photos / Copy) plus a download link.
 * @returns {Promise<'shared'|'cancelled'|'offer'>}
 */
export async function shareOrOffer(blob, filename, { nav = globalThis.navigator, FileCtor = globalThis.File } = {}) {
  const file = FileCtor ? new FileCtor([blob], filename, { type: 'image/png' }) : null;
  if (file && nav?.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: 'Learning record' }); return 'shared'; }
    catch (error) { if (error?.name === 'AbortError') return 'cancelled'; }
  }
  return 'offer';
}

/**
 * D3: should saving use the native file-sharing sheet? Only on phones and tablets.
 * iPadOS Safari in its default desktop-class mode reports a Mac user agent ("Macintosh", platform "MacIntel"), but it
 * has a touch screen; real Macs report maxTouchPoints 0. So Mac + touch = iPad, not a desktop computer.
 */
export function prefersShareSheet({ nav = globalThis.navigator } = {}) {
  const ua = String(nav?.userAgent || ''), platform = String(nav?.platform || ''), touch = Number(nav?.maxTouchPoints || 0);
  if (/\b(iPad|iPhone|iPod)\b/.test(ua)) return true;
  if ((platform === 'MacIntel' || /Macintosh/.test(ua)) && touch > 1) return true; // iPadOS, desktop-class Safari
  if (nav?.userAgentData?.mobile === true) return true;
  if (/Android/.test(ua) && touch > 0) return true;
  return false;
}

// Standard browser download: the browser puts the file wherever the user has chosen for downloads.
export function downloadBlob(blob, filename, { doc = globalThis.document, URLApi = globalThis.URL, later = (fn, ms) => setTimeout(fn, ms) } = {}) {
  const url = URLApi.createObjectURL(blob), a = doc.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
  doc.body.appendChild(a); a.click(); a.remove();
  later(() => URLApi.revokeObjectURL(url), 60_000); // keep the URL alive long enough for the download to start
}

/**
 * D3: save the learning record PNG the way the device expects. Never claims the file was saved.
 *  - Desktop/laptop (any OS): standard download, even where the Web Share API exists           → 'downloaded'
 *  - iPad/iPhone/phones: native file sharing (Save Image / Save to Files), when supported     → 'shared' (sheet used)
 *      cancelled by the student                                                               → 'cancelled'
 *      file sharing unavailable or failed: the caller shows press-and-hold + a download link  → 'offer'
 * Must be called straight from the tap, with the PNG already made (iPad Safari share permission).
 * @returns {Promise<'downloaded'|'shared'|'cancelled'|'offer'>}
 */
export async function saveLearningRecord(blob, filename, { nav = globalThis.navigator, FileCtor = globalThis.File, mobile, download = downloadBlob } = {}) {
  if (!(mobile ?? prefersShareSheet({ nav }))) { download(blob, filename); return 'downloaded'; }
  const file = FileCtor ? new FileCtor([blob], filename, { type: 'image/png' }) : null;
  if (file && typeof nav?.share === 'function' && nav?.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: 'Learning record' }); return 'shared'; }
    catch (error) { if (error?.name === 'AbortError') return 'cancelled'; }
  }
  return 'offer';
}
