// Phase C2: completion experience and learning-record export integration (offline; no DOM, no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { completionSummary } from '../tools/tarsia-puzzle/completion-panel.mjs';
import { devImageRelay } from '../tools/tarsia-puzzle/dev-relay.mjs';
import { createStudentPuzzle, tarsiaCompletionRecord } from '../tools/tarsia-puzzle/engine/index.mjs';
import { recordImageUrls } from '../tools/tarsia-puzzle/record-board.mjs';
import { catalogueFromSets, mergeSets } from '../tools/vocabulary-games-core/vocabulary.mjs';
import { FIXTURE_SETS } from '../tools/tarsia-puzzle/dev/fixtures.mjs';

const { sets } = catalogueFromSets(FIXTURE_SETS, { allowData: true });
const ALL = mergeSets(sets, ['zz-fixture-countries', 'zz-fixture-more-countries']).entries;
const solved = p => ({ pieces: Object.fromEntries(p.pieces.map(x => [x.id, { slot: x.home.slot, rotation: x.home.rotation, locked: x.locked }])), tray: [] });
const root = path.resolve(import.meta.dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('completion summary uses the real pair count, shape and mode', () => {
  const p = createStudentPuzzle({ entries: ALL, templateId: 'hexagon-6', modeId: 'hanzi-picture', seed: 1 });
  const rec = tarsiaCompletionRecord(p, solved(p), { vocabularySets: [] });
  assert.equal(completionSummary(rec), 'You matched all 6 word pairs in the Hexagon (Hanzi + Picture).');
});

test('name and class are optional, trimmed and only ever placed in the record object', () => {
  const p = createStudentPuzzle({ entries: ALL, templateId: 'small-triangle-4', modeId: 'pinyin-english', seed: 2 });
  assert.deepEqual(tarsiaCompletionRecord(p, solved(p), { vocabularySets: [], student: { firstName: '  Mia ', className: ' 5B ' } }).student, { firstName: 'Mia', className: '5B' });
  assert.deepEqual(tarsiaCompletionRecord(p, solved(p), { vocabularySets: [], student: { firstName: '', className: '' } }).student, {});
});

test('privacy: the completion code stores nothing and sends nothing (no storage, analytics or Firebase calls)', () => {
  for (const f of ['tools/tarsia-puzzle/completion-panel.mjs', 'tools/tarsia-puzzle/workspace.mjs', 'tools/tarsia-puzzle/record-board.mjs',
    'tools/learning-record-export/card.mjs', 'tools/learning-record-export/export.mjs', 'tools/learning-record-export/image-loader.mjs']) {
    const code = source(f);
    assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|firebase|analytics|gtag|document\.cookie/i, f);
  }
  // The only network call in the export path is the strict picture loader (CORS mode, credentials omitted).
  assert.doesNotMatch(source('tools/tarsia-puzzle/completion-panel.mjs'), /\bfetch\(/);
  assert.match(source('tools/learning-record-export/image-loader.mjs'), /credentials: 'omit'/);
});

test('pictures needed for a record: all of them for picture modes, none for text-only modes', () => {
  const pic = createStudentPuzzle({ entries: ALL, templateId: 'triangle-9', modeId: 'pinyin-picture', seed: 4 });
  const txt = createStudentPuzzle({ entries: ALL, templateId: 'triangle-9', modeId: 'hanzi-english', seed: 4 });
  assert.equal(recordImageUrls(tarsiaCompletionRecord(pic, solved(pic), { vocabularySets: [] }).content).length, 9);
  assert.equal(recordImageUrls(tarsiaCompletionRecord(txt, solved(txt), { vocabularySets: [] }).content).length, 0);
});

test('developer image relay is only active on a local preview with ?devRelay=1', () => {
  assert.equal(devImageRelay({ hostname: 'themandarinroom.github.io', search: '?devRelay=1' }), undefined);
  assert.equal(devImageRelay({ hostname: '127.0.0.1', search: '' }), undefined);
  const r = devImageRelay({ hostname: '127.0.0.1', search: '?set=a&devRelay=1' });
  assert.equal(r('https://x/y?z=1'), '/__img?u=https%3A%2F%2Fx%2Fy%3Fz%3D1');
});
