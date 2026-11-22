// Build the Great Wall v0.1 — Solo listening game. No sign-in, no saving, no writes.
import { loadCatalogueWithTimeout, loadVoice } from '../listening-core/library.mjs';
import { listeningPool, yearLabel } from '../listening-core/vocabulary.mjs';
import { LEVELS, LEVEL_ORDER, levelAvailability, supportedLevel, MIN_POOL } from '../listening-core/rounds.mjs';
import { createAudioPlayer } from '../listening-core/audio-player.mjs';
import { canUseAiVoice, speakMandarin, playTeacherVoice } from '../listening-core/shared/js/audio.js';
import { createWallGame, TARGET_BRICKS } from './game.mjs';
import { sceneMarkup, renderStones } from './scene.mjs';
import { SLOTS } from './wall.mjs';
import { REWARDS, assignBoxes, rewardById, VIDEO_SECONDS } from './rewards.mjs';

const $ = id => document.getElementById(id);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ADVANCE_MS = 600;      // Same pause as Bingo Solo's iPad-verified auto-advance after a tap.
const CELEBRATE_MS = 2600;
const params = new URLSearchParams(location.search);

let catalogue = [], loading = false;
let chosenSetId = params.get('set') || '', chosenLevel = LEVELS[params.get('level')] ? params.get('level') : 'easy';
let pool = [], entries = new Map(), game = null, heardOnce = false, justPlaced = null, timers = [];
const brokenImages = new Set();
let boxes = [];

const later = (fn, ms) => { const id = setTimeout(() => { timers = timers.filter(t => t !== id); fn(); }, ms); timers.push(id); return id; };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

const player = createAudioPlayer({ getVoice: loadVoice, canUseAiVoice, speakMandarin, playTeacherVoice,
  stopAi: () => window.speechSynthesis?.cancel(),
  onStatus: status => {
    $('audio-status').textContent = status.message;
    $('listen').classList.toggle('playing', status.kind === 'playing');
    if (status.kind === 'error') { feedback('The sound did not play. Tap Listen to try again.', 'warning'); enableChoices(); }
    else if (status.kind === 'playing') { if ($('feedback').classList.contains('warning')) feedback(''); enableChoices(); }
  }
});

/* ---------- Setup ---------- */
// Each scene gets its own gradient/filter IDs: a hidden SVG's definitions cannot paint a visible one.
[['.hero-scene', 'gwh'], ['#scene', 'gwg'], ['.complete-scene', 'gwc']].forEach(([selector, prefix]) => document.querySelector(selector).insertAdjacentHTML('beforeend', sceneMarkup(prefix)));
renderStones(document.querySelector('.hero-scene .stones'), { placed: [], legal: [] });

function currentSet() { return catalogue.find(set => set.id === chosenSetId) || null; }
function updateSetup() {
  const set = currentSet();
  ({ pool } = set ? listeningPool(set) : { pool: [] });
  const available = levelAvailability(pool.length);
  for (const id of LEVEL_ORDER) {
    const input = document.querySelector(`input[name="level"][value="${id}"]`);
    input.disabled = !available[id];
    input.closest('label').classList.toggle('unavailable', !available[id]);
    document.querySelector(`[data-level-note="${id}"]`).textContent = available[id] ? `${LEVELS[id].choices} choices` : `Needs ${LEVELS[id].choices} different words`;
  }
  const level = supportedLevel(pool.length, chosenLevel);
  let message;
  if (!set) message = catalogue.length ? 'Choose a Vocabulary Set.' : 'No Vocabulary Sets are available yet.';
  else if (!level) message = `This set has only ${pool.length} different word${pool.length === 1 ? '' : 's'}. Choose a set with at least ${MIN_POOL}.`;
  else {
    if (level !== chosenLevel) { message = `This set has ${pool.length} different words, so ${LEVELS[chosenLevel].label} isn’t available. ${LEVELS[level].label} is selected.`; }
    else message = `${pool.length} words ready · ${LEVELS[level].label}, ${LEVELS[level].choices} choices.`;
    document.querySelector(`input[name="level"][value="${level}"]`).checked = true;
  }
  $('config-status').textContent = message;
  $('start').disabled = loading || !set || !level;
  $('set-preview').replaceChildren(...pool.slice(0, 24).map(item => {
    const chip = document.createElement('span'); chip.className = 'word-chip';
    const zh = document.createElement('strong'); zh.lang = 'zh-Hans'; zh.textContent = item.chinese;
    chip.append(zh);
    if (item.english) { const en = document.createElement('small'); en.textContent = item.english; chip.append(en); }
    return chip;
  }));
  if (pool.length > 24) { const more = document.createElement('span'); more.className = 'help'; more.textContent = `+ ${pool.length - 24} more`; $('set-preview').append(more); }
}

