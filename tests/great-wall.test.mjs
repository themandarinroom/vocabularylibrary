import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SLOTS, FOUNDATION, TARGET_BRICKS, legalSlots, placeStone, isLegal, isComplete, GROUND_Y } from '../tools/great-wall/wall.mjs';
import { createWallGame } from '../tools/great-wall/game.mjs';
import { REWARDS, assignBoxes, VIDEO_SECONDS, BOX_COUNT } from '../tools/great-wall/rewards.mjs';

const seeded = (seed = 11) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const poolOf = n => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, chinese: `字${i}`, image: '', aiEnabled: true }));
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('the section needs exactly 10 new stones', () => assert.equal(TARGET_BRICKS, 10));
test('no two stones (foundation or new) overlap', () => {
  const all = [...FOUNDATION, ...SLOTS];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(!overlap(all[i], all[j]), `${all[i].id} overlaps ${all[j].id}`);
});
test('every new stone rests on stones directly beneath it (nothing floats)', () => {
  const below = stone => [...FOUNDATION, ...SLOTS].filter(other => other.y === stone.y + stone.h && other.x < stone.x + stone.w && stone.x < other.x + other.w);
  for (const slot of SLOTS) {
    const supports = below(slot);
    assert(supports.length, `${slot.id} has support`);
    // Its rule must name every new stone under it; foundation stones are always present.
    const newSupports = supports.filter(s => SLOTS.includes(s)).map(s => s.id).sort();
    assert.deepEqual([...slot.needs].sort(), newSupports, `${slot.id} needs`);
  }
  assert(FOUNDATION.every(stone => stone.y + stone.h === GROUND_Y || FOUNDATION.some(other => other.y === stone.y + stone.h)));
});
test('at the start only the four stones on the foundation are legal', () => {
  assert.deepEqual(legalSlots([]), ['s1', 's2', 's3', 's4']);
  assert(!isLegal([], 's5'));
  assert(!isLegal([], 'm1'));
  assert.throws(() => placeStone([], 'm2'));
  assert.throws(() => placeStone(['s1'], 's1'), 'no double placement');
  assert.throws(() => placeStone([], 'nowhere'));
});
test('upper stones unlock only when both stones below are placed', () => {
  assert.deepEqual(legalSlots(['s1']), ['s2', 's3', 's4']);
  assert.deepEqual(legalSlots(['s1', 's2']), ['s3', 's4', 's5']);
  assert(isLegal(['s1', 's2', 's5'], 'm1'));
});
test('every random legal order completes the wall in exactly 10 placements, never getting stuck', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const random = seeded(seed); let placed = [];
    while (!isComplete(placed)) {
      const legal = legalSlots(placed);
      assert(legal.length > 0, 'always somewhere to build');
      placed = placeStone(placed, legal[Math.floor(random() * legal.length)]);
      assert(placed.length <= 10);
    }
    assert.equal(placed.length, 10);
    assert.deepEqual(legalSlots(placed), []);
  }
});

