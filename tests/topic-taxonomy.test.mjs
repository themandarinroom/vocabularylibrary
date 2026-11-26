// node --test tests/topic-taxonomy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOPIC_TAXONOMY, TOPIC_IDS, LEGACY_TOPIC_IDS, isValidTopicId, resolveTopic, normaliseTopicIds, setTopicIds } from "../js/topic-taxonomy.js";
import { publicVocabularySet, saveSet, TOPIC_REQUIRED_MESSAGE } from "../js/vocabulary-store.js";
import { planMigration, verifyMigration, planRollback, planRetiredRename, planTopicIdsBackfill, planExplicitTopics, verifyTopicFields, planTopicFieldsRollback } from "../scripts/migrations/topic-migration-core.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("the taxonomy is exactly the 13 approved topics (v1.1), in order, with stable IDs and labels", () => {
  assert.deepEqual(TOPIC_TAXONOMY.map((t) => [t.id, t.titleEn, t.titleZh]), [
    ["numbers", "Numbers", "数字"], ["colours", "Colours", "颜色"], ["people", "People", "人物"], ["animals", "Animals", "动物"],
    ["social-interactions", "Social Interactions", "社交"], ["food-drinks", "Food & Drinks", "餐饮"], ["school", "School", "学校"],
    ["free-time", "Free Time", "休闲活动"], ["countries", "Countries", "国家"], ["time-weather", "Time & Weather", "时间与天气"], ["culture", "Culture", "文化"],
    ["nature", "Nature", "自然"], ["community", "Community", "社区"]
  ]);
  assert.deepEqual(TOPIC_TAXONOMY.map((t) => t.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(new Set(TOPIC_IDS).size, 13);
  assert(Object.isFrozen(TOPIC_TAXONOMY) && TOPIC_TAXONOMY.every(Object.isFrozen));
  for (const removed of ["greetings", "family", "body-parts", "food", "weather", "time", "sports", "australia", "calendar", "self-introduction"]) assert.equal(isValidTopicId(removed), false, removed);
});

test("legacy IDs map only to approved topics and are never valid topicIds themselves", () => {
  assert.deepEqual(LEGACY_TOPIC_IDS, { family: "people", "body-parts": "people", food: "food-drinks", weather: "time-weather", time: "time-weather", greetings: "social-interactions" });
  for (const [legacy, next] of Object.entries(LEGACY_TOPIC_IDS)) { assert(isValidTopicId(next)); assert(!isValidTopicId(legacy)); }
});

test("resolveTopic accepts an ID or an exact English/Chinese label and never invents a topic", () => {
  assert.equal(resolveTopic("Free Time").id, "free-time");
  assert.equal(resolveTopic("time & weather").id, "time-weather");
  assert.equal(resolveTopic("餐饮").id, "food-drinks");
  assert.equal(resolveTopic("食物与饮料"), null, "retired label");
  assert.equal(resolveTopic("Social Interactions").id, "social-interactions");
  assert.equal(resolveTopic("社区").id, "community");
  assert.equal(resolveTopic("Nature").id, "nature");
  assert.equal(resolveTopic("Greetings"), null, "Greetings is no longer a topic");
  assert.equal(resolveTopic("free-time").id, "free-time");
  for (const unknown of ["Hobbies", "Sports", "Weather", "", null, 7]) assert.equal(resolveTopic(unknown), null, String(unknown));
});

