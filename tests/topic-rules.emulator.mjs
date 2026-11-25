// Firestore rules + migration test against the local emulator only (demo project, no network):
//   firebase emulators:exec --only firestore --project demo-topics "node --test tests/topic-rules.emulator.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = process.env.GCLOUD_PROJECT || "demo-topics";
if (!host) throw new Error("Run inside `firebase emulators:exec --only firestore`.");
if (!project.startsWith("demo-")) throw new Error("Emulator tests use a demo- project only.");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const tokenFor = (uid) => `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: `https://securetoken.google.com/${project}`, aud: project, sub: uid, user_id: uid, email: `${uid}@example.test`, email_verified: true, iat: 1, exp: 4102444800, auth_time: 1, firebase: { sign_in_provider: "google.com" } })}.`;
const enc = (v) => v === null ? { nullValue: null } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };

async function call(url, { method = "GET", body, auth } = {}) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, json: await response.json().catch(() => null) };
}
const admin = (id, data) => call(`${docs}/vocabularySets/${id}`, { method: "PATCH", auth: "owner", body: { fields: enc(data).mapValue.fields } });
// A client-style write as the editor makes it: full document, server timestamp, updatedBy = uid.
const write = (uid, id, data) => call(`${docs}:commit`, { method: "POST", auth: uid ? tokenFor(uid) : undefined, body: { writes: [{
  update: { name: `projects/${project}/databases/(default)/documents/vocabularySets/${id}`, fields: enc({ ...data, published: true, updatedBy: uid || "anonymous" }).mapValue.fields },
  updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }] }] } });
const set = (id, extra = {}) => ({ id, yearLevel: 5, title: "ZZ Topic Test", chineseTitle: "测试", description: "", coverImage: null, coverImageStoragePath: null, coverImageGenerated: false, items: [], ...extra });
const topicOf = async (id) => (await call(`${docs}/vocabularySets/${id}`, { auth: "owner" })).json?.fields?.topicId?.stringValue;

