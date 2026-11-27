import { loadCatalogueWithTimeout, loadVoice } from './library.mjs';
import { VocabularySelection, ambiguousEntries } from './vocabulary.mjs';
import { validateConfiguration } from './board.mjs';
import { createSoloGame, answerSolo, nextSoloWord } from './solo.mjs';
import { createAudioPlayer } from './audio.mjs';
import { canUseAiVoice, speakMandarin, playTeacherVoice } from './shared/js/audio.js';
import { renderBoard } from './components/board.mjs';
import { renderStars } from './components/stars.mjs';
import { el } from './components/dom.mjs';
import { DISPLAY_ORDER, DEFAULT_DISPLAY, toggleDisplay, enabledCount, setSelectionState } from './display.mjs';
import { createListenGuard } from './listen-guard.mjs';
const yearLabel = yearLevel => Number(yearLevel) === 0 ? 'Prep' : Number.isFinite(Number(yearLevel)) && yearLevel !== null && yearLevel !== '' ? `Year ${yearLevel}` : 'All years';
const $ = id => document.getElementById(id);
let catalogue = [], selection = null, entries = new Map(), game = null, attemptNumber = 0, loading = false;
// v0.1.1 board display options (kept for this visit, across restarts). Images that fail to load fall back to text.
let display = DEFAULT_DISPLAY, images = new Map(), chineseTitles = new Map();
const brokenImages = new Set();
let audioMessage = 'Tap Listen Word to begin.';
// S3: after a correct answer the board shows the mark for ADVANCE_MS, then moves to the next word and plays it.
// The timer is started directly by the correct tap and plays inside its own callback (no network wait):
// the next word's lookup is fetched in advance, so the S2 audio player can start audio synchronously.
const ADVANCE_MS = 600;
let advanceTimer = null;
// Listen anti-spam (thresholds in listen-guard.mjs). The test harness may pass a shorter config.
const guard = createListenGuard({ config: globalThis.__TMR_LISTEN_GUARD_CONFIG__ });
let audioBusySince = null, breakTimer = null;
const audioBusy = () => audioBusySince !== null && Date.now() - audioBusySince < guard.config.BUSY_MAX_MS;
const onBreak = () => guard.active();
const SOUND_ERROR = 'Sound didn’t play. Tap Listen to try again.';
const player = createAudioPlayer({ getVoice: loadVoice, canUseAiVoice, speakMandarin, playTeacherVoice,
  stopAi: () => window.speechSynthesis?.cancel(),
  onStatus: status => {
    // Playback is "busy" from the first loading/playing report until it ends or fails (used to ignore overlapping Listen taps).
    if (status.kind === 'loading' || status.kind === 'playing') { if (audioBusySince === null) audioBusySince = Date.now(); }
    else audioBusySince = null;
    audioMessage = status.message; $('audio-status').textContent = audioMessage; $('audio-status').classList.toggle('warning', status.kind === 'error');
    // Full S2 audio messages stay available to screen readers in #audio-status; the visible line stays short.
    if (status.kind === 'error') feedback(SOUND_ERROR, 'warning');
    else if (status.kind === 'playing' && $('feedback').textContent === SOUND_ERROR) feedback('');
  }
});
$('boot-retry').onclick = () => window.location.reload();
const size = () => Number(document.querySelector('input[name="size"]:checked').value);
// Solo plays Line Bingo only (Full House is no longer offered in Solo; shared rules and Live are unchanged).
const winningMode = () => 'line';

function updateValidation() {
  const pool = selection?.items || [];
  try { validateConfiguration(pool, size(), winningMode()); $('configuration-status').textContent = `${pool.length} words ready · ${size()}×${size()} board · no timer`; $('start-solo').disabled = loading; }
  catch (error) { $('configuration-status').textContent = error.message; $('start-solo').disabled = true; }
  const groups = ambiguousEntries(pool);
  $('ambiguity-warning').hidden = groups.length === 0;
  $('ambiguity-warning').replaceChildren();
  if (groups.length) $('ambiguity-warning').append(el('strong', {}, 'Some words look identical.'),
    el('p', {}, 'Tap a word below to leave out one of the identical entries. Original Library records remain separate.'),
    el('ul', {}, ...groups.map(group => el('li', {}, `${group[0].chinese}: ${group.map(item => `${item.setId} / ${item.id} (${item.pinyin || 'no Pinyin'}; ${item.english || 'no meaning'})`).join(' · ')}`))));
}

