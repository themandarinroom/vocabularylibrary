// Bingo and Build the Great Wall headers: "Listening Games" links to the website's Listening Games page
// (route verified in the live website routing.mjs, 22 Nov 2026); the game name beside it is plain text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LISTENING_GAMES = 'https://themandarinroom.au/#/activities/listening-games';
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const games = [
  {dir: 'tools/bingo-board', name: 'Bingo', css: 'listening-header-1'},
  {dir: 'tools/great-wall', name: 'Build the Great Wall', css: 'gw-0.2.1'},
];

for (const game of games) {
  test(`${game.name}: header subtitle is a Listening Games link, with the game name as plain text`, () => {
    const html = read(`${game.dir}/index.html`);
    const headers = html.match(/<header[\s\S]*?<\/header>/g);
    assert.equal(headers.length, 1, 'one header serves every screen of the app');
    const header = headers[0];
    assert(header.includes(`<span class="tmr-app-row"><a class="tmr-app-link" href="${LISTENING_GAMES}">Listening Games</a><span class="tmr-app-current">${game.name}</span></span>`));
    assert.equal((header.match(/class="tmr-app-link"/g) || []).length, 1);
    // Logo and title are unchanged and still go to the homepage.
    assert(header.includes('<a class="tmr-emblem-link" href="https://themandarinroom.au/" aria-label="The Mandarin Room home"><img class="tmr-emblem" src="../../assets/brand/emblem-header.png" width="56" height="53" alt=""></a>'));
    assert(header.includes('<a class="tmr-home-link" href="https://themandarinroom.au/">The Mandarin Room</a>'));
    assert.match(header, /class="tool-header tmr-unified-header"/);
    // Nothing in the app points at the old Activities page or at a GitHub-hosted copy of itself.
    assert(!/#\/activities"/.test(html), 'no link to #/activities');
    assert(!/github\.io/.test(header), 'header never links to the GitHub-hosted app');
    assert(html.includes(`./styles.css?v=${game.css}`), 'stylesheet version bumped');
  });

  test(`${game.name}: header row styles keep the shared brand sizes`, () => {
    const css = read(`${game.dir}/styles.css`);
    assert.match(css, /\.tmr-app-row\{display:flex;align-items:center;flex-wrap:wrap;column-gap:6px;margin-top:2px;min-width:0\}/);
    assert.match(css, /\.tmr-app-current\{[^}]*font-size:14px;font-weight:550;line-height:1\.3\}/);
    assert.match(css, /@media \(max-width:700px\)\{\.tmr-app-current\{font-size:13px\}\}/);
    assert.match(css, /content:"·" \/ ""/, 'separator is hidden from screen readers');
    assert.match(css, /@media\(pointer:coarse\)\{\.tmr-app-row\{margin-top:0\}\}/, 'touch header keeps its 112px height');
  });
}

test('Great Wall hides the long game name on narrow phones so the header keeps its height', () => {
  assert.match(read('tools/great-wall/styles.css'), /@media \(max-width:460px\)\{\.tmr-app-current\{display:none\}\}/);
});

test('Great Wall completion screen "Back to Games" goes to Listening Games', () => {
  assert(read('tools/great-wall/index.html').includes(`<a id="back-to-games" class="secondary-button" href="${LISTENING_GAMES}">Back to Games</a>`));
});
