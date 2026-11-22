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
const $ = id => document.getElementById(id);
let catalogue = [], selection = null, entries = new Map(), game = null, attemptNumber = 0, loading = false;
// v0.1.1 board display options (kept for this visit, across restarts). Images that fail to load fall back to text.
let display = DEFAULT_DISPLAY, images = new Map();
const brokenImages = new Set();
let audioMessage = 'Tap Listen Word to begin.';
// S3: after a correct answer the board shows the mark for ADVANCE_MS, then moves to the next word and plays it.
// The timer is started directly by the correct tap and plays inside its own callback (no network wait):
// the next word's lookup is fetched in advance, so the S2 audio player can start audio synchronously.
const ADVANCE_MS = 600;
let advanceTimer = null;
const SOUND_ERROR = 'Sound didn’t play. Tap Listen to try again.';
const player = createAudioPlayer({ getVoice: loadVoice, canUseAiVoice, speakMandarin, playTeacherVoice,
  stopAi: () => window.speechSynthesis?.cancel(),
  onStatus: status => {
    audioMessage = status.message; $('audio-status').textContent = audioMessage; $('audio-status').classList.toggle('warning', status.kind === 'error');
    // Full S2 audio messages stay available to screen readers in #audio-status; the visible line stays short.
    if (status.kind === 'error') feedback(SOUND_ERROR, 'warning');
    else if (status.kind === 'playing' && $('feedback').textContent === SOUND_ERROR) feedback('');
  }
});
$('boot-retry').onclick = () => window.location.reload();
const size = () => Number(document.querySelector('input[name="size"]:checked').value);
const winningMode = () => $('winning-mode').value;

function updateValidation() {
  const pool = selection?.items || [];
  $('selected-count').textContent = `${pool.length} selected`;
  try { validateConfiguration(pool, size(), winningMode()); $('configuration-status').textContent = `${pool.length} words ready · ${size()}×${size()} board · no timer`; $('start-solo').disabled = loading; }
  catch (error) { $('configuration-status').textContent = error.message; $('start-solo').disabled = true; }
  const groups = ambiguousEntries(pool);
  $('ambiguity-warning').hidden = groups.length === 0;
  $('ambiguity-warning').replaceChildren();
  if (groups.length) $('ambiguity-warning').append(el('strong', {}, 'Some words look identical.'),
    el('p', {}, 'Choose across sets and keep only one source entry for each visible word. Original Library records remain separate.'),
    el('ul', {}, ...groups.map(group => el('li', {}, `${group[0].chinese}: ${group.map(item => `${item.setId} / ${item.id} (${item.pinyin || 'no Pinyin'}; ${item.english || 'no meaning'})`).join(' · ')}`))));
}

function renderSelection() {
  if (!selection) return;
  const focusKey = document.activeElement?.getAttribute('data-focus-key');
  const custom = selection.mode === 'custom';
  const set = catalogue.find(value => value.id === selection.setId);
  // v0.1.1: "Choose all" for the set being browsed. Other sets' choices are untouched; partial = indeterminate.
  const setState = setSelectionState(set, key => selection.has(key));
  const chosenHere = (set?.items || []).filter(item => selection.has(item.key)).length;
  const chooseAll = custom && set?.items.length ? el('label', { className: 'word-row choose-all-row' },
    el('input', { type: 'checkbox', id: 'choose-all', 'data-focus-key': `choose-all:${set.id}`, checked: setState === 'all', indeterminate: setState === 'some',
      'aria-label': `Choose all words in ${set.title}`,
      onchange: event => { for (const item of set.items) selection.toggle(item.key, event.target.checked); renderSelection(); } }),
    el('span', { className: 'word-text' }, el('strong', {}, 'Choose all'), el('small', {}, `${chosenHere} of ${set.items.length} in this set selected`))) : null;
  $('word-list').replaceChildren(...[chooseAll].filter(Boolean), ...(set?.items || []).map(item => el('label', { className: 'word-row' },
    el('input', { type: 'checkbox', 'data-focus-key': `select:${item.key}`, checked: custom ? selection.has(item.key) : true, disabled: !custom,
      'aria-label': `Select ${item.chinese}, ${item.english}, from ${item.setId}`,
      onchange: event => { selection.toggle(item.key, event.target.checked); renderSelection(); } }),
    el('span', { className: 'word-text' }, el('strong', { lang: 'zh-Hans' }, item.chinese),
      el('small', {}, [item.pinyin, item.english].filter(Boolean).join(' · '))))));
  if (!set?.items.length) $('word-list').append(el('p', { className: 'help' }, 'No eligible words in this set. Choose another published set.'));
  $('selection-summary').hidden = !custom;
  $('selected-words').replaceChildren(...selection.items.map(item => el('button', {
    type: 'button', className: 'word-chip', 'data-focus-key': `remove:${item.key}`, 'aria-label': `Remove ${item.chinese}, ${item.english}, from ${item.setId}`,
    onclick: () => { selection.remove(item.key); renderSelection(); }
  }, `${item.chinese} ×`, item.english ? el('small', {}, item.english) : null)));
  if (custom && !selection.items.length) $('selected-words').append(el('p', { className: 'help' }, 'Choose words above. Your selection stays as you browse other sets.'));
  updateValidation();
  if (focusKey) {
    const target = [...document.querySelectorAll('[data-focus-key]')].find(node => node.getAttribute('data-focus-key') === focusKey);
    (target || $('clear-all')).focus({ preventScroll: true });
  }
}