test.before(async () => {
  await call(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
  await call(`${docs}/authorizedTeachers/teacher-1`, { method: "PATCH", auth: "owner", body: { fields: { active: { booleanValue: true } } } });
});

test("an authorised teacher can create a set with a valid topic, but not with an unknown one", async () => {
  assert.equal((await write("teacher-1", "zz-valid", set("zz-valid", { topicId: "free-time" }))).status, 200);
  assert.equal(await topicOf("zz-valid"), "free-time");
  for (const topicId of ["sports", "greetings", "Free Time", "", 5]) assert.equal((await write("teacher-1", "zz-invalid", set("zz-invalid", { topicId }))).status, 403, String(topicId));
});

test("a teacher can reassign a topic; an edit that drops an existing topic is refused", async () => {
  assert.equal((await write("teacher-1", "zz-valid", set("zz-valid", { topicId: "people" }))).status, 200);
  assert.equal(await topicOf("zz-valid"), "people");
  assert.equal((await write("teacher-1", "zz-valid", set("zz-valid"))).status, 403, "stale editor without topicId");
  assert.equal(await topicOf("zz-valid"), "people");
});

test("legacy sets without a topic stay editable during migration, and delete still works", async () => {
  await admin("zz-legacy", { ...set("zz-legacy"), published: true });
  assert.equal((await write("teacher-1", "zz-legacy", set("zz-legacy", { title: "ZZ Legacy renamed" }))).status, 200);
  assert.equal((await write("teacher-1", "zz-valid", { id: "zz-valid", deleted: true })).status, 200, "tombstone of a set with a topic");
});

test("anonymous users and signed-in non-teachers cannot change topic metadata", async () => {
  assert.equal((await write(null, "zz-legacy", set("zz-legacy", { topicId: "culture" }))).status, 403);
  assert.equal((await write("student-1", "zz-legacy", set("zz-legacy", { topicId: "culture" }))).status, 403);
  assert.equal(await topicOf("zz-legacy"), undefined);
});

test("published topicIds are readable by the anonymous public query the website uses", async () => {
  await write("teacher-1", "zz-public", set("zz-public", { topicId: "social-interactions" }));
  const rows = (await call(`${docs}:runQuery`, { method: "POST", body: { structuredQuery: { from: [{ collectionId: "vocabularySets" }], where: { fieldFilter: { field: { fieldPath: "published" }, op: "EQUAL", value: { booleanValue: true } } } } } })).json;
  const found = rows.find((r) => r.document?.name.endsWith("/zz-public"));
  assert.equal(found.document.fields.topicId.stringValue, "social-interactions");
});

test("migration script: dry run writes nothing, apply assigns, rerun is a no-op, rollback restores", async () => {
  await call(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
  const items = [{ id: "dog", chinese: "狗", pinyin: "gou", english: "dog", image: "https://example.test/dog.webp", audio: { aiEnabled: true } }];
  await admin("year1-pets", { ...set("year1-pets", { yearLevel: 1, title: "Pets I", items, coverImage: "https://example.test/pets.webp" }), published: true });
  await admin("year3-age", { ...set("year3-age", { yearLevel: 3, title: "Age" }), published: true });
  await admin("year1-testing", { ...set("year1-testing", { yearLevel: 1, title: "testing" }), published: true });
  await admin("year2-family", { id: "year2-family", deleted: true, published: true });
  const backups = mkdtempSync(path.join(tmpdir(), "topic-migration-"));
  const run = (...extra) => execFileSync(process.execPath, ["scripts/migrations/assign-topic-ids.mjs", "--project", project, "--emulator", host, "--backup-dir", backups, ...extra], { cwd: repo, encoding: "utf8" });
  const before = (await call(`${docs}/vocabularySets/year1-pets`, { auth: "owner" })).json;

  assert.match(run(), /Dry run: 2 set\(s\) would be assigned/);
  assert.equal(await topicOf("year1-pets"), undefined);
  const applied = run("--apply");
  assert.match(applied, /Readback passed: 2 assigned/);
  assert.match(applied, /year1-testing \(unmapped\)/);
  assert.equal(await topicOf("year1-pets"), "animals");
  assert.equal(await topicOf("year3-age"), "people");
  assert.equal(await topicOf("year1-testing"), undefined, "unmapped sets are never guessed");
  const after = (await call(`${docs}/vocabularySets/year1-pets`, { auth: "owner" })).json;
  const { topicId, ...rest } = after.fields;
  assert.deepEqual(rest, before.fields, "items, cover, published and timestamps unchanged");
  assert.match(run("--apply"), /Readback passed: 0 assigned/, "rerun is a no-op");

  const firstBackup = readdirSync(backups).filter((f) => !f.endsWith(".after.json")).sort()[0];
  assert.match(run("--rollback", path.join(backups, firstBackup), "--apply"), /Rollback complete/);
  assert.equal(await topicOf("year1-pets"), undefined);
  assert.deepEqual((await call(`${docs}/vocabularySets/year1-pets`, { auth: "owner" })).json.fields, before.fields);
});

test("the migration refuses Production writes without explicit confirmation", () => {
  assert.throws(() => execFileSync(process.execPath, ["scripts/migrations/assign-topic-ids.mjs", "--project", "the-mandarin-room", "--apply"], { cwd: repo, encoding: "utf8", stdio: "pipe" }), /Refusing to write to Production without --confirm-production/);
});

test("the migration's write is refused when a set changed after it was read (updateTime precondition)", async () => {
  await admin("zz-race", { ...set("zz-race"), published: true });
  const read = (await call(`${docs}/vocabularySets/zz-race`, { auth: "owner" })).json;
  await admin("zz-race", { ...set("zz-race", { title: "Edited by a teacher meanwhile" }), published: true });
  const stale = await call(`${docs}:commit`, { method: "POST", auth: "owner", body: { writes: [{ update: { name: read.name, fields: { topicId: { stringValue: "people" } } }, updateMask: { fieldPaths: ["topicId"] }, currentDocument: { updateTime: read.updateTime } }] } });
  assert.equal(stale.status, 400);
  assert.match(JSON.stringify(stale.json), /FAILED_PRECONDITION/);
  assert.equal(await topicOf("zz-race"), undefined);
});

test("v1.1: the three new topic IDs are accepted by the rules", async () => {
  await call(`${docs}/authorizedTeachers/teacher-1`, { method: "PATCH", auth: "owner", body: { fields: { active: { booleanValue: true } } } }); // an earlier test clears the emulator
  for (const topicId of ["social-interactions", "nature", "community"]) {
    assert.equal((await write("teacher-1", `zz-${topicId}`, set(`zz-${topicId}`, { topicId }))).status, 200, topicId);
    assert.equal(await topicOf(`zz-${topicId}`), topicId);
  }
});

test("v1.1 rename-retired: greetings moves to social-interactions, rerun is a no-op, rollback restores", async () => {
  await call(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
  await admin("year2-greetings-test", { ...set("year2-greetings-test", { topicId: "greetings", title: "Greetings test" }), published: true });
  await admin("year1-pets", { ...set("year1-pets", { topicId: "animals" }), published: true });
  const backups = mkdtempSync(path.join(tmpdir(), "topic-rename-"));
  const run = (...extra) => execFileSync(process.execPath, ["scripts/migrations/assign-topic-ids.mjs", "--project", project, "--emulator", host, "--backup-dir", backups, "--rename-retired", ...extra], { cwd: repo, encoding: "utf8" });
  const before = (await call(`${docs}/vocabularySets/year2-greetings-test`, { auth: "owner" })).json;
  assert.match(run(), /Dry run: 1 set\(s\) would be assigned/);
  assert.equal(await topicOf("year2-greetings-test"), "greetings");
  assert.match(run("--apply"), /Readback passed: 1 assigned/);
  assert.equal(await topicOf("year2-greetings-test"), "social-interactions");
  assert.equal(await topicOf("year1-pets"), "animals");
  const after = (await call(`${docs}/vocabularySets/year2-greetings-test`, { auth: "owner" })).json;
  const { topicId: a, ...restAfter } = after.fields; const { topicId: b, ...restBefore } = before.fields;
  assert.deepEqual(restAfter, restBefore, "only topicId changed");
  assert.match(run("--apply"), /Readback passed: 0 assigned/);
  const applied = readdirSync(backups).filter((f) => f.endsWith(".plan.json")).sort()[0].replace(".plan.json", ".json");
  assert.match(run("--rollback", path.join(backups, applied), "--apply"), /Rollback complete/);
  assert.equal(await topicOf("year2-greetings-test"), "greetings");
});

// ---- Multi-topic (topicIds) ----
const topicIdsOf = async (id) => ((await call(`${docs}/vocabularySets/${id}`, { auth: "owner" })).json?.fields?.topicIds?.arrayValue?.values || []).map((v) => v.stringValue);
const seedTeacher = () => call(`${docs}/authorizedTeachers/teacher-1`, { method: "PATCH", auth: "owner", body: { fields: { active: { booleanValue: true } } } });

test("multi-topic rules: valid topicIds accepted; invalid, duplicate or inconsistent lists refused; topics can't be dropped", async () => {
  await seedTeacher();
  assert.equal((await write("teacher-1", "zz-multi", set("zz-multi", { topicIds: ["numbers", "people"], topicId: "numbers" }))).status, 200);
  assert.deepEqual(await topicIdsOf("zz-multi"), ["numbers", "people"]);
  for (const bad of [{ topicIds: ["numbers", "greetings"], topicId: "numbers" }, { topicIds: ["people", "people"], topicId: "people" }, { topicIds: "people", topicId: "people" }, { topicIds: ["people"], topicId: "animals" }])
    assert.equal((await write("teacher-1", "zz-multi-bad", set("zz-multi-bad", bad))).status, 403, JSON.stringify(bad));
  assert.equal((await write("teacher-1", "zz-multi", set("zz-multi", { topicIds: ["people"], topicId: "people" }))).status, 200, "removing one topic keeps the other");
  assert.deepEqual(await topicIdsOf("zz-multi"), ["people"]);
  assert.equal((await write("teacher-1", "zz-multi", set("zz-multi", { topicId: "people" }))).status, 403, "an old editor without topicIds cannot overwrite a multi-topic set");
  assert.equal((await write("teacher-1", "zz-multi", set("zz-multi"))).status, 403, "topics can't be dropped");
  await admin("zz-single", { ...set("zz-single", { topicId: "animals" }), published: true });
  assert.equal((await write("teacher-1", "zz-single", set("zz-single", { topicId: "animals", title: "old editor save" }))).status, 200, "the old editor keeps working on sets that only have topicId");
  assert.equal((await write("teacher-1", "zz-single", set("zz-single", { topicIds: ["animals", "nature"], topicId: "animals" }))).status, 200, "the new editor can add topics to a legacy set");
  assert.equal((await write("student-1", "zz-single", set("zz-single", { topicIds: ["culture"], topicId: "culture" }))).status, 403);
});

test("multi-topic scripts: backfill then Age -> Numbers + People; reruns are no-ops; rollbacks restore", async () => {
  await call(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
  const items = [{ id: "how-old", chinese: "你几岁？", pinyin: "ni ji sui", english: "How old are you?", image: null, audio: { aiEnabled: true } }];
  await admin("year3-age", { ...set("year3-age", { yearLevel: 3, title: "Age", topicId: "people", items }), published: true });
  await admin("year1-pets", { ...set("year1-pets", { yearLevel: 1, title: "Pets I", topicId: "animals" }), published: true });
  const backups = mkdtempSync(path.join(tmpdir(), "topic-multi-"));
  const run = (...extra) => execFileSync(process.execPath, ["scripts/migrations/assign-topic-ids.mjs", "--project", project, "--emulator", host, "--backup-dir", backups, ...extra], { cwd: repo, encoding: "utf8" });
  const ageBefore = (await call(`${docs}/vocabularySets/year3-age`, { auth: "owner" })).json;

  assert.match(run("--backfill-topic-ids", "--apply"), /Readback passed: 2 assigned/);
  assert.deepEqual(await topicIdsOf("year3-age"), ["people"]); assert.deepEqual(await topicIdsOf("year1-pets"), ["animals"]);
  assert.match(run("--backfill-topic-ids", "--apply"), /Readback passed: 0 assigned/);

  assert.match(run("--set-topics", "year3-age=people,numbers"), /Dry run: 1 set\(s\) would be assigned/);
  assert.match(run("--set-topics", "year3-age=people,numbers", "--apply"), /Readback passed: 1 assigned/);
  assert.deepEqual(await topicIdsOf("year3-age"), ["numbers", "people"]);
  assert.equal(await topicOf("year3-age"), "numbers");
  const ageAfter = (await call(`${docs}/vocabularySets/year3-age`, { auth: "owner" })).json;
  for (const f of ["items", "title", "yearLevel", "published", "updatedAt", "updatedBy"]) assert.deepEqual(ageAfter.fields[f], ageBefore.fields[f], f);
  assert.match(run("--set-topics", "year3-age=people,numbers", "--apply"), /Readback passed: 0 assigned/);
  assert.throws(() => execFileSync(process.execPath, ["scripts/migrations/assign-topic-ids.mjs", "--project", project, "--emulator", host, "--backup-dir", backups, "--set-topics", "year3-age=sports"], { cwd: repo, encoding: "utf8", stdio: "pipe" }), /Invalid topics/);

  // Roll back the run that wrote Age (reruns save empty plans).
  const plans = readdirSync(backups).filter((f) => f.endsWith(".plan.json")).sort().filter((f) => readFileSync(path.join(backups, f), "utf8").includes('"target": "numbers,people"'));
  const setTopicsBackup = path.join(backups, plans[plans.length - 1].replace(".plan.json", ".json"));
  assert.match(run("--set-topics", "year3-age=people,numbers", "--rollback", setTopicsBackup, "--apply"), /Rollback complete/);
  assert.deepEqual(await topicIdsOf("year3-age"), ["people"]); assert.equal(await topicOf("year3-age"), "people");
});