function playToEnd(game, random) {
  let wrongs = 0;
  while (game.state.phase !== 'complete') {
    if (game.state.phase === 'question') {
      const { options, targetKey, wrong } = game.state.question;
      const miss = options.find(key => key !== targetKey && !wrong.includes(key));
      if (miss && random() < 0.3) { assert.equal(game.answer(miss), 'incorrect'); wrongs++; continue; }
      assert.equal(game.answer(targetKey), 'correct');
    } else {
      const legal = game.legalSlots();
      assert(legal.length);
      const result = game.place(legal[Math.floor(random() * legal.length)]);
      assert(['placed', 'complete'].includes(result));
    }
  }
  return wrongs;
}
test('each correct answer earns one stone; 10 correct answers and 10 placements complete the game', () => {
  for (const level of ['easy', 'medium', 'challenge']) {
    const random = seeded(level.length);
    const game = createWallGame({ pool: poolOf(6), level, random });
    assert.equal(game.state.question.options.length, { easy: 2, medium: 3, challenge: 4 }[level]);
    const wrongs = playToEnd(game, random);
    assert.equal(game.state.correct, 10);
    assert.equal(game.state.placed.length, 10);
    assert.equal(game.state.attempts, 10 + wrongs);
  }
});
test('a wrong answer never removes stones and does not move on', () => {
  const game = createWallGame({ pool: poolOf(4), level: 'challenge', random: seeded(3) });
  game.answer(game.state.question.targetKey); game.place('s2');
  const { question } = game.state;
  const miss = question.options.find(key => key !== question.targetKey);
  assert.equal(game.answer(miss), 'incorrect');
  assert.deepEqual(game.state.placed, ['s2']);
  assert.equal(game.state.phase, 'question');
  assert.equal(game.state.question.targetKey, question.targetKey);
  assert.equal(game.answer(miss), 'repeat');
});
test('stones can be placed only after a correct answer, and only in legal spots', () => {
  const game = createWallGame({ pool: poolOf(3), level: 'medium', random: seeded(5) });
  assert.equal(game.place('s1'), 'inactive', 'no stone earned yet');
  assert.deepEqual(game.legalSlots(), []);
  game.answer(game.state.question.targetKey);
  assert.equal(game.answer(game.state.question.targetKey), 'inactive', 'one stone per correct answer');
  assert.equal(game.place('m1'), 'illegal');
  assert.equal(game.state.phase, 'place');
  assert.equal(game.place('s1'), 'placed');
  assert.equal(game.state.phase, 'question');
});
test('the next target is never the word just asked (2-word set too)', () => {
  const game = createWallGame({ pool: poolOf(2), level: 'easy', random: seeded(9) });
  let last = null;
  for (let i = 0; i < 10; i++) {
    const target = game.state.question.targetKey;
    assert.notEqual(target, last); last = target;
    assert.equal(game.upcomingKey() !== target, true);
    game.answer(target); game.place(game.legalSlots()[0]);
  }
  assert.equal(game.state.phase, 'complete');
});
test('levels are refused for sets that are too small', () => {
  assert.throws(() => createWallGame({ pool: poolOf(3), level: 'challenge' }), /at least 4/);
  assert.throws(() => createWallGame({ pool: poolOf(1), level: 'easy' }));
  assert.throws(() => createWallGame({ pool: poolOf(5), level: 'nope' }));
});
test('a failed picture switches the question to Chinese characters', () => {
  const pool = poolOf(3).map((entry, i) => ({ ...entry, image: `https://x/${i}.png` }));
  const game = createWallGame({ pool, level: 'easy', random: seeded(1) });
  assert.equal(game.state.question.mode, 'picture');
  game.refreshMode();
  assert.equal(game.state.question.mode, 'hanzi');
});

