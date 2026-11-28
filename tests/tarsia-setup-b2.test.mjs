// Student Setup model (revised v0.1: vocabulary, shape and mode chosen independently), tested offline with
// Library-shaped data shaped like the published Countries sets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueFromSets, mergeSets } from '../tools/vocabulary-games-core/vocabulary.mjs';
import { setupView, setGroups, suggestSets, normaliseSelection, selectionFromParams, selectionToParams } from '../tools/tarsia-puzzle/setup-model.mjs';
import { createStudentPuzzle } from '../tools/tarsia-puzzle/engine/index.mjs';

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

test('covers pass through for display only when https; sets grouped by year', () => {
  assert.ok(sets.find(s => s.id === 'c1').cover.startsWith('https://'));
  assert.equal(sets.find(s => s.id === 'pets').cover, '');
  assert.deepEqual(setGroups(sets).map(g => [g.label, g.sets.map(s => s.id)]), [['Year 1', ['pets']], ['Year 5', ['c1', 'c2', 'c3', 'sp']]]);
});

test('four shapes at both levels; levels choose the matching mode only (D3: Beginner = Pinyin modes, Master = Hanzi modes)', () => {
  const v = setupView(sets, { setIds: ['c1', 'c2', 'c3'], templateId: 'hexagon-10', modeId: 'hanzi-picture' });
  assert.deepEqual(v.shapes.map(s => [s.templateId, s.name, s.pieceCount, s.requiredPairs]),
    [['small-triangle-4', 'Small Triangle', 4, 3], ['hexagon-6', 'Hexagon', 6, 6], ['triangle-9', 'Triangle', 9, 9], ['hexagon-10', 'Extended Hexagon', 10, 11]]);
  assert.ok(v.shapes.every(s => s.requiredPairs <= 12));
  assert.equal(v.modes.length, 5);
  assert.ok(v.modes.every(m => m.available));
  assert.equal(v.summary, '25 words · Extended Hexagon (10 pieces · 11 pairs) · Master · Hanzi + Picture');
  assert.deepEqual(v.start, { setIds: ['c1', 'c2', 'c3'], templateId: 'hexagon-10', modeId: 'hanzi-picture' });
  assert.equal(v.level, 'master');
  assert.deepEqual(v.levels.map(l => [l.id, l.label, l.selected, l.modes.map(m => m.modeId)]),
    [['beginner', 'Beginner', false, ['pinyin-picture', 'pinyin-english']], ['master', 'Master', true, ['hanzi-english', 'hanzi-pinyin', 'hanzi-picture']]]);
  // the level never limits the shapes: the same four shapes for a Beginner mode
  const b = setupView(sets, { setIds: ['c1', 'c2', 'c3'], templateId: 'hexagon-10', modeId: 'pinyin-picture' });
  assert.equal(b.level, 'beginner');
  assert.deepEqual(b.shapes.map(s => s.templateId), v.shapes.map(s => s.templateId));
  assert.ok(!v.shapes.some(s => s.templateId === 'triangle-16'), 'deferred 18-pair template stays hidden');
});

test('a single set can play smaller shapes in every mode', () => {
  for (const modeId of ['pinyin-picture', 'pinyin-english', 'hanzi-pinyin', 'hanzi-picture', 'hanzi-english']) {
    for (const templateId of ['small-triangle-4', 'hexagon-6']) {
      const v = setupView(sets, { setIds: ['c2'], templateId, modeId });
      assert.ok(v.ready, `${templateId} + ${modeId}`);
    }
  }
});

test('unplayable combination: explained, Start blocked, the student\'s choice is not changed', () => {
  const v = setupView(sets, { setIds: ['c2'], templateId: 'triangle-9', modeId: 'hanzi-english' });
  assert.equal(v.ready, false);
  assert.equal(v.start, null);
  assert.deepEqual([v.selection.templateId, v.selection.modeId], ['triangle-9', 'hanzi-english']);
  assert.equal(v.feedback.message, 'This puzzle needs 9 different words. Your sets have 7 words that work with Hanzi + English.');
  assert.deepEqual(v.feedback.smallerShapes, ['Small Triangle', 'Hexagon']);
  assert.deepEqual(v.feedback.suggestions.map(s => s.id), ['c1', 'c3', 'sp']); // c1 and c3 tie (+9 usable): catalogue order
  assert.equal(v.shapes.find(s => s.templateId === 'triangle-9').reason, 'Needs 9 words · Hanzi + English has 7');
  assert.equal(v.modes.find(m => m.modeId === 'hanzi-english').reason, 'Needs 9 words · you have 7');
  for (const s of v.feedback.suggestions) assert.ok(setupView(sets, { setIds: ['c2', s.id], templateId: 'triangle-9', modeId: 'hanzi-english' }).ready);
});

test('same-meaning rule still applies in setup counts (澳大利亚 / 澳洲)', () => {
  const v = setupView(sets, { setIds: ['c1'], templateId: 'small-triangle-4', modeId: 'pinyin-picture' });
  assert.equal(v.modes.find(m => m.modeId === 'pinyin-picture').usable, 9);
  assert.equal(v.modes.find(m => m.modeId === 'hanzi-pinyin').usable, 10);
});

test('no sets chosen; defaults (D3: Beginner · Pinyin + Picture); URL round trip', () => {
  assert.equal(setupView(sets, {}).level, 'beginner');
  const v = setupView(sets, {});
  assert.equal(v.feedback.kind, 'no-sets');
  assert.deepEqual(normaliseSelection(sets, { setIds: ['c1', 'nope', 'c1'], templateId: 'triangle-16', modeId: 'x' }), { setIds: ['c1'], templateId: 'hexagon-6', modeId: 'pinyin-picture' });
  const p = selectionToParams({ setIds: ['c1', 'c3'], templateId: 'triangle-9', modeId: 'hanzi-english' });
  assert.equal(p.toString(), 'set=c1%2Cc3&shape=triangle-9&mode=hanzi-english');
  assert.deepEqual(selectionFromParams(p), { setIds: ['c1', 'c3'], templateId: 'triangle-9', modeId: 'hanzi-english' });
});

test('start configuration generates the promised puzzle from the chosen sets only', () => {
  for (const [templateId, modeId] of [['small-triangle-4', 'pinyin-english'], ['hexagon-6', 'hanzi-picture'], ['triangle-9', 'pinyin-picture'], ['hexagon-10', 'hanzi-pinyin']]) {
    const v = setupView(sets, { setIds: ['c2', 'c3'], templateId, modeId });
    const puzzle = createStudentPuzzle({ entries: mergeSets(sets, v.start.setIds).entries, templateId, modeId, seed: 3 });
    assert.equal(puzzle.templateId, templateId);
    assert.ok(puzzle.words.every(w => v.start.setIds.includes(w.setId)));
  }
});

test('suggestions skip sets that would not be enough', () => {
  assert.deepEqual(suggestSets(sets, ['pets'], 'hanzi-english', 18), []);
});
