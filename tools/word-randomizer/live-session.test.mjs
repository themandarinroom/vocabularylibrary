import test from "node:test";
import assert from "node:assert/strict";
import { DRAW_MODES } from "./random-engine.mjs";
import { LIVE_MODES } from "./live-session-core.mjs";
import { SimulatedLiveSessionBackend } from "./simulated-live-backend.mjs";

const words = [
  { id: "dog", setId: "year1-pets", drawKey: "year1-pets::dog", chinese: "狗", pinyin: "gǒu", english: "dog" },
  { id: "cat", setId: "year1-pets", drawKey: "year1-pets::cat", chinese: "猫", pinyin: "māo", english: "cat" },
  { id: "fish", setId: "year1-pets", drawKey: "year1-pets::fish", chinese: "鱼", pinyin: "yú", english: "fish" }
];

test("session snapshot keeps its Teacher Voice revision across resume", async () => {
  const source = [{ ...words[0], teacherAudioUrl: "https://staging.example/voice-old", teacherVoiceRevision: 101 }];
  const backend = new SimulatedLiveSessionBackend({ random: () => 0 });
  const teacher = await backend.createSession({ items: source, drawMode: DRAW_MODES.NO_REPEAT });
  const student = await backend.join(teacher.snapshot().joinCode, { name: "iPad" });
  source[0].teacherAudioUrl = "https://staging.example/voice-new";
  source[0].teacherVoiceRevision = 202;
  const refreshed = backend.resume(student.credentials);
  assert.equal(refreshed.snapshot().pool[0].teacherAudioUrl, "https://staging.example/voice-old");
  assert.equal(refreshed.snapshot().pool[0].teacherVoiceRevision, 101);
});

test("teacher draw is authoritative for teacher and three viewers", async () => {
  const backend = new SimulatedLiveSessionBackend({ random: () => 0 });
  const teacher = await backend.createSession({ items: words, drawMode: DRAW_MODES.NO_REPEAT });
  const code = teacher.snapshot().joinCode;
  const students = await Promise.all([1, 2, 3].map((n) => backend.join(code, { name: `iPad ${n}` })));
  await teacher.draw("class");
  const states = [teacher, ...students].map((client) => client.snapshot().groups.class);
  assert.equal(new Set(states.map((state) => state.currentItemKey)).size, 1);
  assert.equal(new Set(states.map((state) => state.drawNumber)).size, 1);
  assert.equal(states[0].history.length, 1); assert.equal(teacher.snapshot().connectedDeviceCount, 4);
  assert.equal(teacher.snapshot().devices.some((device) => "token" in device || "tokenHash" in device), false);
});

test("one delegated student draws once and control returns to teacher", async () => {
  const backend = new SimulatedLiveSessionBackend({ random: () => 0.4 });
  const teacher = await backend.createSession({ items: words, drawMode: DRAW_MODES.ALLOW_REPEATS }); const code = teacher.snapshot().joinCode;
  const chosen = await backend.join(code, { name: "Chosen iPad" }); const viewer = await backend.join(code, { name: "Viewer iPad" });
  await teacher.delegate("class", chosen.deviceId);
  await assert.rejects(() => viewer.draw("class"), { code: "not-controller" });
  const draw = await chosen.draw("class"); assert.equal(draw.snapshot.groups.class.drawNumber, 1);
  assert.equal(draw.snapshot.groups.class.controller.type, "teacher");
  await assert.rejects(() => chosen.draw("class"), { code: "not-controller" });
});

test("two groups keep independent histories and no-repeat pools", async () => {
  const backend = new SimulatedLiveSessionBackend({ random: () => 0 });
  const teacher = await backend.createSession({ mode: LIVE_MODES.GROUPS, groupNames: ["Koalas", "Wombats"], items: words, drawMode: DRAW_MODES.NO_REPEAT });
  const code = teacher.snapshot().joinCode;
  const a = await backend.join(code, { name: "A", groupId: "group-1" }); const b = await backend.join(code, { name: "B", groupId: "group-2" });
  await teacher.delegate("group-1", a.deviceId); await a.draw("group-1");
  await teacher.delegate("group-2", b.deviceId); await b.draw("group-2"); await teacher.draw("group-2");
  const snapshot = teacher.snapshot();
  assert.equal(snapshot.groups["group-1"].history.length, 1); assert.equal(snapshot.groups["group-2"].history.length, 2);
  assert.equal(snapshot.groups["group-1"].remainingItemKeys.length, 2); assert.equal(snapshot.groups["group-2"].remainingItemKeys.length, 1);
});

