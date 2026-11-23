// AI Voice names a standard Mandarin voice, and silent "speech" is reported as a failure.
// Evidence: AI Voice Compatibility Test on Staging, school iPad 7 (iPadOS 18) and iPad 9 (iPadOS 27), 23 Nov 2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAudioPlayer as coreAudioPlayer, MIN_AI_SPEECH_MS } from '../tools/listening-core/audio-player.mjs';
import { createAudioPlayer as bingoAudioPlayer, MIN_AI_SPEECH_MS as BINGO_MIN } from '../tools/bingo-board/audio.mjs';

// A minimal browser speech stub, installed before the audio modules load.
const spoken = [];
let voices = [];
globalThis.window = globalThis;
globalThis.speechSynthesis = { getVoices: () => voices, cancel() {}, speak: u => spoken.push(u) };
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
const copies = {
  library: await import('../js/audio.js'),
  core: await import('../tools/listening-core/shared/js/audio.js'),
  bingo: await import('../tools/bingo-board/shared/js/audio.js')
};
const v = (name, lang, extra = {}) => ({ name, lang, localService: true, voiceURI: `com.apple.voice.${name}`, ...extra });
// The iPad 7's reported list (zh-CN novelty voices first), and the iPad 9's.
const ipad7 = ['Eddy', 'Shelley', 'Grandma', 'Reed', 'Grandpa', 'Rocko', 'Flo'].map(n => v(n, 'zh-CN'))
  .concat([v('Tingting', 'zh-CN'), v('Sandy', 'zh-CN'), v('Sinji', 'zh-HK'), v('Meijia', 'zh-TW')]);
const ipad9 = [v('Tingting', 'zh-CN'), v('Meijia', 'zh-TW')];

for (const [name, mod] of Object.entries(copies)) {
  test(`${name}: chooses Tingting, never a novelty voice`, () => {
    assert.equal(mod.chooseMandarinVoice(ipad7).name, 'Tingting');
    assert.equal(mod.chooseMandarinVoice(ipad9).name, 'Tingting');
    assert.equal(mod.chooseMandarinVoice([v('Eddy (Chinese (China mainland))', 'zh-CN'), v('Li-mu', 'zh-CN')]).name, 'Li-mu');
    assert.equal(mod.chooseMandarinVoice([v('Yu', 'cmn-Hans-CN')]).name, 'Yu');
    assert.equal(mod.chooseMandarinVoice([v('Odd', 'zh-CN', { voiceURI: 'com.apple.eloquence.zh-CN.Odd' })]), null);
    assert.equal(mod.chooseMandarinVoice(ipad7.filter(x => x.name !== 'Tingting' && x.lang === 'zh-CN')), null);
    assert.equal(mod.chooseMandarinVoice([v('Meijia', 'zh-TW'), v('Samantha', 'en-US')]), null);
    assert.equal(mod.chooseMandarinVoice(undefined), null);
  });
  test(`${name}: speakMandarin sets the chosen voice, or only lang zh-CN when there is none`, () => {
    voices = ipad7; spoken.length = 0;
    mod.speakMandarin('红色');
    assert.equal(spoken[0].voice.name, 'Tingting'); assert.equal(spoken[0].lang, 'zh-CN'); assert.equal(spoken[0].rate, 0.82);
    voices = []; mod.speakMandarin('红色');
    assert.equal(spoken[1].voice, undefined); assert.equal(spoken[1].lang, 'zh-CN');
  });
}
test('the three audio.js copies differ only in the Teacher Voice start event', () => {
  const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const lib = read('js/audio.js'), core = read('tools/listening-core/shared/js/audio.js');
  assert.equal(core, read('tools/bingo-board/shared/js/audio.js'));
  assert.equal(lib.replace('audio.onplay =', 'audio.onplaying ='), core);
});

function rig(createAudioPlayer, speechMs, { startFires = true } = {}) {
  let clock = 0, id = 0; const statuses = [];
  const player = createAudioPlayer({ getVoice: async () => '', canUseAiVoice: () => true, playTeacherVoice: () => null,
    now: () => clock, schedule: () => ++id, unschedule: () => {}, onStatus: s => statuses.push(s.kind),
    speakMandarin: (text, cb) => { if (startFires) cb.onStart(); clock += speechMs; cb.onEnd(); } });
  return { player, statuses };
}
for (const [name, create, min] of [['listening-core', coreAudioPlayer, MIN_AI_SPEECH_MS], ['bingo', bingoAudioPlayer, BINGO_MIN]]) {
  test(`${name}: AI Voice that ends suspiciously fast is an error, not success`, async () => {
    assert.equal(min, 300);
    const quick = rig(create, 68); await quick.player.play({ key: 'a', chinese: '红色', aiEnabled: true });
    assert.equal(quick.statuses.at(-1), 'error');
    const real = rig(create, 900); await real.player.play({ key: 'a', chinese: '红色', aiEnabled: true });
    assert.equal(real.statuses.at(-1), 'ready');
    const noStart = rig(create, 900, { startFires: false }); await noStart.player.play({ key: 'a', chinese: '红色', aiEnabled: true });
    assert.equal(noStart.statuses.at(-1), 'error');
  });
}
