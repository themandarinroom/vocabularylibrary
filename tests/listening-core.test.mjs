import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalogueFromSets, listeningPool, itemImage, yearLabel } from '../tools/listening-core/vocabulary.mjs';
import { LEVELS, levelAvailability, supportedLevel, createTargetPicker, buildQuestion, answerQuestion, answerMode } from '../tools/listening-core/rounds.mjs';
import { createAudioPlayer } from '../tools/listening-core/audio-player.mjs';
import { teacherVoiceUrl } from '../tools/listening-core/library.mjs';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const img = n => `https://firebasestorage.googleapis.com/v0/b/x/o/${n}.webp`;
const source = (items, extra = {}) => ({ id: 'y1-fruit', title: 'Fruit', yearLevel: 1, published: true, items, ...extra });
const item = (id, chinese, extra = {}) => ({ id, chinese, pinyin: 'p', english: id, ...extra });
const poolOf = n => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, chinese: `字${i}`, image: img(i), aiEnabled: true }));

test('catalogue keeps only published, non-deleted sets and valid items', () => {
  const { sets, diagnostics } = catalogueFromSets([
    source([item('a', '苹果', { image: img('a') }), item('b', ''), item('c', '香蕉', { image: 'http://x/y.png' }), item('d', '梨', { image: img('d'), imageSource: 'set-cover' })]),
    { id: 'gone', published: true, deleted: true, items: [item('a', '猫')] },
    { id: 'draft', published: false, items: [item('a', '狗')] }
  ]);
  assert.deepEqual(sets.map(set => set.id), ['y1-fruit']);
  assert.deepEqual(sets[0].items.map(entry => entry.chinese), ['苹果', '香蕉', '梨']);
  assert.equal(sets[0].items[0].image, img('a'));
  assert.equal(sets[0].items[1].image, '', 'http images are not used');
  assert.equal(sets[0].items[2].image, '', 'set-cover reuse is not a picture of the word');
  assert.equal(diagnostics.length, 1);
});
test('itemImage rejects credentials and invalid URLs', () => {
  assert.equal(itemImage({ image: 'https://u:p@x.com/a.png' }), '');
  assert.equal(itemImage({ image: 'not a url' }), '');
  assert.equal(itemImage({ image: 'https://x.com/a.png' }), 'https://x.com/a.png');
});
test('listening pool drops look-alike Chinese so two choices never look identical', () => {
  const { sets } = catalogueFromSets([source([item('a', '苹果'), item('b', '苹 果'), item('c', '香蕉')])]);
  const { pool, skipped } = listeningPool(sets[0]);
  assert.deepEqual(pool.map(entry => entry.id), ['a', 'c']);
  assert.equal(skipped, 1);
});
test('year labels', () => { assert.equal(yearLabel(0), 'Prep'); assert.equal(yearLabel(3), 'Year 3'); assert.equal(yearLabel(undefined), 'All years'); });

