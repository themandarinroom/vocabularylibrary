// Builds the TEMPORARY Tarsia Puzzle staging site for GitHub Pages (repository themandarinroom/tarsia-staging, D3).
// Served from https://themandarinroom.github.io/tarsia-staging/ so the approved Storage CORS origin applies.
//
//   node scripts/build-tarsia-staging.mjs <outputDir> <websitePreviewOrigin>
//   e.g. node scripts/build-tarsia-staging.mjs /tmp/tarsia-staging https://the-mandarin-room-staging--vocabulary-games-xxxx.web.app
//
// Payload = only the files the Tarsia page actually loads (crawled from its HTML, CSS and module imports; dev/ never),
// with the same relative paths as in the Vocabulary Library, so the code is byte-identical except for the rewrites
// below. Every rewrite has an exact expected count. The game keeps reading published vocabulary read-only from
// Production through the existing Production-locked runtime. Nothing here deploys.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [outArg, previewArg] = process.argv.slice(2);
if (!outArg || !/^https:\/\/the-mandarin-room-staging--[a-z0-9-]+\.web\.app$/.test(previewArg || ''))
  throw new Error('usage: node scripts/build-tarsia-staging.mjs <outputDir> https://the-mandarin-room-staging--<channel>.web.app');
const out = path.resolve(outArg), preview = previewArg;
const ENTRY = 'tools/tarsia-puzzle/index.html';

// ---- crawl ----
const files = new Set(), queue = [ENTRY];
const local = (from, ref) => {
  if (!ref || /^(https?:|data:|blob:|#|mailto:)/.test(ref) || ref.includes('${')) return null;
  const clean = ref.split(/[?#]/)[0]; if (!clean) return null;
  const rel = path.posix.normalize(path.posix.join(path.posix.dirname(from), clean));
  if (rel.startsWith('..')) throw new Error(`${from} references outside the repository: ${ref}`);
  return rel;
};
while (queue.length) {
  const f = queue.shift(); if (files.has(f)) continue;
  if (f.includes('/dev/')) throw new Error(`developer file reached from the page: ${f}`);
  if (!fs.existsSync(path.join(repo, f))) throw new Error(`missing file ${f}`);
  files.add(f);
  const ext = path.extname(f); if (!['.html', '.mjs', '.js', '.css'].includes(ext)) continue;
  const text = fs.readFileSync(path.join(repo, f), 'utf8'), refs = [];
  if (ext === '.html') for (const m of text.matchAll(/(?:src|href)="([^"]+)"/g)) refs.push(m[1]);
  if (ext === '.css') for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) refs.push(m[1]);
  if (ext === '.mjs' || ext === '.js') {
    const code = text.replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/(?:^|[;\s])import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) refs.push(m[1]);
    for (const m of code.matchAll(/\bexport\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g)) refs.push(m[1]);
    for (const m of code.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) refs.push(m[1]);
    for (const m of code.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g)) refs.push(m[1]);
    for (const m of code.matchAll(/['"]((?:\.\.?\/)+[^'"\s]+\.(?:png|webp|svg|jpg|json|css))['"]/g)) refs.push(m[1]);
  }
  for (const r of refs) { const rel = local(f, r); if (rel && !files.has(rel)) queue.push(rel); }
}

// ---- copy + rewrites (exact counts) ----
fs.rmSync(out, { recursive: true, force: true });
for (const f of files) { fs.mkdirSync(path.join(out, path.dirname(f)), { recursive: true }); fs.copyFileSync(path.join(repo, f), path.join(out, f)); }
const REWRITES = [
  [ENTRY, 'https://themandarinroom.au/#/activities/vocabulary-games', `${preview}/#/activities/vocabulary-games`, 2],
  [ENTRY, 'href="https://themandarinroom.au/"', `href="${preview}/"`, 4],
  [ENTRY, '<span class="phase-badge">v0.1 · Solo</span>', '<span class="phase-badge">v0.1 · Solo · STAGING</span>', 1],
  [ENTRY, '<title>Tarsia Puzzle · The Mandarin Room</title>', '<title>STAGING · Tarsia Puzzle · The Mandarin Room</title>', 1],
];
for (const [file, from, to, expected] of REWRITES) {
  const p = path.join(out, file), text = fs.readFileSync(p, 'utf8'), found = text.split(from).length - 1;
  if (found !== expected) throw new Error(`rewrite in ${file}: expected ${expected} × ${from}, found ${found}`);
  fs.writeFileSync(p, text.replaceAll(from, to));
}
// ---- site files ----
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Tarsia Puzzle · staging</title><meta http-equiv="refresh" content="0; url=tools/tarsia-puzzle/"><a href="tools/tarsia-puzzle/">Tarsia Puzzle (staging)</a>\n`);
fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(out, '.nojekyll'), '');
fs.writeFileSync(path.join(out, 'README.md'), `# Tarsia Puzzle — temporary staging (The Mandarin Room)\n\nTemporary GitHub Pages staging copy of the Tarsia Puzzle from the Vocabulary Library, built by \`scripts/build-tarsia-staging.mjs\`.\nIt reads published vocabulary read-only and keeps every learning record on the device. It will be deleted after release.\n`);

// ---- guards: nothing private, no developer tools, no stray production navigation ----
const problems = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const all = walk(out);
for (const p of all) {
  const rel = path.relative(out, p);
  if (/(^|\/)(dev|tests?)\//.test(rel) || /\.env|local\.env|\.pem$|\.key$/.test(rel)) problems.push(`${rel}: not allowed in the payload`);
  if (!/\.(html|mjs|js|css|txt|md|json|svg)$/.test(rel)) continue;
  const t = fs.readFileSync(p, 'utf8');
  if (/PRIVATE KEY|service_account|client_secret|refresh_token|gh[pousr]_[A-Za-z0-9]{20,}/.test(t)) problems.push(`${rel}: secret pattern`);
  if (/[?&]token=[0-9a-f]{8}-/.test(t)) problems.push(`${rel}: Firebase download token`);
  if (/themandarinroom\.au/.test(t)) problems.push(`${rel}: production website link`);
}
if (problems.length) { fs.rmSync(out, { recursive: true, force: true }); throw new Error('Staging payload refused:\n' + problems.join('\n')); }
console.log(`Tarsia staging payload: ${all.length} files in ${out}\nHeader links → ${preview}\n` + [...files].sort().map(f => '  ' + f).join('\n'));