async function refreshCatalogue() {
  if (loading) return;
  loading = true; $('reload').disabled = true; $('start-solo').disabled = true; $('source-controls').disabled = true;
  $('load-status').textContent = 'Loading published vocabulary…';
  try {
    const result = await loadCatalogueWithTimeout();
    // Explicit reload preserves available custom identities and the browsed set.
    const previous = selection, chosen = previous?.mode === 'custom' ? previous.items.map(item => item.key) : [];
    catalogue = result.sets; selection = new VocabularySelection(catalogue);
    const validKeys = new Set(catalogue.flatMap(set => set.items).map(item => item.key));
    chosen.filter(key => validKeys.has(key)).forEach(key => selection.toggle(key, true));
    if (previous) { selection.setMode(previous.mode); if (catalogue.some(set => set.id === previous.setId)) selection.browse(previous.setId); }
    entries = new Map(catalogue.flatMap(set => set.items).map(item => [item.key, item]));
    images = new Map([...(result.images || new Map())].filter(([key]) => !brokenImages.has(key)));
    $('set-picker').replaceChildren(...catalogue.map(set => el('option', { value: set.id }, `${Number(set.yearLevel) === 0 ? 'Prep' : `Year ${set.yearLevel}`} · ${set.title} (${set.items.length})`)));
    $('set-picker').value = selection.setId;
    $('source-controls').disabled = !catalogue.length;
    $('load-status').textContent = catalogue.length
      ? `Published Library entries loaded. Offline loading may use the Library’s last successful cache for this Library.${result.diagnostics.length ? ` ${result.diagnostics.length} invalid entries excluded.` : ''}${chosen.some(key => !validKeys.has(key)) ? ' Some selected entries are no longer available and were removed.' : ''}`
      : 'No vocabulary is available right now. The Library may be empty or unreachable. Check your connection and tap Reload vocabulary; ask your teacher if this continues.';
    $('boot-retry').hidden = catalogue.length > 0;
    if (result.diagnostics.length) $('load-status').title = result.diagnostics.join('\n');
  } catch {
    $('load-status').textContent = 'Could not finish loading the Vocabulary Library. Check your connection and tap Reload vocabulary. Any previous selection is kept.';
    $('source-controls').disabled = !catalogue.length;
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
    player.cancel();
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
function cancelAdvance() { if (advanceTimer !== null) { clearTimeout(advanceTimer); advanceTimer = null; } }
// Moves to the next word exactly once. autoplay=true only from a correct answer (or Listen during the pause).
function advance({ autoplay }) {
  cancelAdvance();
  if (!game || game.status !== 'playing') return;
  player.cancel(); game = nextSoloWord(game); renderGame(); feedback('');
  if (game.status !== 'playing') { $('audio-status').textContent = 'All words called.'; return; }
  prefetchWords();
  $('audio-status').classList.remove('warning');
  if (autoplay) player.play(entries.get(game.currentKey));
  else $('audio-status').textContent = 'Tap Listen Word for the next word.';
}
function submitAnswer(cellKey) {
  if (!game || advanceTimer !== null) return; // The answered word is locked during the short pause.
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
  try { game = createSoloGame(selection.items, { size: size(), winningMode: winningMode() }); }
  catch (error) { $('configuration-status').textContent = error.message; return; }
  cancelAdvance(); player.cancel(); attemptNumber = 0;
  $('setup').hidden = true; $('game').hidden = false;
  $('audio-status').textContent = 'Tap Listen Word to begin. Replays cost no stars.';
  $('audio-status').classList.remove('warning');
  feedback(''); renderGame();
  prefetchWords(); // Prefetch only; no autoplay or extra game progression.
  $('game-title').focus();
}
$('reload').addEventListener('click', refreshCatalogue);
$('set-picker').addEventListener('change', event => { selection.browse(event.target.value); renderSelection(); });
document.querySelectorAll('input[name="selection-mode"]').forEach(control => control.addEventListener('change', event => { selection.setMode(event.target.value); renderSelection(); }));
document.querySelectorAll('input[name="size"]').forEach(control => control.addEventListener('change', updateValidation));
$('winning-mode').addEventListener('change', updateValidation);
$('clear-all').addEventListener('click', () => { selection.clear(); renderSelection(); });
$('start-solo').addEventListener('click', startGame);
$('restart').addEventListener('click', startGame);
$('listen-word').addEventListener('click', () => {
  if (!game || game.status !== 'playing') return;
  if (advanceTimer !== null) advance({ autoplay: true }); // During the pause, Listen means "the next word, now".
  else player.play(entries.get(game.currentKey));
});
$('next-word').addEventListener('click', () => { if (game) advance({ autoplay: false }); });
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
$('change-words').addEventListener('click', () => { cancelAdvance(); player.cancel(); game = null; $('game').hidden = true; $('setup').hidden = false; $('start-solo').focus(); });
window.addEventListener('pagehide', () => { cancelAdvance(); player.cancel(); });
refreshCatalogue();