async function refreshCatalogue() {
  if (loading) return;
  loading = true; $('reload').disabled = true; $('start').disabled = true; $('set-picker').disabled = true;
  $('load-status').textContent = 'Loading published vocabulary…';
  try {
    const result = await loadCatalogueWithTimeout();
    catalogue = [...result.sets].filter(set => set.items.length).sort((a, b) => (Number(a.yearLevel) || 0) - (Number(b.yearLevel) || 0) || a.title.localeCompare(b.title));
    if (!catalogue.some(set => set.id === chosenSetId)) chosenSetId = catalogue[0]?.id || '';
    const groups = new Map();
    for (const set of catalogue) { const label = yearLabel(set.yearLevel); if (!groups.has(label)) groups.set(label, []); groups.get(label).push(set); }
    $('set-picker').replaceChildren(...[...groups].map(([label, sets]) => {
      const group = document.createElement('optgroup'); group.label = label;
      group.append(...sets.map(set => { const option = document.createElement('option'); option.value = set.id; option.textContent = `${set.title}${set.chineseTitle ? ` ${set.chineseTitle}` : ''} (${listeningPool(set).pool.length})`; return option; }));
      return group;
    }));
    $('set-picker').value = chosenSetId;
    $('set-picker').disabled = !catalogue.length;
    $('load-status').textContent = catalogue.length ? `${catalogue.length} published Vocabulary Sets.` : 'No vocabulary is available right now. Check your connection and tap Reload vocabulary.';
    $('boot-retry').hidden = catalogue.length > 0;
  } catch {
    $('load-status').textContent = 'Could not load the Vocabulary Library. Check your connection and tap Reload vocabulary.';
    $('set-picker').disabled = !catalogue.length;
  } finally { loading = false; $('reload').disabled = false; updateSetup(); }
}

/* ---------- Game ---------- */
const sceneStones = () => $('scene').querySelector('.stones');
function feedback(message, kind = '') { $('feedback').textContent = message; $('feedback').className = `feedback ${kind}`; }
function enableChoices() { heardOnce = true; document.querySelectorAll('#choices .choice').forEach(button => { if (!button.classList.contains('tried')) button.disabled = false; }); }

function renderProgress() {
  const placed = game.state.placed.length;
  $('progress').replaceChildren(...Array.from({ length: TARGET_BRICKS }, (_, i) => { const pip = document.createElement('span'); pip.className = `pip${i < placed ? ' done' : ''}`; return pip; }));
  $('progress').setAttribute('aria-label', `${placed} of ${TARGET_BRICKS} stones built`);
  $('progress-text').textContent = `${placed} / ${TARGET_BRICKS}`;
}
function renderWall() {
  const { state } = game;
  renderStones(sceneStones(), { placed: state.placed, legal: game.legalSlots(), justPlaced, onPick: placeStone });
  $('scene').classList.toggle('placing', state.phase === 'place');
}
function renderChoices() {
  const { question } = game.state;
  $('choices').className = `choices count-${question.options.length} mode-${question.mode}`;
  $('prompt').textContent = question.mode === 'picture' ? 'Listen, then tap the matching picture.' : 'Listen, then tap the matching word.';
  $('choices').replaceChildren(...question.options.map((key, index) => {
    const item = entries.get(key);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'choice'; button.dataset.key = key;
    const tried = question.wrong.includes(key);
    if (tried) button.classList.add('tried');
    button.disabled = tried || !heardOnce;
    if (question.mode === 'picture') {
      button.setAttribute('aria-label', `Answer ${index + 1}: ${item.english || 'picture'}`);
      const image = document.createElement('img');
      image.src = item.image; image.alt = ''; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; image.draggable = false;
      image.addEventListener('error', () => { brokenImages.add(key); game.refreshMode(); renderChoices(); }, { once: true });
      button.append(image);
    } else {
      const word = document.createElement('span'); word.className = 'hanzi'; word.lang = 'zh-Hans'; word.textContent = item.chinese;
      button.append(word);
    }
    button.addEventListener('click', () => answer(key));
    return button;
  }));
}
function renderGame() {
  const { state } = game;
  renderProgress(); renderWall();
  $('question-area').hidden = state.phase !== 'question';
  $('place-area').hidden = state.phase !== 'place';
  if (state.phase === 'question') renderChoices();
}
function prepareAudio() {
  if (game.state.phase === 'question') player.prepare(entries.get(game.state.question.targetKey));
  player.prepare(entries.get(game.upcomingKey()));
}
function answer(key) {
  if (!game || game.state.phase !== 'question') return;
  const outcome = game.answer(key);
  if (outcome === 'correct') {
    player.cancel();
    feedback(['Correct! 对了！', 'Well done! 太棒了！', 'Great listening! 很好！'][game.state.correct % 3], 'correct');
    document.querySelector(`#choices [data-key="${CSS.escape(key)}"]`)?.classList.add('right');
    document.querySelectorAll('#choices .choice').forEach(button => { button.disabled = true; });
    later(() => { renderGame(); focusFirstSlot(); }, reducedMotion() ? 250 : 700);
  } else if (outcome === 'incorrect') {
    feedback('Not quite. Listen again and try another one.', 'incorrect');
    renderChoices();
    if (!reducedMotion()) document.querySelector(`#choices [data-key="${CSS.escape(key)}"]`)?.classList.add('shake');
  }
}
let lastInput = 'pointer';
document.addEventListener('pointerdown', () => { lastInput = 'pointer'; }, true);
document.addEventListener('keydown', () => { lastInput = 'keyboard'; }, true);
function focusFirstSlot() { if (lastInput === 'keyboard') sceneStones().querySelector('.slot.legal')?.focus(); }

