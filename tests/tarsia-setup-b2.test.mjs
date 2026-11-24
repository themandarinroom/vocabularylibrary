// Phase B2: Student Setup model, tested offline with Library-shaped data shaped like the published Countries sets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueFromSets } from '../tools/vocabulary-games-core/vocabulary.mjs';
import { setupView, setGroups, suggestSets, normaliseSelection, selectionFromParams, selectionToParams } from '../tools/tarsia-puzzle/setup-model.mjs';
import { createPuzzle } from '../tools/tarsia-puzzle/engine/index.mjs';

const img = (set, id) => `https://firebasestorage.googleapis.com/v0/b/b/o/vocabulary%2F${set}%2F${id}%2Fimage-1.webp?alt=media`;
const mk = (id, title, yearLevel, words, coverImage = img(id, 'cover')) => ({ id, title, chineseTitle: title, yearLevel, published: true, coverImage,
  items: words.map(([wid, chinese, pinyin, english]) => ({ id: wid, chinese, pinyin, english, image: img(id, wid), imageStoragePath: `vocabulary/${id}/${wid}/image-1.webp` })) });
const C1 = mk('c1', 'Countries I', 5, [['au', '澳大利亚', 'ao da li ya', 'Australia'], ['au2', '澳洲', 'ao zhou', 'Australia'], ['cn', '中国', 'zhong guo', 'China'], ['us', '美国', 'mei guo', 'United States'],
  ['ca', '加拿大', 'jia na da', 'Canada'], ['uk', '英国', 'ying guo', 'United Kingdom'], ['de', '德国', 'de guo', 'Germany'], ['fr', '法国', 'fa guo', 'France'], ['jp', '日本', 'ri ben', 'Japan'], ['nz', '新西兰', 'xin xi lan', 'New Zealand']]);
const C2 = mk('c2', 'Countries II', 5, [['af', '阿富汗', 'a fu han', 'Afghanistan'], ['pk', '巴基斯坦', 'ba ji si tan', 'Pakistan'], ['lk', '斯里兰卡', 'si li lan ka', 'Sri Lanka'],
  ['gr', '希腊', 'xi la', 'Greece'], ['in', '印度', 'yin du', 'India'], ['kr', '韩国', 'han guo', 'South Korea'], ['ba', '波黑', 'bo hei', 'Bosnia and Herzegovina']]);
const C3 = mk('c3', 'Countries III', 5, [['ir', '伊朗', 'yi lang', 'Iran'], ['ie', '爱尔兰', 'ai er lan', 'Ireland'], ['it', '意大利', 'yi da li', 'Italy'], ['ws', '萨摩亚', 'sa mo ya', 'Samoa'],
  ['vn', '越南', 'yue nan', 'Vietnam'], ['th', '泰国', 'tai guo', 'Thailand'], ['la', '老挝', 'lao wo', 'Laos'], ['ru', '俄罗斯', 'e luo si', 'Russia'], ['ua', '乌克兰', 'wu ke lan', 'Ukraine']]);
const SPORT = mk('sp', 'Sports I', 5, Array.from({ length: 9 }, (_, i) => [`s${i}`, `运动${'一二三四五六七八九'[i]}`, `yun dong ${i}`, `Sport ${i}`]), '');
const PETS = mk('pets', 'Pets I', 1, Array.from({ length: 6 }, (_, i) => [`p${i}`, `宠物${'一二三四五六'[i]}`, `chong wu ${i}`, `Pet ${i}`]), 'http://insecure.example/cover.png');
const { sets } = catalogueFromSets([PETS, C1, C2, C3, SPORT]);

test('covers pass through for display only when https', () => {
  assert.ok(sets.find(s => s.id === 'c1').cover.startsWith('https://'));
  assert.equal(sets.find(s => s.id === 'sp').cover, '');
  assert.equal(sets.find(s => s.id === 'pets').cover, '', 'http covers are not shown');
});

test('sets are grouped by year in order', () => {
  assert.deepEqual(setGroups(sets).map(g => [g.label, g.sets.map(s => s.id)]), [['Year 1', ['pets']], ['Year 5', ['c1', 'c2', 'c3', 'sp']]]);
});

