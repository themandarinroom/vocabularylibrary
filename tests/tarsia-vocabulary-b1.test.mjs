// Phase B1: published-vocabulary validation logic, tested offline with Library-shaped data (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPuzzle, VocabularyError } from '../tools/tarsia-puzzle/engine/index.mjs';
import { catalogueFromSets, mergeSets, conflictKeys, usableCount } from '../tools/vocabulary-games-core/vocabulary.mjs';
import { setCombinations, combinationReport, vocabularyReport, ambiguityReview } from '../tools/tarsia-puzzle/dev/vocabulary-report.mjs';

// Same shape as the published Countries sets: own Storage image per item, toneless spaced Pinyin.
const img = (set, id) => `https://firebasestorage.googleapis.com/v0/b/the-mandarin-room.firebasestorage.app/o/vocabulary%2F${set}%2F${id}%2Fimage-1.webp?alt=media&token=t-${id}`;
const item = (set, id, chinese, pinyin, english) => ({ id, chinese, pinyin, english, image: img(set, id), imageStoragePath: `vocabulary/${set}/${id}/image-1.webp` });
const SET_A = { id: 'a', title: 'Set A', published: true, items: [
  ['au', '澳大利亚', 'ao da li ya', 'Australia'], ['au2', '澳洲', 'ao zhou', 'Australia'], ['cn', '中国', 'zhong guo', 'China'],
  ['us', '美国', 'mei guo', 'United States'], ['ca', '加拿大', 'jia na da', 'Canada'], ['uk', '英国', 'ying guo', 'United Kingdom'],
  ['de', '德国', 'de guo', 'Germany'], ['fr', '法国', 'fa guo', 'France'], ['jp', '日本', 'ri ben', 'Japan'], ['nz', '新西兰', 'xin xi lan', 'New Zealand']
].map(([id, ...rest]) => item('a', id, ...rest)) };
const SET_B = { id: 'b', title: 'Set B', published: true, items: [
  ['af', '阿富汗', 'a fu han', 'Afghanistan'], ['pk', '巴基斯坦', 'ba ji si tan', 'Pakistan'], ['lk', '斯里兰卡', 'si li lan ka', 'Sri Lanka'],
  ['gr', '希腊', 'xi la', 'Greece'], ['in', '印度', 'yin du', 'India'], ['kr', '韩国', 'han guo', 'South Korea'], ['ba', '波黑', 'bo hei', 'Bosnia and Herzegovina']
].map(([id, ...rest]) => item('b', id, ...rest)) };
const SET_C = { id: 'c', title: 'Set C', published: true, items: [
  ['ir', '伊朗', 'yi lang', 'Iran'], ['ie', '爱尔兰', 'ai er lan', 'Ireland'], ['it', '意大利', 'yi da li', 'Italy'], ['ws', '萨摩亚', 'sa mo ya', 'Samoa'],
  ['vn', '越南', 'yue nan', 'Vietnam'], ['th', '泰国', 'tai guo', 'Thailand'], ['la', '老挝', 'lao wo', 'Laos'], ['ru', '俄罗斯', 'e luo si', 'Russia'], ['ua', '乌克兰', 'wu ke lan', 'Ukraine']
].map(([id, ...rest]) => item('c', id, ...rest)) };
const { sets } = catalogueFromSets([SET_A, SET_B, SET_C]);

test('all seven non-empty combinations, in the requested order', () => {
  assert.deepEqual(setCombinations(['a', 'b', 'c']), [['a'], ['b'], ['c'], ['a', 'b'], ['a', 'c'], ['b', 'c'], ['a', 'b', 'c']]);
});

test('too few words gives the standard validation message, never a broken puzzle', () => {
  const report = combinationReport(sets, ['a'], { seeds: 5 });
  for (const mode of report.modes) {
    assert.equal(mode.available, false);
    assert.match(mode.refusal, /^This puzzle requires (11|18) different words\. Please select more vocabulary sets\.$/);
  }
  assert.throws(() => createPuzzle({ entries: mergeSets(sets, ['b']).entries, levelId: 'beginner', modeId: 'pinyin-english', seed: 1 }), VocabularyError);
});

test('generated puzzles only use words from the selected sets', () => {
  for (const ids of setCombinations(['a', 'b', 'c'])) {
    const report = combinationReport(sets, ids, { seeds: 60 });
    for (const mode of report.modes.filter(m => m.available)) {
      assert.equal(mode.failures, 0);
      assert.equal(mode.wordsOutsideSelection, 0, `${ids.join('+')} ${mode.modeId}`);
    }
  }
});

test('same English meaning is kept apart in picture modes even with different image files', () => {
  const [au, au2] = sets[0].items;
  assert.notEqual(au.image, au2.image);
  assert.ok(conflictKeys(au, 'picture').some(k => conflictKeys(au2, 'picture').includes(k)));
  assert.equal(usableCount(mergeSets(sets, ['a']).entries, ['pinyin', 'picture']), 9);
  const entries = mergeSets(sets, ['a', 'c']).entries;
  for (let seed = 0; seed < 200; seed++) for (const modeId of ['hanzi-picture', 'hanzi-english']) {
    const keys = createPuzzle({ entries, levelId: 'master', modeId, seed }).words.map(w => w.key);
    assert.ok(!(keys.includes('["a","au"]') && keys.includes('["a","au2"]')), `${modeId} seed ${seed}`);
  }
});

test('distinct countries with similar flags or names are not excluded', () => {
  // Ireland / Italy (similar tricolours), 意大利 yi da li / 伊朗 yi lang (shared first syllable) stay usable together.
  const entries = mergeSets(sets, ['c']).entries;
  for (const kinds of [['pinyin', 'picture'], ['hanzi', 'pinyin'], ['hanzi', 'english'], ['hanzi', 'picture']]) assert.equal(usableCount(entries, kinds), 9);
});

test('report lists cross-set collisions and missing sets without substituting data', () => {
  const review = ambiguityReview(sets, ['a', 'b', 'c']);
  assert.deepEqual(review.english.map(g => g.key), ['australia']);
  assert.deepEqual([review.hanzi.length, review.pinyin.length, review.imageFile.length], [0, 0, 0]);
  const report = vocabularyReport(sets, ['a', 'missing'], { seeds: 1 });
  assert.deepEqual(report.missingSets, ['missing']);
  assert.equal(report.combinations.length, 1);
});