// Vocabulary selector in the Build the Great Wall layout: sets grouped by year, each set's checkbox is its
// "Choose all" (partial = indeterminate); the words of every chosen set appear as chips that can be left out.
function renderSelection() {
  if (!selection) return;
  const focusKey = document.activeElement?.getAttribute('data-focus-key');
  const isSelected = key => selection.has(key);
  const groups = new Map();
  for (const set of catalogue) { const label = yearLabel(set.yearLevel); if (!groups.has(label)) groups.set(label, []); groups.get(label).push(set); }
  if (!catalogue.length) $('set-picker').replaceChildren(el('p', { className: 'help' }, loading ? 'Loading…' : 'No Vocabulary Sets are available yet.'));
  else $('set-picker').replaceChildren(...[...groups].map(([label, sets], index) => {
    const heading = el('p', { className: 'set-group-title', id: `set-group-${index}` }, label);
    return el('div', { className: 'set-group', role: 'group', 'aria-labelledby': heading.id }, heading, ...sets.map(set => {
      const state = setSelectionState(set, isSelected), chosen = set.items.filter(item => isSelected(item.key)).length;
      const name = el('span', {}, set.title);
      if (chineseTitles.get(set.id)) name.append(' ', el('span', { lang: 'zh-Hans' }, chineseTitles.get(set.id)));
      return el('label', { className: `set-option${state === 'some' ? ' partial' : ''}` },
        el('input', { type: 'checkbox', value: set.id, 'data-focus-key': `set:${set.id}`, checked: state === 'all', indeterminate: state === 'some', disabled: loading,
          onchange: event => { for (const item of set.items) selection.toggle(item.key, event.target.checked); renderSelection(); } }),
        name, el('small', {}, state === 'some' ? `${chosen} of ${set.items.length} words` : `${set.items.length} words`));
    }));
  }));
  $('set-picker').setAttribute('aria-busy', String(loading));
  const chosenSets = catalogue.filter(set => set.items.some(item => isSelected(item.key)));
  const pool = selection.items;
  $('set-count').textContent = chosenSets.length ? `${chosenSets.length} set${chosenSets.length > 1 ? 's' : ''} selected · ${pool.length} word${pool.length === 1 ? '' : 's'} chosen` : '';
  $('word-picker-area').hidden = !chosenSets.length;
  $('word-picker').replaceChildren(...chosenSets.flatMap(set => set.items.map(item => {
    const on = isSelected(item.key);
    return el('button', { type: 'button', className: `word-chip${on ? ' selected' : ''}`, 'aria-pressed': String(on), 'data-focus-key': `word:${item.key}`,
      'aria-label': `${item.chinese}, ${item.english || 'no meaning'}, from ${set.title}${on ? ', chosen' : ', left out'}`,
      onclick: () => { selection.toggle(item.key, !on); renderSelection(); } },
      el('strong', { lang: 'zh-Hans' }, item.chinese), item.english ? el('small', {}, item.english) : null);
  })));
  updateValidation();
  if (focusKey) {
    const target = [...document.querySelectorAll('[data-focus-key]')].find(node => node.getAttribute('data-focus-key') === focusKey);
    (target || $('set-picker').querySelector('input') || $('reload')).focus({ preventScroll: true });
  }
}

async function refreshCatalogue() {
  if (loading) return;
  loading = true; $('reload').disabled = true; $('start-solo').disabled = true; $('set-picker').querySelectorAll('input').forEach(input => { input.disabled = true; }); $('set-picker').setAttribute('aria-busy', 'true');
  $('load-status').textContent = 'Loading published vocabulary…';
  try {
    const result = await loadCatalogueWithTimeout();
    // Explicit reload preserves available custom identities and the browsed set.
    // Sets in Build the Great Wall order (year, then title). A reload keeps every still-available chosen word;
    // if nothing is chosen after a load, the first set is chosen, as Great Wall does.
    const previous = selection, chosen = previous ? previous.items.map(item => item.key) : [];
    catalogue = [...result.sets].filter(set => set.items.length).sort((a, b) => (Number(a.yearLevel) || 0) - (Number(b.yearLevel) || 0) || a.title.localeCompare(b.title));
    chineseTitles = result.chineseTitles || new Map();
    selection = new VocabularySelection(catalogue); selection.setMode('custom');
    const validKeys = new Set(catalogue.flatMap(set => set.items).map(item => item.key));
    chosen.filter(key => validKeys.has(key)).forEach(key => selection.toggle(key, true));
    if (!selection.items.length && catalogue.length) catalogue[0].items.forEach(item => selection.toggle(item.key, true));
    entries = new Map(catalogue.flatMap(set => set.items).map(item => [item.key, item]));
    images = new Map([...(result.images || new Map())].filter(([key]) => !brokenImages.has(key)));
    $('load-status').textContent = catalogue.length
      ? `${catalogue.length} published Vocabulary Sets.${chosen.some(key => !validKeys.has(key)) ? ' Some chosen words are no longer available and were removed.' : ''}`
      : 'No vocabulary is available right now. The Library may be empty or unreachable. Check your connection and tap Reload vocabulary; ask your teacher if this continues.';
    $('boot-retry').hidden = catalogue.length > 0;
    if (result.diagnostics.length) $('load-status').title = result.diagnostics.join('\n');
  } catch {
    $('load-status').textContent = 'Could not finish loading the Vocabulary Library. Check your connection and tap Reload vocabulary. Any previous selection is kept.';
    $('boot-retry').hidden = false;
  } finally { loading = false; $('reload').disabled = false; renderSelection(); }
}