test('Countries I + II + III: both levels ready with live counts', () => {
  const v = setupView(sets, { setIds: ['c1', 'c2', 'c3'], levelId: 'beginner' });
  assert.equal(v.words, 26);
  assert.ok(v.ready);
  assert.deepEqual(v.modes.map(m => [m.modeId, m.usable, m.required, m.available]), [['pinyin-picture', 25, 11, true], ['pinyin-english', 25, 11, true]]);
  assert.deepEqual(v.levels.map(l => [l.id, l.chinese, l.requiredPairs, l.startingPieces, l.available]), [['beginner', '初级', 11, 2, true], ['master', '高级', 18, 1, true]]);
  assert.equal(v.summary, '25 words · Beginner · Pinyin + Picture · Long hexagon (10 pieces)');
  assert.deepEqual(v.start, { setIds: ['c1', 'c2', 'c3'], levelId: 'beginner', modeId: 'pinyin-picture', templateId: 'hexagon-10' });
  const m = setupView(sets, { setIds: ['c1', 'c2', 'c3'], levelId: 'master', modeId: 'hanzi-pinyin' });
  assert.deepEqual([m.ready, m.selection.modeId, m.selection.templateId, m.modes.find(x => x.selected).usable], [true, 'hanzi-pinyin', 'triangle-16', 26]);
});

test('a real example pair is shown for every mode', () => {
  const v = setupView(sets, { setIds: ['c2'], levelId: 'master' });
  for (const mode of v.modes) {
    assert.equal(mode.example.length, 2);
    assert.ok(mode.example.every(l => l.text || l.image));
  }
});

test('too few words: clear message, Start blocked, same-topic suggestions first, never a smaller puzzle', () => {
  const v = setupView(sets, { setIds: ['c1'], levelId: 'beginner', modeId: 'pinyin-picture' });
  assert.equal(v.ready, false);
  assert.equal(v.start, null);
  assert.equal(v.feedback.kind, 'too-few');
  assert.equal(v.feedback.message, 'This puzzle needs 11 different words. Your sets have 9 words that work with Pinyin + Picture. Please choose another Vocabulary Set.');
  assert.deepEqual(v.feedback.suggestions.map(s => s.id), ['c3', 'c2', 'sp']);
  assert.equal(v.shapes[0].requiredPairs, 11, 'the shape is not reduced to fit');
  const master = setupView(sets, { setIds: ['c1', 'c2'], levelId: 'master', modeId: 'hanzi-english' });
  assert.equal(master.ready, false);
  assert.deepEqual(master.levels.find(l => l.id === 'master'), { ...master.levels.find(l => l.id === 'master'), available: false, best: 17 });
  for (const s of master.feedback.suggestions) {
    const after = setupView(sets, { setIds: ['c1', 'c2', s.id], levelId: 'master', modeId: 'hanzi-english' });
    assert.ok(after.ready, `${s.id} makes it playable`);
  }
});

test('no sets chosen', () => {
  const v = setupView(sets, { setIds: [] });
  assert.equal(v.feedback.kind, 'no-sets');
  assert.equal(v.ready, false);
  assert.ok(v.levels.every(l => !l.available));
});

test('a mode from another level falls back to that level\'s first playable mode', () => {
  const v = setupView(sets, { setIds: ['c1', 'c3'], levelId: 'beginner', modeId: 'hanzi-picture' });
  assert.equal(v.selection.modeId, 'pinyin-picture');
});

test('start configuration generates the promised puzzle', () => {
  for (const [levelId, modeId] of [['beginner', 'pinyin-english'], ['master', 'hanzi-picture']]) {
    const v = setupView(sets, { setIds: ['c1', 'c2', 'c3'], levelId, modeId });
    const { entries } = { entries: sets.filter(s => v.start.setIds.includes(s.id)).flatMap(s => s.items) };
    const puzzle = createPuzzle({ entries, levelId: v.start.levelId, modeId: v.start.modeId, templateId: v.start.templateId, seed: 1 });
    assert.equal(puzzle.templateId, v.start.templateId);
    assert.ok(puzzle.words.every(w => v.start.setIds.includes(w.setId)));
  }
});

test('selection is normalised and survives the URL round trip', () => {
  assert.deepEqual(normaliseSelection(sets, { setIds: ['c1', 'nope', 'c1'], levelId: 'expert' }), { setIds: ['c1'], levelId: 'beginner', modeId: null, templateId: null });
  const p = selectionToParams({ setIds: ['c1', 'c3'], levelId: 'master', modeId: 'hanzi-english' });
  assert.equal(p.toString(), 'set=c1%2Cc3&level=master&mode=hanzi-english');
  assert.deepEqual(selectionFromParams(p), { setIds: ['c1', 'c3'], levelId: 'master', modeId: 'hanzi-english' });
});

test('suggestions skip sets that would not be enough', () => {
  assert.deepEqual(suggestSets(sets, ['pets'], 'master', 'hanzi-english', 18), []);
});
