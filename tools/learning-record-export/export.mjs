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
