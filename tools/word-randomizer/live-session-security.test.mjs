import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("production rules keep secrets backend-only and scope teacher device lists", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /match \/deviceSecrets\/\{deviceId\} \{ allow read, write: if false; \}/);
  assert.match(rules, /match \/deviceViews\/\{viewId\}[\s\S]*allow get:[\s\S]*allow list, create, update, delete: if false;/);
  assert.match(rules, /match \/devices\/\{deviceId\}[\s\S]*allow get, list: if isSessionTeacher\(sessionId\)/);
  assert.match(rules, /match \/groups\/\{groupId\}[\s\S]*allow list: if isSessionTeacher\(sessionId\)/);
  assert.match(rules, /match \/liveGameJoinCodes\/\{joinCode\} \{ allow read, write: if false; \}/);
  assert.match(rules, /match \/liveGameJoinRateLimits\/\{limitId\} \{ allow read, write: if false; \}/);
});

test("public projections exclude secrets, teacher identity, join code and presence lists", () => {
  const backend = read("functions/live-game-sessions.js");
  const publicSessionWrite = backend.match(/transaction\.create\(publicRef\(id\), \{([^}]+)\}\);/)?.[1] || "";
  const publicGroupBody = backend.match(/function publicGroup[\s\S]+?\n\}/)?.[0] || "";
  assert.ok(publicSessionWrite); assert.doesNotMatch(publicSessionWrite, /teacherUid|joinCode|deviceToken|tokenHash|connectedDeviceCount/);
  assert.doesNotMatch(publicGroupBody, /memberDeviceIds|teacherUid|joinCode|deviceToken|tokenHash|viewId/);
  assert.match(backend, /enforceAppCheck: false/);
});

test("production Firebase exports the reviewed live-session backend and index", () => {
  const productionRules = read("firestore.rules"); const productionConfig = JSON.parse(read("firebase.json")); const functions = read("functions/index.js");
  assert.match(productionRules, /liveGameSessions|deviceSecrets|liveGameJoinCodes/);
  assert.equal(productionConfig.firestore.rules, "firestore.rules");
  assert.equal(productionConfig.firestore.indexes, "tools/word-randomizer/firestore-live-sessions.proposed.indexes.json");
  assert.match(functions, /Object\.assign\(exports, require\("\.\/live-game-sessions"\)\)/);
  assert.match(functions, /exports\.generateVocabularyImage/);
});

test("production allows only authorised teachers to edit shared vocabulary sources", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /match \/vocabularySets\/\{setId\}[\s\S]*allow create, update: if isAuthorisedTeacher\(\)/);
  assert.match(rules, /match \/vocabularyTeacherVoices\/\{voiceId\}[\s\S]*allow create, update: if isAuthorisedTeacher\(\)/);
  assert.match(rules, /validVocabularySet/);
  assert.match(rules, /validVocabularyVoice/);
  assert.match(rules, /match \/liveGameSessions\/\{sessionId\}[\s\S]*allow read, write: if false;/);
});
