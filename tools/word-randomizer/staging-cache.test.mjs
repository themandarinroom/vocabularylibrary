import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveVocabularyCachePolicy } from "../../js/vocabulary-store.js";

test("cache namespace is derived from the actual Firebase project ID", () => {
  assert.deepEqual(resolveVocabularyCachePolicy("the-mandarin-room-staging"), {
    projectId: "the-mandarin-room-staging",
    storageKey: "mandarin-room-vocabulary-cache-v3:the-mandarin-room-staging"
  });
  assert.deepEqual(resolveVocabularyCachePolicy("the-mandarin-room"), {
    projectId: "the-mandarin-room",
    storageKey: "mandarin-room-vocabulary-cache-v3:the-mandarin-room"
  });
  assert.notEqual(resolveVocabularyCachePolicy("the-mandarin-room-staging").storageKey, resolveVocabularyCachePolicy("the-mandarin-room").storageKey);
});

test("Vocabulary Store has no packaged-data or cloud/cache merge path", () => {
  const store = readFileSync(new URL("../../js/vocabulary-store.js", import.meta.url), "utf8");
  assert.doesNotMatch(store, /vocabulary-data\.js|mergeCloudSets|useBundledFallback/);
  assert.match(store, /const sets = authoritativeSets\(snapshot\);\s*writeCache\(sets\);\s*return sets;/);
  assert.match(store, /if \(!data \|\| data\.deleted === true \|\| data\.published !== true\) \{\s*removeCachedSet\(id\);\s*return null;/);
  assert.match(store, /catch \(error\)[\s\S]*return localSets\(\)/);
});

test("Randomiser refreshes the requested set and loads the new architecture version", () => {
  const app = readFileSync(new URL("./app.mjs", import.meta.url), "utf8");
  const bootstrap = readFileSync(new URL("./runtime-bootstrap.mjs", import.meta.url), "utf8");
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(app, /getSet, getSets/);
  assert.match(app, /const selectedSet = await getSet\(requested\)/);
  assert.match(app, /vocabulary-store\.js\?v=firebase-authority-1/);
  assert.match(bootstrap, /app\.mjs\?v=firebase-authority-1/);
  assert.match(page, /runtime-bootstrap\.mjs\?v=firebase-authority-1/);
});

test("live clients use only the session Teacher Voice snapshot", () => {
  const app = readFileSync(new URL("./app.mjs", import.meta.url), "utf8");
  const student = readFileSync(new URL("./student.mjs", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../../functions/live-game-sessions.js", import.meta.url), "utf8");
  assert.match(app, /if \(isLive\(\)\) \{[\s\S]*item\.teacherAudioUrl[\s\S]*item\.teacherVoiceRevision[\s\S]*return;/);
  assert.doesNotMatch(student, /getTeacherVoice|teacher-voice-cloud/);
  assert.match(student, /item\?\.teacherVoiceRevision/);
  assert.doesNotMatch(backend, /source\.audio\?\.teacherAudioUrl/);
  assert.match(backend, /teacherVoiceRevision/);
});