function feedback(message, kind = '') {
  $('feedback').textContent = message; $('feedback').className = `play-feedback ${kind}`;
}
function cellNode(key) { return [...$('board').children].find(node => node.getAttribute('data-entry-key') === key); }
// One-off visual effect on a freshly rendered cell (shake for a wrong tap, glow for a correct one).
// S3.1: the class is removed when the animation ends OR after a fallback timer, because with Reduce Motion
// no animation runs and 'animationend' never fires (the effect must never persist as a "selected" look).
const FLASH_MS = { shake: 420, 'just-correct': 650 };
function flash(key, className) {
  const node = cellNode(key); if (!node) return;
  node.classList.add(className);
  const clear = () => node.classList.remove(className);
  node.addEventListener('animationend', clear, { once: true });
  setTimeout(clear, FLASH_MS[className] || 650);
}
// S3.1: remember whether the last input was keyboard or touch/mouse. A wrong cell is refocused only for
// keyboard users; after a tap, programmatic focus made iPad Safari draw a persistent focus ring.
let lastInput = 'pointer';
document.addEventListener('pointerdown', () => { lastInput = 'pointer'; }, true);
document.addEventListener('keydown', () => { lastInput = 'keyboard'; }, true);
function renderGame() {
  renderBoard($('board'), game, entries, submitAnswer, { display, images, onImageError: key => { if (images.has(key)) { brokenImages.add(key); images.delete(key); renderGame(); } } });
  renderStars($('stars'), game.stars);
  renderDisplayOptions();
  $('word-count').textContent = `Word ${game.round} / ${game.sequence.length}`;
  $('board-caption').textContent = `${game.size} × ${game.size} · ${game.winningMode === 'line' ? 'Line Bingo' : 'Full House'}`;
  $('practice-status').textContent = game.practice ? 'Practice Mode' : '';
  const active = game.status === 'playing';
  $('listen-word').disabled = !active; $('next-word').disabled = !active;
  $('result').hidden = active;
  if (!active) {
    stopAudio();
    $('result-title').textContent = game.status === 'won' ? (game.winningMode === 'line' ? 'Bingo! ★' : 'Full House! ★') : game.status === 'practice-complete' ? 'Practice complete!' : 'All words called';
  }
}
// Look up the current AND the upcoming word, so a later Listen tap or auto-advance can start audio at once.
function prefetchWords() {
  if (!game || game.status !== 'playing') return;
  player.prepare(entries.get(game.currentKey));
  const upcoming = game.sequence[game.round];
  if (upcoming) player.prepare(entries.get(upcoming));
}
function stopAudio() { player.cancel(); audioBusySince = null; }
function cancelAdvance() { if (advanceTimer !== null) { clearTimeout(advanceTimer); advanceTimer = null; } }
// Moves to the next word exactly once. autoplay=true only from a correct answer (or Listen during the pause).
function advance({ autoplay }) {
  cancelAdvance();
  if (!game || game.status !== 'playing') return;
  stopAudio(); game = nextSoloWord(game); renderGame(); feedback('');
  if (game.status !== 'playing') { $('audio-status').textContent = 'All words called.'; return; }
  prefetchWords();
  $('audio-status').classList.remove('warning');
  if (autoplay) player.play(entries.get(game.currentKey));
  else $('audio-status').textContent = 'Tap Listen Word for the next word.';
}
function submitAnswer(cellKey) {
  if (!game || advanceTimer !== null || onBreak()) return; // The answered word is locked during the short pause.
  // Snapshot round with each intent; the pure transition rejects stale submissions.
  const round = game.round, attemptId = `solo-${++attemptNumber}`;
  const result = answerSolo(game, { cellKey, attemptId, round }); game = result.state;
  const messages = {
    correct: ['Correct!', 'correct'],
    incorrect: ['Try again.', 'incorrect'],
    duplicate: ['Try a different word.', 'incorrect'],
    absent: ['Not on your board. Tap Next.', '']
  };
  if (messages[result.outcome]) feedback(...messages[result.outcome]);
  renderGame();
  if (result.outcome === 'correct') {
    flash(cellKey, 'just-correct');
    if (game.status === 'playing') advanceTimer = setTimeout(() => { advanceTimer = null; advance({ autoplay: true }); }, ADVANCE_MS);
    else $('restart').focus({ preventScroll: true });
  } else if (result.outcome === 'incorrect' || result.outcome === 'duplicate') {
    flash(cellKey, 'shake');
    if (lastInput === 'keyboard') cellNode(cellKey)?.focus({ preventScroll: true });
  }
}
function startGame() {
  if (onBreak()) return;
  try { game = createSoloGame(selection.items, { size: size(), winningMode: winningMode() }); }
  catch (error) { $('configuration-status').textContent = error.message; return; }
  cancelAdvance(); stopAudio(); attemptNumber = 0;
  $('setup').hidden = true; $('game').hidden = false;
  $('audio-status').textContent = 'Tap Listen Word to begin. Replays cost no stars.';
  $('audio-status').classList.remove('warning');
  feedback(''); renderGame();
  prefetchWords(); // Prefetch only; no autoplay or extra game progression.
  $('game-title').focus();
}
$('reload').addEventListener('click', refreshCatalogue);
document.querySelectorAll('input[name="size"]').forEach(control => control.addEventListener('change', updateValidation));
$('clear-all').addEventListener('click', () => { selection.clear(); renderSelection(); });
$('start-solo').addEventListener('click', startGame);
$('restart').addEventListener('click', startGame);   // startGame refuses during a break
// Every deliberate Listen tap is counted (including taps ignored while a word is still playing);
// automatic playback after a correct answer is not. TAP_LIMIT taps in WINDOW_MS start a Listening Break.
$('listen-word').addEventListener('click', () => {
  if (!game || game.status !== 'playing') return;
  const verdict = guard.tap();
  if (verdict === 'break') { startBreak(); return; }
  if (verdict === 'blocked') return;
  if (advanceTimer !== null) advance({ autoplay: true }); // During the pause, Listen means "the next word, now".
  else if (!audioBusy()) player.play(entries.get(game.currentKey)); // an overlapping request is ignored
});
$('next-word').addEventListener('click', () => { if (game && !onBreak()) advance({ autoplay: false }); });