function placeStone(slotId) {
  if (!game || game.state.phase !== 'place') return;
  const outcome = game.place(slotId);
  if (outcome === 'illegal' || outcome === 'inactive') return;
  justPlaced = slotId;
  feedback(outcome === 'complete' ? 'The last stone! 最后一块！' : 'Stone placed!', 'correct');
  renderProgress(); renderWall();
  $('place-area').hidden = true;
  if (outcome === 'complete') { later(celebrate, reducedMotion() ? 300 : 800); return; }
  // Next question; its audio was prepared in advance so it can start inside this tap's timer (iPad Safari).
  later(() => {
    justPlaced = null; feedback('');
    renderGame(); prepareAudio();
    player.play(entries.get(game.state.question.targetKey));
    if (lastInput === 'keyboard') $('listen').focus();
  }, ADVANCE_MS);
}

function startGame() {
  const level = supportedLevel(pool.length, chosenLevel);
  if (!level) return;
  clearTimers(); player.cancel(); closeViewer(false);
  try { game = createWallGame({ pool, level, brokenImages }); }
  catch (error) { $('config-status').textContent = error.message; return; }
  entries = new Map(pool.map(item => [item.key, item]));
  heardOnce = false; justPlaced = null; boxes = assignBoxes();
  $('scene').querySelector('.celebration').setAttribute('hidden', '');
  $('scene').classList.remove('done');
  for (const id of ['setup', 'reward', 'complete']) $(id).hidden = true;
  $('change-set').hidden = false;
  $('game').hidden = false;
  feedback(''); $('audio-status').textContent = '';
  renderGame(); prepareAudio();
  $('prompt').textContent = 'Tap Listen to hear your first word.';
  $('listen').classList.add('invite');
  $('game-title').focus({ preventScroll: true });
}

/* ---------- Completion and reward ---------- */
function celebrate() {
  justPlaced = null; renderWall();
  $('change-set').hidden = true; // Nothing to interrupt the finish; Build Again keeps the same words.
  $('scene').querySelector('.celebration').removeAttribute('hidden');
  $('scene').classList.add('done');
  feedback('The wall is finished! 长城建好了！', 'correct');
  later(showBoxes, reducedMotion() ? 1200 : CELEBRATE_MS);
}
function showBoxes() {
  $('boxes').replaceChildren(...boxes.map((id, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'mystery-box';
    button.setAttribute('aria-label', `Mystery box ${index + 1}`);
    button.innerHTML = '<span class="lid" aria-hidden="true"></span><span class="box-body" aria-hidden="true"><span class="ribbon"></span><span class="mark">?</span></span>';
    button.addEventListener('click', () => openBox(id, button), { once: true });
    return button;
  }));
  $('reward').hidden = false;
  $('reward-title').focus({ preventScroll: true });
}

