import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import qrcode from "./vendor/qrcode-generator-2.0.4.mjs";

const root = new URL("./", import.meta.url);
const [html, app, css] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("app.mjs", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8")
]);

test("local QR generator encodes a GitHub Pages classroom join link", () => {
  const qr = qrcode(0, "M");
  qr.addData("https://themandarinroom.github.io/word-randomiser-staging/tools/word-randomizer/join.html?code=XE6GH&firebase=staging");
  qr.make();
  assert.ok(qr.getModuleCount() >= 21);
  assert.equal(qr.isDark(0, 0), true);
  assert.equal(typeof qr.createDataURL(), "string");
});

test("live header exposes QR and join-code enlargement controls", () => {
  assert.match(html, /id="show-join-code"[^>]*aria-haspopup="dialog"/);
  assert.match(html, /id="show-join-qr"[^>]*aria-label="Enlarge classroom QR code"/);
  assert.match(html, /id="join-display-modal"/);
  assert.match(html, /id="join-qr-large"/);
  assert.match(css, /\.join-display-modal \{ position:fixed;[^}]*place-items:center/);
});

test("QR value is the same relative student link used by Copy join link", () => {
  assert.match(app, /function joinLink\([\s\S]*new URL\("\.\/join\.html", location\.href\)/);
  assert.match(app, /if \(params\.get\("firebase"\) === "staging"\) link\.searchParams\.set\("firebase", "staging"\)/);
  assert.match(app, /updateJoinQr\(snapshot\.joinCode\)/);
  assert.match(app, /navigator\.clipboard\.writeText\(link\.href\)/);
});

test("enlarged join display supports close, backdrop and Escape", () => {
  assert.match(app, /show-join-code[\s\S]*openJoinDisplay\("code"/);
  assert.match(app, /show-join-qr[\s\S]*openJoinDisplay\("qr"/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(app, /event\.target === \$\("#join-display-modal"\)/);
});
