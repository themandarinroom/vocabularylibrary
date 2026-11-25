// node --test tests/vocabulary-import.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { topicFieldsFor, checkSetTopics, TopicFieldError } from "../scripts/vocabulary-import/topic-fields.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("topicFieldsFor builds topicIds (canonical order) and the topicId mirror from one or more topic IDs", () => {
  assert.deepEqual(topicFieldsFor("free-time"), { topicIds: ["free-time"], topicId: "free-time" });
  assert.deepEqual(topicFieldsFor(["people", "numbers"]), { topicIds: ["numbers", "people"], topicId: "numbers" });
  assert.deepEqual(topicFieldsFor(["community", "nature", "social-interactions"]), { topicIds: ["social-interactions", "nature", "community"], topicId: "social-interactions" });
});

test("topicFieldsFor refuses missing, unknown, retired and duplicate topics instead of guessing", () => {
  for (const bad of [undefined, null, "", [], ["sports"], ["Nature"], ["greetings"], ["food"], ["people", "people"], [5]]) assert.throws(() => topicFieldsFor(bad), TopicFieldError, JSON.stringify(bad));
  assert.throws(() => topicFieldsFor(["greetings"]), /retired; use social-interactions/);
  assert.throws(() => topicFieldsFor(["nature", "nature"]), /listed twice/);
});

test("checkSetTopics accepts a correctly prepared set.json and explains every problem otherwise", () => {
  assert.deepEqual(checkSetTopics({ topicIds: ["numbers", "people"], topicId: "numbers" }), []);
  assert.match(checkSetTopics({ topicId: "numbers" }).join(), /topicIds \(array\) is missing/);
  assert.match(checkSetTopics({ topicIds: ["people", "numbers"], topicId: "people" }).join(), /canonical order/);
  assert.match(checkSetTopics({ topicIds: ["numbers", "people"], topicId: "people" }).join(), /topicId must equal topicIds\[0\]/);
  assert.match(checkSetTopics({ topicIds: ["greetings"], topicId: "greetings" }).join(), /retired/);
});

test("check-set.mjs passes a valid set.json and fails an invalid one (exit code 1)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "check-set-"));
  const good = path.join(dir, "good.json"); const bad = path.join(dir, "bad.json");
  writeFileSync(good, JSON.stringify({ id: "year4-plants-i", yearLevel: 4, topicIds: ["nature"], topicId: "nature", items: [] }));
  writeFileSync(bad, JSON.stringify({ id: "year2-greetings-ii", yearLevel: 2, topicId: "greetings", items: [] }));
  assert.match(execFileSync(process.execPath, ["scripts/vocabulary-import/check-set.mjs", good], { cwd: repo, encoding: "utf8" }), /✔ year4-plants-i: topics nature/);
  assert.throws(() => execFileSync(process.execPath, ["scripts/vocabulary-import/check-set.mjs", bad], { cwd: repo, encoding: "utf8", stdio: "pipe" }), (error) => error.status === 1 && /topicIds \(array\) is missing/.test(error.stderr));
});
