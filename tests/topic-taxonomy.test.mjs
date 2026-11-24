// node --test tests/topic-taxonomy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOPIC_TAXONOMY, TOPIC_IDS, LEGACY_TOPIC_IDS, isValidTopicId, resolveTopic } from "../js/topic-taxonomy.js";
import { publicVocabularySet, saveSet, TOPIC_REQUIRED_MESSAGE } from "../js/vocabulary-store.js";
import { planMigration, verifyMigration, planRollback } from "../scripts/migrations/topic-migration-core.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("the taxonomy is exactly the 11 approved topics, in order, with stable IDs and labels", () => {
  assert.deepEqual(TOPIC_TAXONOMY.map((t) => [t.id, t.titleEn, t.titleZh]), [
    ["numbers", "Numbers", "数字"], ["colours", "Colours", "颜色"], ["people", "People", "人物"], ["animals", "Animals", "动物"],
    ["greetings", "Greetings", "问候"], ["food-drinks", "Food & Drinks", "食物与饮料"], ["school", "School", "学校"],
    ["free-time", "Free Time", "休闲活动"], ["countries", "Countries", "国家"], ["time-weather", "Time & Weather", "时间与天气"], ["culture", "Culture", "文化"]
  ]);
  assert.deepEqual(TOPIC_TAXONOMY.map((t) => t.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(new Set(TOPIC_IDS).size, 11);
  assert(Object.isFrozen(TOPIC_TAXONOMY) && TOPIC_TAXONOMY.every(Object.isFrozen));
  for (const removed of ["family", "body-parts", "food", "weather", "time", "sports", "australia", "calendar", "self-introduction"]) assert.equal(isValidTopicId(removed), false, removed);
});

test("legacy IDs map only to approved topics and are never valid topicIds themselves", () => {
  assert.deepEqual(LEGACY_TOPIC_IDS, { family: "people", "body-parts": "people", food: "food-drinks", weather: "time-weather", time: "time-weather" });
  for (const [legacy, next] of Object.entries(LEGACY_TOPIC_IDS)) { assert(isValidTopicId(next)); assert(!isValidTopicId(legacy)); }
});

test("resolveTopic accepts an ID or an exact English/Chinese label and never invents a topic", () => {
  assert.equal(resolveTopic("Free Time").id, "free-time");
  assert.equal(resolveTopic("time & weather").id, "time-weather");
  assert.equal(resolveTopic("食物与饮料").id, "food-drinks");
  assert.equal(resolveTopic("free-time").id, "free-time");
  for (const unknown of ["Hobbies", "Sports", "Weather", "", null, 7]) assert.equal(resolveTopic(unknown), null, String(unknown));
});

test("Firestore rules list exactly the canonical topic IDs", () => {
  const rules = read("firestore.rules");
  const list = rules.match(/function validTopicId\(value\) \{ return value is string && value in \[([^\]]+)\]/);
  assert(list, "validTopicId() not found in firestore.rules");
  assert.deepEqual(list[1].split(",").map((s) => s.trim().replace(/'/g, "")), TOPIC_IDS);
  assert.match(rules, /'coverImageGenerated', 'topicId', 'items'/);
  assert.match(rules, /!resource\.data\.keys\(\)\.hasAny\(\['topicId'\]\) \|\| request\.resource\.data\.keys\(\)\.hasAny\(\['topicId'\]\)/, "updates must not drop an existing topicId");
});

test("the store keeps a valid topicId, drops an invalid one and refuses to save without one", async () => {
  const base = { id: "year5-hobbies-i", yearLevel: 5, title: "Hobbies I", items: [] };
  assert.equal(publicVocabularySet({ ...base, topicId: "free-time" }).topicId, "free-time");
  assert.equal("topicId" in publicVocabularySet(base), false, "legacy sets stay unassigned");
  assert.equal("topicId" in publicVocabularySet({ ...base, topicId: "sports" }), false);
  for (const topicId of [undefined, "", "Free Time", "sports"]) await assert.rejects(saveSet({ ...base, topicId }), { message: TOPIC_REQUIRED_MESSAGE });
});

test("the editor offers the taxonomy beside Year level, stores the ID and requires it before every save path", () => {
  const html = read("editor.html");
  const js = read("js/editor.js");
  assert.match(html, /<label>Year level<select id="year-level"[^]*?<\/label>\s*<label for="topic">Topic \*<select id="topic" required[^>]*><option value="">Choose a topic…<\/option><\/select>/);
  assert.match(js, /TOPIC_TAXONOMY\.map\(\(topic\) => `<option value="\$\{topic\.id\}">/);
  assert.match(js, /topicId: \$\("#topic"\)\.value/);
  assert.match(js, /showTopic\(existing\.topicId, \{ legacy: true \}\)/);
  assert.match(js, /showTopic\(duplicateSource\.topicId\)/);
  assert.equal((js.match(/requireTopic\(/g) || []).length, 4, "definition + set save + cover accept + approved images");
  assert.doesNotMatch(js, /topicId: "(numbers|colours|people|animals)"/, "no silent default topic");
  assert.match(html, /js\/editor\.js\?v=topics-1/);
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