test('levels offer 2, 3 and 4 choices', () => {
  assert.deepEqual([LEVELS.easy.choices, LEVELS.medium.choices, LEVELS.challenge.choices], [2, 3, 4]);
});
test('small sets: only levels with enough different words are available', () => {
  assert.deepEqual(levelAvailability(1), { easy: false, medium: false, challenge: false });
  assert.deepEqual(levelAvailability(2), { easy: true, medium: false, challenge: false });
  assert.deepEqual(levelAvailability(3), { easy: true, medium: true, challenge: false });
  assert.deepEqual(levelAvailability(9), { easy: true, medium: true, challenge: true });
  assert.equal(supportedLevel(3, 'challenge'), 'medium');
  assert.equal(supportedLevel(9, 'challenge'), 'challenge');
  assert.equal(supportedLevel(1, 'easy'), null);
});
test('target picker never repeats the same word twice in a row and covers every word', () => {
  for (const size of [2, 3, 5, 12]) {
    const keys = Array.from({ length: size }, (_, i) => `k${i}`);
    const picker = createTargetPicker(keys, seeded(size));
    const asked = [];
    for (let i = 0; i < 60; i++) { const peeked = picker.peek(); const key = picker.next(); assert.equal(key, peeked, 'peek predicts next'); asked.push(key); }
    for (let i = 1; i < asked.length; i++) assert.notEqual(asked[i], asked[i - 1], `size ${size}: immediate repeat at ${i}`);
    assert.deepEqual(new Set(asked.slice(0, size)), new Set(keys), 'every word once before repeats');
  }
  assert.throws(() => createTargetPicker(['only']));
});
test('a question has the right number of different options including the target, from the same pool', () => {
  const pool = poolOf(8);
  for (const choices of [2, 3, 4]) for (let i = 0; i < 30; i++) {
    const question = buildQuestion({ pool, targetKey: 'k3', choices, random: seeded(i + 1) });
    assert.equal(question.options.length, choices);
    assert.equal(new Set(question.options).size, choices);
    assert(question.options.includes('k3'));
    assert(question.options.every(key => pool.some(entry => entry.key === key)));
  }
});
test('answer order is randomised', () => {
  const pool = poolOf(4), positions = new Set();
  for (let i = 0; i < 40; i++) positions.add(buildQuestion({ pool, targetKey: 'k0', choices: 4, random: seeded(i + 3) }).options.indexOf('k0'));
  assert.equal(positions.size, 4);
});
test('a pool too small for the level is refused', () => {
  assert.throws(() => buildQuestion({ pool: poolOf(3), targetKey: 'k0', choices: 4 }), /needs 4/);
});
test('pictures only when every option has its own different picture', () => {
  assert.equal(answerMode(poolOf(3)), 'picture');
  assert.equal(answerMode([...poolOf(2), { key: 'x', image: '' }]), 'hanzi');
  assert.equal(answerMode([{ key: 'a', image: img(1) }, { key: 'b', image: img(1) }]), 'hanzi', 'same picture twice');
  assert.equal(answerMode(poolOf(2), new Set(['k1'])), 'hanzi', 'a broken picture falls back');
});
test('answers: correct, gentle incorrect, repeated wrong tap and invalid', () => {
  const question = buildQuestion({ pool: poolOf(4), targetKey: 'k1', choices: 4, random: seeded(2) });
  const wrongKey = question.options.find(key => key !== 'k1');
  const first = answerQuestion(question, wrongKey);
  assert.equal(first.outcome, 'incorrect');
  assert.deepEqual(first.question.wrong, [wrongKey]);
  assert.equal(answerQuestion(first.question, wrongKey).outcome, 'repeat');
  assert.equal(answerQuestion(first.question, 'k1').outcome, 'correct');
  assert.equal(answerQuestion(question, 'nope').outcome, 'invalid');
});

