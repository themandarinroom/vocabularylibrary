// Evidence of Learning — shared, activity-independent image loading for canvas export (Phase C1 proof of concept).
//
// Pictures that will be drawn into an exported canvas must be fetched in CORS mode; otherwise the canvas becomes
// "tainted" and cannot be exported. They are fetched fresh (`cache: 'no-store'`) so that a copy the page displayed
// earlier without CORS (e.g. on the puzzle board) can never be reused from the browser cache — a known Safari pitfall.
//
// Strict by design: if any picture cannot be loaded, the whole set fails with ImageLoadError so the caller never
// produces an incomplete learning record silently.

export class ImageLoadError extends Error {
  constructor(failures) {
    super(`${failures.length} ${failures.length === 1 ? 'picture' : 'pictures'} could not be loaded.`);
    this.name = 'ImageLoadError'; this.failures = failures; // [{ url, reason }]
  }
}

const defaultDecode = async blob => {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob), img = new Image();
  try { img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
};

/**
 * @param {string} url  published picture URL
 * @param {{ fetchImpl?: Function, decode?: Function, rewrite?: (url:string)=>string, timeoutMs?: number }} [options]
 *   `rewrite` exists only for the local developer relay; the product passes URLs through unchanged.
 * @returns {Promise<{ url: string, image: any, width: number, height: number }>}
 */
export async function loadImageStrict(url, { fetchImpl = globalThis.fetch, decode = defaultDecode, rewrite = u => u, timeoutMs = 15000 } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    let response;
    try { response = await fetchImpl(rewrite(url), { mode: 'cors', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller?.signal }); }
    catch (error) { throw new Error(error?.name === 'AbortError' ? 'timed out' : 'blocked or unreachable (often a missing CORS permission)'); }
    if (!response.ok) throw new Error(`server answered ${response.status}`);
    const blob = await response.blob();
    if (!/^image\//.test(blob.type || '')) throw new Error(`not an image (${blob.type || 'unknown type'})`);
    const image = await decode(blob);
    const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
    if (!width || !height) throw new Error('the picture could not be decoded');
    return { url, image, width, height };
  } finally { if (timer) clearTimeout(timer); }
}

// Loads every distinct URL; resolves to Map(url → loaded) or rejects with ImageLoadError listing every failure.
export async function loadAllStrict(urls, options) {
  const unique = [...new Set(urls.filter(Boolean))];
  const results = await Promise.allSettled(unique.map(u => loadImageStrict(u, options)));
  const failures = results.flatMap((r, i) => r.status === 'rejected' ? [{ url: unique[i], reason: r.reason?.message || String(r.reason) }] : []);
  if (failures.length) throw new ImageLoadError(failures);
  return new Map(results.map((r, i) => [unique[i], r.value]));
}