const video = $('reward-video');
let viewerTimer = null, viewerStart = 0, viewerDone = false, viewerReturn = null;
function setProgress(fraction) { $('viewer-progress').style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`; }
function openBox(id, button) {
  const reward = rewardById(id);
  document.querySelectorAll('.mystery-box').forEach(box => { box.disabled = true; });
  button.classList.add('opened');
  viewerDone = false; viewerReturn = button;
  $('viewer-title').textContent = '';
  $('viewer-title').append(reward.title, ' ', Object.assign(document.createElement('span'), { lang: 'zh-Hans', textContent: reward.chinese }));
  $('viewer-credit').textContent = reward.available ? reward.credit : '';
  $('viewer-message').textContent = '';
  $('reward-fallback').hidden = true; $('reward-placeholder').hidden = true; video.hidden = true;
  setProgress(0);
  $('viewer').hidden = false;
  if (reward.available) {
    // Started inside the box tap, so iPad Safari allows playback with sound. Never loops.
    video.hidden = false; video.loop = false; video.poster = reward.poster;
    video.src = reward.src;
    video.play().catch(() => showFallback(reward, 'The video could not start, so here is a picture instead.'));
    startClock(true);
  } else {
    $('reward-placeholder').hidden = false;
    $('reward-placeholder').innerHTML = '';
    $('reward-placeholder').append(Object.assign(document.createElement('strong'), { textContent: 'Video placeholder' }),
      Object.assign(document.createElement('span'), { textContent: `“${reward.title}” — the licensed 10-second video has not been added yet.` }));
    startClock(false);
  }
  $('viewer-close').focus({ preventScroll: true });
}
function startClock(followVideo) {
  clearInterval(viewerTimer);
  viewerStart = performance.now();
  viewerTimer = setInterval(() => {
    const seconds = followVideo && !video.hidden && !video.paused ? video.currentTime : (performance.now() - viewerStart) / 1000;
    setProgress(seconds / VIDEO_SECONDS);
    // Exactly ten seconds: stop at 10 s even if a file were longer; never replay.
    if (seconds >= VIDEO_SECONDS) finishViewer();
  }, 100);
}
function showFallback(reward, message) {
  if (viewerDone) return;
  video.pause(); video.hidden = true;
  const image = $('reward-fallback');
  image.hidden = false; image.alt = reward.title;
  image.onerror = () => { image.hidden = true; $('reward-placeholder').hidden = false; $('reward-placeholder').textContent = reward.title; };
  image.src = reward.poster;
  $('viewer-message').textContent = message;
  startClock(false);
}
video.addEventListener('ended', () => finishViewer());
video.addEventListener('error', () => { const reward = REWARDS.find(r => video.src.endsWith(r.src.slice(1))); if (reward && !$('viewer').hidden) showFallback(reward, 'The video could not load, so here is a picture instead.'); });
function closeViewer(showComplete = true) {
  clearInterval(viewerTimer); viewerTimer = null;
  video.pause(); video.removeAttribute('src'); video.load();
  $('viewer').hidden = true;
  if (showComplete) showComplete_();
}
function finishViewer() { if (viewerDone) return; viewerDone = true; setProgress(1); closeViewer(true); }
$('viewer-close').addEventListener('click', () => { viewerDone = true; closeViewer(true); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('viewer').hidden) { viewerDone = true; closeViewer(true); } });
function showComplete_() {
  player.cancel();
  $('reward').hidden = true; $('game').hidden = true;
  const done = document.querySelector('.complete-scene');
  done.querySelector('.celebration').removeAttribute('hidden');
  renderStones(done.querySelector('.stones'), { placed: SLOTS.map(slot => slot.id), legal: [] });
  $('complete').hidden = false;
  $('complete-title').focus({ preventScroll: true });
}

/* ---------- Events ---------- */
$('boot-retry').onclick = () => window.location.reload();
$('reload').addEventListener('click', refreshCatalogue);
$('set-picker').addEventListener('change', event => { chosenSetId = event.target.value; updateSetup(); });
document.querySelectorAll('input[name="level"]').forEach(input => input.addEventListener('change', event => { chosenLevel = event.target.value; updateSetup(); }));
$('start').addEventListener('click', () => {
  startGame();
});
$('listen').addEventListener('click', () => {
  if (!game || game.state.phase !== 'question') return;
  $('listen').classList.remove('invite');
  if (!heardOnce) $('prompt').textContent = game.state.question.mode === 'picture' ? 'Listen, then tap the matching picture.' : 'Listen, then tap the matching word.';
  player.play(entries.get(game.state.question.targetKey));
});
$('change-set').addEventListener('click', () => { clearTimers(); player.cancel(); game = null; $('game').hidden = true; $('setup').hidden = false; $('start').focus(); });
$('build-again').addEventListener('click', startGame); // Same set and level; new words order, new box mapping.
window.addEventListener('pagehide', () => { clearTimers(); player.cancel(); });
refreshCatalogue();