// Audio player: same order as Bingo Solo — Teacher Voice first, AI Voice only as a fallback.
function fakeTimers() {
  let id = 0; const timers = new Map();
  return { schedule: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, unschedule: t => timers.delete(t),
    fire: ms => { for (const [key, timer] of [...timers]) if (timer.ms === ms) { timers.delete(key); timer.fn(); } } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('audio: Teacher Voice is preferred when a recording exists', async () => {
  const calls = [], t = fakeTimers();
  const player = createAudioPlayer({ ...t, getVoice: async () => 'https://teacher/a', canUseAiVoice: () => true,
    playTeacherVoice: (url, cb) => { calls.push(['teacher', url]); cb.onStart(); return { pause() {} }; },
    speakMandarin: () => calls.push(['ai']) });
  await player.play({ key: 'a', chinese: '猫', aiEnabled: true });
  assert.deepEqual(calls, [['teacher', 'https://teacher/a']]);
  assert(player.isReady({ key: 'a' }));
});
test('audio: AI Voice is the fallback when there is no recording or it fails', async () => {
  const calls = [], statuses = [], t = fakeTimers();
  const player = createAudioPlayer({ ...t, getVoice: async entry => entry.key === 'b' ? 'https://teacher/b' : '', canUseAiVoice: () => true,
    playTeacherVoice: (url, cb) => { calls.push('teacher'); cb.onError(); return { pause() {} }; },
    speakMandarin: (text, cb) => { calls.push(`ai:${text}`); cb.onStart(); cb.onEnd(); }, onStatus: s => statuses.push(s.kind) });
  await player.play({ key: 'a', chinese: '猫', aiEnabled: true });
  await player.play({ key: 'b', chinese: '狗', aiEnabled: true });
  assert.deepEqual(calls, ['ai:猫', 'teacher', 'ai:狗']);
  assert.equal(statuses.at(-1), 'ready');
});
test('audio: no AI fallback when the item disables it or the device has no speech; an error is reported', async () => {
  const statuses = [], t = fakeTimers(); let spoke = false;
  const player = createAudioPlayer({ ...t, getVoice: async () => '', canUseAiVoice: () => false, playTeacherVoice: () => null,
    speakMandarin: () => { spoke = true; }, onStatus: s => statuses.push(s.kind) });
  await player.play({ key: 'a', chinese: '猫', aiEnabled: true });
  await player.play({ key: 'b', chinese: '狗', aiEnabled: false });
  assert.equal(spoke, false);
  assert.equal(statuses.filter(kind => kind === 'error').length, 2);
});
test('audio: a Teacher Voice that never starts falls back to AI Voice after the watchdog', async () => {
  const calls = [], t = fakeTimers();
  const player = createAudioPlayer({ ...t, getVoice: async () => 'https://teacher/a', canUseAiVoice: () => true,
    playTeacherVoice: () => { calls.push('teacher'); return { pause() {} }; }, speakMandarin: () => calls.push('ai') });
  await player.play({ key: 'a', chinese: '猫', aiEnabled: true });
  t.fire(12000); await flush();
  assert.deepEqual(calls, ['teacher', 'ai']);
});
test('audio: Teacher Voice references must match the Production recording for the same item', () => {
  const entry = { setId: 's', id: 'i' };
  const good = { setId: 's', itemId: 'i', revision: 5, storagePath: 'vocabulary/s/i/teacher-voice-5',
    teacherAudioUrl: 'https://firebasestorage.googleapis.com/v0/b/the-mandarin-room.firebasestorage.app/o/vocabulary%2Fs%2Fi%2Fteacher-voice-5?alt=media' };
  assert.match(teacherVoiceUrl(entry, good), /revision=5$/);
  assert.equal(teacherVoiceUrl(entry, null), '');
  assert.throws(() => teacherVoiceUrl(entry, { ...good, teacherAudioUrl: good.teacherAudioUrl.replace('the-mandarin-room.', 'the-mandarin-room-staging.') }));
  assert.throws(() => teacherVoiceUrl(entry, { ...good, itemId: 'other' }));
});
test('listening-core vendors the same Production-locked data layer as Bingo Solo, byte for byte', () => {
  for (const file of ['solo-runtime-config.mjs', 'js/audio.js', 'js/firebase-config.js', 'js/firebase.js', 'js/teacher-voice-cloud.js', 'js/vocabulary-store.js']) {
    const ours = fs.readFileSync(new URL(`../tools/listening-core/shared/${file}`, import.meta.url));
    const bingo = fs.readFileSync(new URL(`../tools/bingo-board/shared/${file}`, import.meta.url));
    assert(ours.equals(bingo), file);
  }
});
test('pictures are preferred: a few unpictured words in a set do not stop picture questions', () => {
  const pool = [...poolOf(5), { key: 'plain', chinese: '宠物', image: '', aiEnabled: true }];
  for (let i = 1; i <= 30; i++) {
    const pictured = buildQuestion({ pool, targetKey: 'k2', choices: 4, random: seeded(i) });
    assert.equal(pictured.mode, 'picture');
    assert(!pictured.options.includes('plain'));
    const plain = buildQuestion({ pool, targetKey: 'plain', choices: 4, random: seeded(i) });
    assert.equal(plain.mode, 'hanzi');
  }
  // Not enough pictured distractors: falls back to the whole pool and Chinese characters.
  const sparse = [...poolOf(2), { key: 'a', chinese: '甲', image: '' }, { key: 'b', chinese: '乙', image: '' }];
  assert.equal(buildQuestion({ pool: sparse, targetKey: 'k0', choices: 4, random: seeded(4) }).mode, 'hanzi');
});