test("duplicate request is idempotent and stale request is rejected", async () => {
  const backend = new SimulatedLiveSessionBackend({ random: () => 0.7 }); const teacher = await backend.createSession({ items: words, drawMode: DRAW_MODES.ALLOW_REPEATS });
  const first = await teacher.draw("class", { requestId: "same", expectedVersion: 0, controlEpoch: 0 });
  const duplicate = await teacher.draw("class", { requestId: "same", expectedVersion: 0, controlEpoch: 0 });
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.snapshot.groups.class.history.length, 1);
  await assert.rejects(() => teacher.draw("class", { requestId: "stale", expectedVersion: 0, controlEpoch: 0 }), { code: "stale-request" });
  assert.equal(first.item.drawKey, duplicate.item.drawKey);
});

test("refresh resumes current state and disconnect does not block draws", async () => {
  const backend = new SimulatedLiveSessionBackend({ random: () => 0 }); const teacher = await backend.createSession({ items: words, drawMode: DRAW_MODES.NO_REPEAT });
  const student = await backend.join(teacher.snapshot().joinCode, { name: "iPad" }); await teacher.draw("class");
  const refreshed = backend.resume(student.credentials); assert.equal(refreshed.snapshot().groups.class.currentItemKey, "year1-pets::dog");
  await student.disconnect(); await teacher.draw("class"); assert.equal(teacher.snapshot().groups.class.drawNumber, 2);
});

test("reset and allow-repeats preserve configured vocabulary", async () => {
  const backend = new SimulatedLiveSessionBackend({ random: () => 0 }); const teacher = await backend.createSession({ items: words, drawMode: DRAW_MODES.NO_REPEAT });
  await teacher.draw("class"); await teacher.reset("class", DRAW_MODES.ALLOW_REPEATS);
  await teacher.draw("class"); await teacher.draw("class");
  const group = teacher.snapshot().groups.class; assert.deepEqual(group.history, ["year1-pets::dog", "year1-pets::dog"]); assert.equal(group.remainingItemKeys.length, 3);
});

test("live no-repeat draws every word once and reports completion", async () => {
  const values = [0.8, 0, 0]; let index = 0; const backend = new SimulatedLiveSessionBackend({ random: () => values[index++] ?? 0 });
  const teacher = await backend.createSession({ items: words, drawMode: DRAW_MODES.NO_REPEAT });
  await teacher.draw("class"); await teacher.draw("class"); await teacher.draw("class");
  const group = teacher.snapshot().groups.class; assert.equal(new Set(group.history).size, 3); assert.equal(group.isComplete, true);
  await assert.rejects(() => teacher.draw("class"), { code: "round-complete" });
});

test("teacher lock, immediate revoke, group assignment and end are enforced", async () => {
  const backend = new SimulatedLiveSessionBackend({ random: () => 0 });
  const teacher = await backend.createSession({ mode: LIVE_MODES.GROUPS, groupNames: ["A", "B"], items: words, drawMode: DRAW_MODES.NO_REPEAT }); const code = teacher.snapshot().joinCode;
  const student = await backend.join(code, { name: "iPad", groupId: "group-1" });
  await teacher.delegate("group-1", student.deviceId); const delegated = student.snapshot().groups["group-1"];
  await teacher.revoke("group-1");
  await assert.rejects(() => student.draw("group-1", { requestId: "queued", expectedVersion: delegated.version, controlEpoch: delegated.controller.epoch }), { code: "stale-request" });
  await teacher.assignGroup(student.deviceId, "group-2"); assert.equal(student.snapshot().assignedGroupId, "group-2"); assert.deepEqual(student.snapshot().devices, []);
  await teacher.setJoiningLocked(true); await assert.rejects(() => backend.join(code), { code: "joining-locked" });
  await teacher.end(); assert.equal(student.snapshot().status, "ended"); await assert.rejects(() => teacher.draw("group-2"), { code: "session-ended" });
});