test('five reward videos, each mapped to one of five boxes at random per game', () => {
  assert.equal(REWARDS.length, 5); assert.equal(BOX_COUNT, 5); assert.equal(VIDEO_SECONDS, 15);
  assert.equal(new Set(REWARDS.map(r => r.id)).size, 5);
  const seen = new Set();
  for (let i = 1; i <= 30; i++) { const boxes = assignBoxes(seeded(i)); assert.equal(new Set(boxes).size, 5); seen.add(boxes.join()); }
  assert(seen.size > 10, 'mapping changes between games');
});
test('available rewards have a local video, poster and credit; unavailable ones are labelled placeholders', () => {
  for (const reward of REWARDS) {
    assert.match(reward.src, /^\.\/media\/[a-z]+\.mp4$/);
    if (reward.available) {
      assert(fs.existsSync(new URL(`../tools/great-wall/${reward.src.slice(2)}`, import.meta.url)), reward.src);
      assert(fs.existsSync(new URL(`../tools/great-wall/${reward.poster.slice(2)}`, import.meta.url)), reward.poster);
      assert(reward.credit.length > 10, `${reward.id} credit`);
    }
  }
});
test('the page has no sign-in, no writes and no Pinyin in the question area', () => {
  const html = fs.readFileSync(new URL('../tools/great-wall/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../tools/great-wall/app.mjs', import.meta.url), 'utf8');
  assert(!/signIn|saveSet|deleteSet|uploadTeacherVoice|setDoc|addDoc/.test(app));
  assert(!/\.pinyin/.test(app), 'Pinyin is never rendered');
  assert.match(html, /class="tool-header tmr-unified-header"/);
});
// Reads the movie header of an MP4 (moov is at the front: +faststart) without any dependency.
function mp4Info(bytes) {
  const at = bytes.indexOf('mvhd'), moov = bytes.indexOf('moov'), mdat = bytes.indexOf('mdat');
  const version = bytes[at + 4], base = at + 8 + (version === 1 ? 16 : 8);
  const timescale = bytes.readUInt32BE(base);
  const duration = version === 1 ? Number(bytes.readBigUInt64BE(base + 4)) : bytes.readUInt32BE(base + 4);
  return { seconds: duration / timescale, faststart: moov >= 0 && moov < mdat, audio: bytes.includes('soun') };
}
test('every available reward video is exactly 15 seconds, streamable and small enough for school Wi-Fi', () => {
  for (const reward of REWARDS.filter(r => r.available)) {
    const bytes = fs.readFileSync(new URL(`../tools/great-wall/${reward.src.slice(2)}`, import.meta.url));
    const info = mp4Info(bytes);
    assert.equal(info.seconds, VIDEO_SECONDS, `${reward.id} duration`);
    assert(info.faststart, `${reward.id} +faststart`);
    assert(bytes.length < 4.5 * 1024 * 1024, `${reward.id} size ${bytes.length}`);
  }
  assert.equal(REWARDS.filter(r => r.available).length, 5, 'all five videos present');
});
test('on-screen credits: CC BY clips name author, licence link, source and changes; Pexels clips name author', () => {
  for (const reward of REWARDS) {
    assert(reward.credit.includes('trimmed to 15 s'), `${reward.id} notes the change`);
    if (reward.credit.includes('CC BY')) {
      assert.match(reward.credit, /Johnny Xmas/); assert.match(reward.credit, /creativecommons\.org\/licenses\/by\/3\.0/);
      assert.match(reward.credit, /Wikimedia Commons/);
    } else assert.match(reward.credit, /on Pexels \(pexels\.com\/video\/\d+\) · Pexels License/);
  }
  const credits = fs.readFileSync(new URL('../tools/great-wall/media/CREDITS.md', import.meta.url), 'utf8');
  for (const reward of REWARDS) assert(credits.includes(`\`${reward.id}.mp4\``), `${reward.id} listed in CREDITS.md`);
});
test('v0.2 scene: no banner, no tower flag, three dragon banners on the wall, beacon fire, prefix-scoped', async () => {
  const { sceneMarkup, FLAG_IMAGE } = await import('../tools/great-wall/scene.mjs');
  const markup = sceneMarkup('t');
  assert(!markup.includes('长城建好了') && !markup.includes('banner'), 'banner text removed from the scene');
  const celebration = markup.slice(markup.indexOf('class="celebration"'));
  assert.equal((celebration.match(/<g class="flag">/g) || []).length, 3, 'three flags, all in the completion layer');
  assert.equal((markup.match(/<g class="flag">/g) || []).length, 3, 'no other flags (none on the watchtower)');
  for (const x of [...celebration.matchAll(/<line class="flag-pole" x1="(\d+)"/g)].map(m => Number(m[1]))) assert(x > 250, `flag at x=${x} stands on the wall, not the tower`);
  assert.match(celebration, /class="beacon"/); assert.match(celebration, /class="fire"/); assert.match(celebration, /class="puff"/);
  const images = [...markup.matchAll(/<image[^>]*href="([^"]+)"/g)].map(m => m[1]);
  assert.equal(images.length, 3); assert(images.every(href => href === FLAG_IMAGE), 'only the local flag image');
  assert(!/https?:\/\/(?!www\.w3\.org)/.test(markup), 'no external resources');
  const flag = fs.readFileSync(new URL(`../tools/great-wall/${FLAG_IMAGE.slice(2)}`, import.meta.url));
  assert.equal(flag.subarray(0, 4).toString(), 'RIFF'); assert(flag.length < 60 * 1024, `flag image ${flag.length} bytes`);
  const ids = [...markup.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert(ids.length > 10 && ids.every(id => id.startsWith('t-')), 'every id carries the scene prefix');
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.match(markup, /<g class="stones" data-prefix="t">/);
});
test('several Vocabulary Sets merge into one pool: keys stay distinct, a repeated Chinese word is asked once', async () => {
  const { catalogueFromSets, listeningPool } = await import('../tools/listening-core/vocabulary.mjs');
  const { sets } = catalogueFromSets([
    { id: 'a', title: 'A', items: [{ id: '1', chinese: '红色' }, { id: '2', chinese: '蓝色' }] },
    { id: 'b', title: 'B', items: [{ id: '1', chinese: '猫' }, { id: '2', chinese: '红色' }, { id: '3', chinese: '狗' }] }]);
  const { pool, skipped } = listeningPool({ items: sets.flatMap(set => set.items) });
  assert.deepEqual(pool.map(item => item.chinese), ['红色', '蓝色', '猫', '狗']);
  assert.equal(skipped, 1);
  assert.equal(new Set(pool.map(item => item.key)).size, 4, 'same item ids in different sets keep separate keys');
  assert.equal(pool[2].setId, 'b', 'each word keeps its own set for Teacher Voice');
});