test("Firestore rules list exactly the canonical topic IDs", () => {
  const rules = read("firestore.rules");
  const list = rules.match(/function validTopicId\(value\) \{ return value is string && value in \[([^\]]+)\]/);
  assert(list, "validTopicId() not found in firestore.rules");
  assert.deepEqual(list[1].split(",").map((s) => s.trim().replace(/'/g, "")), TOPIC_IDS);
  assert.match(rules, /'coverImageGenerated', 'topicId', 'topicIds', 'items'/);
  assert.match(rules, /function validTopicIds\(value\) \{ return value is list && value\.size\(\) <= 13 && value\.hasOnly\(\[([^\]]+)\]\)/);
  assert.deepEqual(rules.match(/value\.hasOnly\(\[([^\]]+)\]\)/)[1].split(",").map((x) => x.trim().replace(/'/g, "")), TOPIC_IDS);
  assert(rules.includes("(!resource.data.keys().hasAny(['topicId', 'topicIds']) || request.resource.data.keys().hasAny(['topicIds']) || (!resource.data.keys().hasAny(['topicIds']) && request.resource.data.keys().hasAny(['topicId'])))"), "updates must not drop existing topics");
  assert(rules.includes("(!data.keys().hasAll(['topicId', 'topicIds']) || data.topicIds.hasAny([data.topicId]))"), "topicId must be one of topicIds");
});

test("the store keeps topicIds (and the topicId mirror), reads legacy topicId, and refuses to save without a topic", async () => {
  const base = { id: "year5-hobbies-i", yearLevel: 5, title: "Hobbies I", items: [] };
  assert.deepEqual(publicVocabularySet({ ...base, topicId: "free-time" }).topicIds, ["free-time"], "legacy single topic is read as a one-item list");
  const multi = publicVocabularySet({ ...base, topicIds: ["people", "numbers", "people", "sports"] });
  assert.deepEqual(multi.topicIds, ["numbers", "people"], "deduplicated, canonical order, invalid IDs dropped");
  assert.equal(multi.topicId, "numbers", "topicId mirrors the first topic for older readers");
  assert.deepEqual(publicVocabularySet({ ...base, topicIds: ["people"], topicId: "animals" }).topicIds, ["people"], "topicIds wins over a stale topicId");
  assert.equal("topicIds" in publicVocabularySet(base), false, "legacy sets stay unassigned");
  assert.equal("topicId" in publicVocabularySet({ ...base, topicId: "sports" }), false);
  for (const topicIds of [undefined, [], ["sports"], ["people", "people"], ["Free Time"], "people"]) await assert.rejects(saveSet({ ...base, topicIds }), { message: TOPIC_REQUIRED_MESSAGE });
});

test("the editor offers the 13 topics as checkboxes, stores their IDs as topicIds and requires one before every save path", () => {
  const html = read("editor.html");
  const js = read("js/editor.js");
  assert.match(html, /<label>Year level<select id="year-level"[^]*?<fieldset id="topics" class="topic-choices"[^>]*><legend>Topics \*<\/legend>/);
  assert.doesNotMatch(html, /<select id="topic"/, "the single-topic dropdown is gone");
  assert.match(js, /TOPIC_TAXONOMY\.map\(\(topic\) => `<label class="topic-choice"><input type="checkbox" name="topic" value="\$\{topic\.id\}">/);
  assert.match(js, /topicIds: chosenTopicIds\(\)/);
  assert.match(js, /showTopics\(existing, \{ legacy: true \}\)/);
  assert.match(js, /showTopics\(duplicateSource\)/);
  assert.equal((js.match(/requireTopic\(/g) || []).length, 4, "definition + set save + cover accept + approved images");
  assert.doesNotMatch(js, /checked = true/, "no silent default topic");
  assert.match(html, /js\/editor\.js\?v=topics-3/);
});

test("the editor does not touch audio playback", () => {
  assert.doesNotMatch(read("js/editor.js"), /audio\.js|speechSynthesis/);
});

const doc = (id, fields, updateTime = "2026-11-24T00:00:00.000000Z") => ({ name: `projects/p/databases/(default)/documents/vocabularySets/${id}`, updateTime, fields: { id: { stringValue: id }, published: { booleanValue: true }, ...fields } });
const assignments = JSON.parse(read("scripts/migrations/topic-assignments.json")).assignments;

test("approved assignments cover the 22 audited Production sets with valid topics", () => {
  assert.equal(Object.keys(assignments).length, 22);
  assert(Object.values(assignments).every(isValidTopicId));
  assert.equal(assignments["year3-age"], "people");
  assert.equal(assignments["year4-australian-states"], "countries");
  assert.equal(assignments["year5-sports-ii"], "free-time");
  assert.equal(assignments["year4-twelve-months"], "time-weather");
});

test("migration plan assigns, skips, reports and never guesses", () => {
  const docs = [
    doc("year1-pets", {}),
    doc("year3-age", { topicId: { stringValue: "people" } }),
    doc("year2-family", { topicId: { stringValue: "animals" } }),
    doc("year1-testing", {}),
    doc("year2-gone", { deleted: { booleanValue: true } })
  ];
  const plan = planMigration(docs, assignments);
  assert.deepEqual(plan.actions.map((a) => [a.id, a.action]), [["year1-pets", "assign"], ["year3-age", "already"], ["year2-family", "conflict"], ["year1-testing", "unmapped"], ["year2-gone", "tombstone"]]);
  assert.equal(plan.actions[0].target, "animals");
  assert.equal(plan.missing.length, 19);
  assert.throws(() => planMigration(docs, { "year1-pets": "pets" }), /Invalid assignments/);
});

test("migration verification catches any change other than the approved topicId", () => {
  const before = [doc("year1-pets", { title: { stringValue: "Pets I" } }), doc("year1-testing", {})];
  const plan = planMigration(before, assignments);
  const good = [doc("year1-pets", { title: { stringValue: "Pets I" }, topicId: { stringValue: "animals" } }), doc("year1-testing", {})];
  assert.deepEqual(verifyMigration(before, good, plan), []);
  const retitled = [doc("year1-pets", { title: { stringValue: "Pets" }, topicId: { stringValue: "animals" } }), doc("year1-testing", {})];
  assert.match(verifyMigration(before, retitled, plan).join(), /fields other than topicId changed/);
  assert.match(verifyMigration(before, [good[0]], plan).join(), /count changed/);
  assert.match(verifyMigration(before, [before[0], good[1]], plan).join(), /topicId is undefined, expected animals/);
});

test("rollback removes only the topicIds the migration added", () => {
  const backup = [doc("year1-pets", {}), doc("year3-age", {}), doc("year2-family", { topicId: { stringValue: "people" } })];
  const current = [doc("year1-pets", { topicId: { stringValue: "animals" } }), doc("year3-age", { topicId: { stringValue: "school" } }), doc("year2-family", { topicId: { stringValue: "people" } })];
  assert.deepEqual(planRollback(backup, current, assignments).map((s) => [s.id, s.action]), [["year1-pets", "remove"], ["year3-age", "keep-changed"]]);
});

test("v1.1 rename: sets on a retired ID move to its replacement in topicId and topicIds; others are untouched", () => {
  const docs = [doc("year2-how-are-you", { topicId: { stringValue: "greetings" } }), doc("year2-multi", { topicId: { stringValue: "greetings" }, topicIds: { arrayValue: { values: [{ stringValue: "greetings" }, { stringValue: "people" }] } } }), doc("year1-pets", { topicId: { stringValue: "animals" } }), doc("year1-legacy", {}), doc("year2-gone", { deleted: { booleanValue: true }, topicId: { stringValue: "greetings" } })];
  const plan = planRetiredRename(docs, LEGACY_TOPIC_IDS);
  assert.deepEqual(plan.actions.map((a) => [a.id, a.action, a.next ?? null]), [["year2-how-are-you", "write", { topicIds: null, topicId: "social-interactions" }], ["year2-multi", "write", { topicIds: ["people", "social-interactions"], topicId: "people" }], ["year1-pets", "keep", null], ["year1-legacy", "keep", null], ["year2-gone", "tombstone", null]]);
});

const ids = (...list) => ({ arrayValue: { values: list.map((stringValue) => ({ stringValue })) } });
test("multi-topic backfill: single-topic sets get topicIds [topicId]; existing arrays, unassigned sets and tombstones are left alone", () => {
  const docs = [doc("year3-age", { topicId: { stringValue: "people" } }), doc("year3-multi", { topicId: { stringValue: "numbers" }, topicIds: ids("numbers", "people") }), doc("year1-none", {}), doc("year2-gone", { deleted: { booleanValue: true } })];
  const plan = planTopicIdsBackfill(docs);
  assert.deepEqual(plan.actions.map((a) => [a.id, a.action, a.next ?? null]), [["year3-age", "write", { topicIds: ["people"], topicId: "people" }], ["year3-multi", "already", null], ["year1-none", "unassigned", null], ["year2-gone", "tombstone", null]]);
  const after = [doc("year3-age", { topicId: { stringValue: "people" }, topicIds: ids("people") }), docs[1], docs[2], docs[3]];
  assert.deepEqual(verifyTopicFields(docs, after, plan), []);
  const tampered = [doc("year3-age", { topicId: { stringValue: "people" }, topicIds: ids("people"), title: { stringValue: "x" } }), docs[1], docs[2], docs[3]];
  assert.match(verifyTopicFields(docs, tampered, plan).join(), /fields other than topicId\/topicIds changed/);
});

test("explicit topics (Age -> Numbers + People): canonical order, refuses unknown sets/topics, rollback restores only untouched results", () => {
  const docs = [doc("year3-age", { topicId: { stringValue: "people" }, topicIds: ids("people") }), doc("year1-pets", { topicId: { stringValue: "animals" } })];
  const plan = planExplicitTopics(docs, { "year3-age": ["people", "numbers"] });
  assert.deepEqual(plan.actions.map((a) => [a.id, a.action, a.next ?? null]), [["year3-age", "write", { topicIds: ["numbers", "people"], topicId: "numbers" }], ["year1-pets", "keep", null]]);
  assert.throws(() => planExplicitTopics(docs, { "year9-none": ["people"] }), /Set not found/);
  assert.throws(() => planExplicitTopics(docs, { "year3-age": ["sports"] }), /Invalid topics/);
  const after = [doc("year3-age", { topicId: { stringValue: "numbers" }, topicIds: ids("numbers", "people") }), docs[1]];
  assert.deepEqual(planTopicFieldsRollback(docs, after, plan).map((s) => [s.id, s.action, s.next ?? null]), [["year3-age", "restore", { topicIds: ["people"], topicId: "people" }]]);
  const editedSince = [doc("year3-age", { topicId: { stringValue: "people" }, topicIds: ids("people", "school") }), docs[1]];
  assert.deepEqual(planTopicFieldsRollback(docs, editedSince, plan).map((s) => s.action), ["keep-changed"]);
});

test("multi-topic helpers: setTopicIds prefers topicIds; normaliseTopicIds keeps valid, unique, canonical order", () => {
  assert.deepEqual(setTopicIds({ topicId: "people" }), ["people"]);
  assert.deepEqual(setTopicIds({ topicId: "animals", topicIds: ["people", "numbers"] }), ["numbers", "people"]);
  assert.deepEqual(setTopicIds({ topicIds: [] }), []);
  assert.deepEqual(setTopicIds({}), []);
  assert.deepEqual(normaliseTopicIds(["community", "greetings", "numbers", "community"]), ["numbers", "community"]);
});
