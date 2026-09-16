import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const [html, student, css] = await Promise.all([
  readFile(new URL("join.html", root), "utf8"),
  readFile(new URL("student.mjs", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8")
]);

test("joined students receive a dedicated bilingual waiting scene", () => {
  assert.match(html, /class="waiting-copy student-waiting"/);
  assert.match(html, /等待老师开始/);
  assert.match(html, /Ready for Lucky Draw/);
  assert.match(css, /\.student-waiting \.waiting-draw-box/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test("delegated student draw previews words but submits one authoritative callable draw", () => {
  assert.match(student, /const candidates = Array\.isArray\(state\.snapshot\?\.pool\)/);
  assert.match(student, /renderCard\(preview,[\s\S]*\{ preview: true \}\)/);
  assert.match(student, /state\.client\.draw\(group\.id,[\s\S]*expectedVersion: group\.version[\s\S]*controlEpoch: group\.controller\.epoch/);
  assert.match(student, /const authoritativeSnapshot = state\.pendingSnapshot/);
});

test("student join inputs are constrained inside narrow cards", () => {
  assert.match(css, /\.student-join-card input \{[^}]*width:100%;[^}]*min-width:0;[^}]*max-width:100%/);
  assert.match(css, /\.student-join-card label \{[^}]*min-width:0/);
  assert.match(css, /@media \(max-width:660px\) \{ \.student-join-card \{ width:calc\(100% - 24px\)/);
});
