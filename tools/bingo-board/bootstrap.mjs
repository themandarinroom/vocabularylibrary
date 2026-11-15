// Catch config/module failures before the app starts; retry performs a fresh page load.
export async function bootSolo({ loadConfig = () => import('./shared/solo-runtime-config.mjs'),
  loadApp = () => import('./app.mjs'), document: doc = globalThis.document,
  reload = () => globalThis.location.reload(), schedule = setTimeout, unschedule = clearTimeout } = {}) {
  const status = doc.getElementById('boot-status'), retry = doc.getElementById('boot-retry');
  let timer;
  try {
    await Promise.race([
      (async () => { const config = await loadConfig(); config.assertSoloRuntime(); await loadApp(); })(),
      new Promise((_, reject) => { timer = schedule(() => reject(new Error('Startup timed out.')), 15000); })
    ]);
    status.hidden = true; retry.hidden = true;
    return true;
  } catch {
    status.hidden = false;
    status.textContent = 'Bingo could not start. Check your connection and reload the page. Your game has not been saved or uploaded.';
    retry.hidden = false; retry.onclick = reload;
    return false;
  } finally { unschedule(timer); }
}
if (typeof document !== 'undefined') bootSolo();
