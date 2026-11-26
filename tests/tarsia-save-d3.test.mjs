// D3: saving the learning record — desktop download vs iPad/iPhone share sheet, honest status messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prefersShareSheet, saveLearningRecord, downloadBlob } from '../tools/learning-record-export/export.mjs';

const UA = {
  macSafari: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 },
  macChrome: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0, userAgentData: { mobile: false } },
  windows: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0', platform: 'Win32', maxTouchPoints: 10, userAgentData: { mobile: false } },
  // iPad 7/9 Safari default ("Request Desktop Website" on): looks like a Mac but has a touch screen.
  iPadDesktopClass: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 },
  iPadMobileMode: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1', platform: 'iPad', maxTouchPoints: 5 },
  iPhone: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 },
  android: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5, userAgentData: { mobile: true } },
};
class F { constructor(parts, name, opts) { this.parts = parts; this.name = name; this.type = opts.type; } }

test('device detection: desktops download; iPad (including desktop-class Safari), iPhone and Android share', () => {
  for (const k of ['macSafari', 'macChrome', 'windows']) assert.equal(prefersShareSheet({ nav: UA[k] }), false, k);
  for (const k of ['iPadDesktopClass', 'iPadMobileMode', 'iPhone', 'android']) assert.equal(prefersShareSheet({ nav: UA[k] }), true, k);
});

test('desktop: standard download even when the Web Share API is available; filename kept; share never called', async () => {
  let shared = false, downloaded = null;
  const nav = { ...UA.macSafari, canShare: () => true, share: async () => { shared = true; } };
  const r = await saveLearningRecord({}, 'tarsia-puzzle-2026-11-26-mia.png', { nav, FileCtor: F, download: (b, n) => { downloaded = n; } });
  assert.equal(r, 'downloaded'); assert.equal(shared, false); assert.equal(downloaded, 'tarsia-puzzle-2026-11-26-mia.png');
});

test('iPad (desktop-class Safari): share sheet with the PNG file; cancel is not an error; failure falls back', async () => {
  let got = null;
  const ok = { ...UA.iPadDesktopClass, canShare: d => d.files?.[0]?.type === 'image/png', share: async d => { got = d; } };
  assert.equal(await saveLearningRecord({}, 'r.png', { nav: ok, FileCtor: F, download: () => assert.fail('no download on iPad') }), 'shared');
  assert.equal(got.files[0].name, 'r.png');
  const cancel = { ...ok, share: async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); } };
  assert.equal(await saveLearningRecord({}, 'r.png', { nav: cancel, FileCtor: F }), 'cancelled');
  const broken = { ...ok, share: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } };
  assert.equal(await saveLearningRecord({}, 'r.png', { nav: broken, FileCtor: F }), 'offer');
  assert.equal(await saveLearningRecord({}, 'r.png', { nav: { ...UA.iPadMobileMode }, FileCtor: F }), 'offer', 'no file sharing → press-and-hold + download link');
  assert.equal(await saveLearningRecord({}, 'r.png', { nav: { ...UA.iPhone, canShare: () => false, share: async () => {} }, FileCtor: F }), 'offer');
});

test('downloadBlob uses an <a download> with the filename and releases the URL later', () => {
  const clicked = [], revoked = []; let later;
  const a = { style: {}, click() { clicked.push(this.download); }, remove() {} };
  const doc = { createElement: () => a, body: { appendChild() {} } };
  downloadBlob({}, 'x.png', { doc, URLApi: { createObjectURL: () => 'blob:1', revokeObjectURL: u => revoked.push(u) }, later: fn => { later = fn; } });
  assert.deepEqual(clicked, ['x.png']); assert.equal(a.href, 'blob:1'); assert.deepEqual(revoked, []); later(); assert.deepEqual(revoked, ['blob:1']);
});

test('panel messages are honest: no "Saved" claim; the four approved messages; button label unchanged', () => {
  const panel = fs.readFileSync(new URL('../tools/tarsia-puzzle/completion-panel.mjs', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../tools/tarsia-puzzle/index.html', import.meta.url), 'utf8');
  for (const m of ['Your learning record is ready.', 'Download started. Check your Downloads folder.', 'Choose Save Image or Save to Files, if available.', 'Your learning record is ready to save.']) assert(panel.includes(m), m);
  assert(!/\bSaved\b/.test(panel), 'never says Saved');
  assert(!/shareOrOffer/.test(panel), 'old share-first path no longer used');
  assert.match(html, /<button id="cp-save" type="button" class="primary-button" disabled>Save learning record<\/button>/);
  assert.match(html, /press and hold the picture below/);
});