// Listening Break: a full-page overlay. Audio stops, a pending auto-advance is cancelled, every control is
// blocked; the board, progress and stars are untouched. It ends by itself (no audio on unlock).
function startBreak() { cancelAdvance(); stopAudio(); showBreak(); }
function showBreak() {
  for (const node of [document.querySelector('header'), $('main'), document.querySelector('footer')]) if (node) node.inert = true;
  $('listen-break').hidden = false; $('break-title').focus({ preventScroll: true });
  tickBreak(); if (breakTimer === null) breakTimer = setInterval(tickBreak, 250);
}
function tickBreak() {
  if (!guard.active()) { endBreak(); return; }
  $('break-count').textContent = String(Math.ceil(guard.remainingMs() / 1000));
}
function endBreak() {
  if (breakTimer !== null) { clearInterval(breakTimer); breakTimer = null; }
  for (const node of [document.querySelector('header'), $('main'), document.querySelector('footer')]) if (node) node.inert = false;
  $('listen-break').hidden = true;
  if (game && !$('game').hidden) { $('audio-status').textContent = 'Tap Listen when you are ready.'; $('listen-word').focus({ preventScroll: true }); }
}
document.addEventListener('visibilitychange', () => { if (breakTimer !== null) tickBreak(); });
// v0.1.1 display options: change only what the cells show (never the board, the word, the answer checks or stars).
function renderDisplayOptions() {
  const last = enabledCount(display) === 1;
  for (const name of DISPLAY_ORDER) {
    const box = $(`display-${name}`);
    box.checked = display[name];
    box.disabled = last && display[name];          // the last option stays on, so the board never goes blank
    box.closest('label').classList.toggle('locked', box.disabled);
  }
  $('display-hint').hidden = !last;
}
for (const name of DISPLAY_ORDER) $(`display-${name}`).addEventListener('change', event => {
  display = toggleDisplay(display, name, event.target.checked);
  if (game) renderGame(); else renderDisplayOptions();
});
$('change-words').addEventListener('click', () => { if (onBreak()) return; cancelAdvance(); stopAudio(); game = null; $('game').hidden = true; $('setup').hidden = false; $('start-solo').focus(); });
window.addEventListener('pagehide', () => { cancelAdvance(); stopAudio(); });
refreshCatalogue();
if (onBreak()) showBreak();   // a reload does not skip the rest of a Listening Break
