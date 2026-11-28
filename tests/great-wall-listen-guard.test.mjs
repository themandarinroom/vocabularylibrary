// Build the Great Wall reuses Bingo Solo's Production-accepted Listening Break (tools/bingo-board/listen-guard.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createListenGuard, LISTEN_GUARD } from '../tools/bingo-board/listen-guard.mjs';

const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const app = read('tools/great-wall/app.mjs');
const GW_KEY = app.match(/GREAT_WALL_BREAK_KEY = '([^']+)'/)[1];
function memory() { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: k => m.delete(k), m }; }
const gwGuard = (clock, storage) => createListenGuard({ config: { STORAGE_KEY: GW_KEY }, now: () => clock.t, storage });

test('accepted policy is unchanged: 5 taps in 2 s, 30 s break', () => {
  assert.equal(LISTEN_GUARD.TAP_LIMIT, 5); assert.equal(LISTEN_GUARD.WINDOW_MS, 2000); assert.equal(LISTEN_GUARD.COOLDOWN_MS, 30000);
  assert.equal(LISTEN_GUARD.STORAGE_KEY, 'tmr-bingo-solo-listen-break-until');
});
test('Great Wall uses the shared guard module, not a copy, with its own storage key', () => {
  assert.match(app, /import \{ createListenGuard \} from '\.\.\/bingo-board\/listen-guard\.mjs';/);
  assert.equal(GW_KEY, 'tmr-great-wall-listen-break-until');
  assert.notEqual(GW_KEY, LISTEN_GUARD.STORAGE_KEY);
  for (const f of fs.readdirSync(new URL('../tools/great-wall/', import.meta.url))) {
    if (f.endsWith('.mjs')) assert(!/taps\.filter|COOLDOWN_MS:/.test(read(`tools/great-wall/${f}`)), `${f} must not re-implement the guard`);
  }
});
test('rapid tapping starts a 30 s break at the 5th tap; normal replay does not', () => {
  const clock = { t: 1000 }, s = memory(), g = gwGuard(clock, s);
  for (let i = 0; i < 4; i++) { assert.equal(g.tap(), 'allowed'); clock.t += 700; }   // normal replays
  assert.equal(g.active(), false);
  const fresh = gwGuard({ t: 0 }, memory());
  const c2 = { t: 0 }, g2 = gwGuard(c2, s);
  for (let i = 0; i < 4; i++) { assert.equal(g2.tap(), 'allowed'); c2.t += 300; }
  assert.equal(g2.tap(), 'break');
  assert.equal(g2.remainingMs(), 30000);
  assert.equal(g2.tap(), 'blocked'); c2.t += 10000; assert.equal(g2.tap(), 'blocked');
  assert.equal(g2.remainingMs(), 20000, 'taps during a break never extend it');
  assert.equal(fresh.active(), false);
});
test('a refresh does not bypass the break, and it ends by itself', () => {
  const clock = { t: 5000 }, s = memory(), g = gwGuard(clock, s);
  for (let i = 0; i < 5; i++) g.tap();
  assert.equal(Number(s.get(GW_KEY)), 35000);
  clock.t += 12000;
  const reloaded = gwGuard(clock, s);           // a new page load reads the stored expiry
  assert.equal(reloaded.active(), true); assert.equal(reloaded.remainingMs(), 18000);
  assert.equal(reloaded.tap(), 'blocked');
  clock.t += 18000;
  assert.equal(reloaded.active(), false); assert.equal(s.get(GW_KEY), null);
  assert.equal(reloaded.tap(), 'allowed');
});
test('a Great Wall break never locks Bingo Solo, and the reverse', () => {
  const clock = { t: 0 }, s = memory(), gw = gwGuard(clock, s);
  for (let i = 0; i < 5; i++) gw.tap();
  assert.equal(createListenGuard({ now: () => clock.t, storage: s }).active(), false);
});
test('only the Listen button counts; automatic playback and fallback do not', () => {
  assert.equal((app.match(/guard\.tap\(\)/g) || []).length, 1);
  const listen = app.slice(app.indexOf("$('listen').addEventListener('click'"));
  assert(listen.indexOf('guard.tap()') < listen.indexOf('player.play('));
  assert.match(app, /if \(!onBreak\(\)\) player\.play\(entries\.get\(game\.state\.question\.targetKey\)\); \/\/ automatic/);
  assert(!/guard\.tap/.test(read('tools/listening-core/audio-player.mjs')), 'the audio player (and its fallback) never counts taps');
});
test('during a break: audio stops, answers, stones, Start/Build Again and Change words are refused', () => {
  assert.match(app, /function startBreak\(\) \{ stopAudio\(\); showBreak\(\); \}/);
  assert.match(app, /function stopAudio\(\) \{ player\.cancel\(\); audioBusySince = null; \}/);
  assert.match(app, /function answer\(key\) \{\n  if \(!game \|\| game\.state\.phase !== 'question' \|\| onBreak\(\)\) return;/);
  assert.match(app, /function placeStone\(slotId\) \{\n  if \(!game \|\| game\.state\.phase !== 'place' \|\| onBreak\(\)\) return;/);
  assert.match(app, /if \(!level \|\| onBreak\(\)\) return;/);
  assert.match(app, /\$\('change-set'\)\.addEventListener\('click', \(\) => \{ if \(onBreak\(\)\) return;/);
  assert.match(app, /if \(onBreak\(\)\) showBreak\(\);/);
  assert(!/player\.cancel\(\)/.test(app.replace('function stopAudio() { player.cancel();', '')), 'every stop also clears the busy flag');
});
test('reward videos and mystery boxes do not touch the guard', () => {
  const rewards = app.slice(app.indexOf('function showBoxes'), app.indexOf('function closeViewer'));
  assert(!/guard|onBreak/.test(rewards));
});
test('the Listening Break looks and reads exactly like Bingo Solo', () => {
  const block = html => html.match(/<div id="listen-break"[\s\S]*?<\/div>\n  <\/div>/)[0];
  assert.equal(block(read('tools/great-wall/index.html')), block(read('tools/bingo-board/index.html')));
  const css = f => read(f).split('\n').filter(l => /^\.(listen-break|break-card|break-count)/.test(l)).join('\n');
  assert.equal(css('tools/great-wall/styles.css'), css('tools/bingo-board/styles.css'));
  assert.match(read('tools/great-wall/index.html'), /styles\.css\?v=gw-0\.2\.2/);
});
