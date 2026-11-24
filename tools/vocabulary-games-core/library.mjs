// Vocabulary Games core: published vocabulary (read-only, anonymous).
// Uses the vendored, Production-locked copy of the Vocabulary Library data layer in ./shared/,
// byte-identical to the copies Listening Core and Bingo Solo ship.
import { getSets } from './shared/js/vocabulary-store.js';
import { catalogueFromSets } from './vocabulary.mjs';

// The existing API returns only published, non-deleted sets (or its same-project cache).
export async function loadCatalogue() { return catalogueFromSets(await getSets()); }

export async function loadCatalogueWithTimeout({ load = loadCatalogue, timeoutMs = 15000,
  schedule = setTimeout, unschedule = clearTimeout } = {}) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(load),
      new Promise((_, reject) => { timer = schedule(() => reject(new Error('Vocabulary loading timed out.')), timeoutMs); })
    ]);
  } finally { unschedule(timer); }
}
