#!/usr/bin/env node
// Pre-import check for a prepared vocabulary set document (read-only; writes nothing).
//   node scripts/vocabulary-import/check-set.mjs path/to/set.json [--project the-mandarin-room]
// Checks the topic fields (topicFieldsFor rules) and the stable ID. With --project it also confirms, by an
// anonymous read, that no published set already uses this ID, so the new set appears exactly once.
import fs from "node:fs";
import { checkSetTopics } from "./topic-fields.mjs";

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error("Usage: check-set.mjs <set.json> [--project <id>]"); process.exit(2); }
const project = rest.includes("--project") ? rest[rest.indexOf("--project") + 1] || null : null;
const set = JSON.parse(fs.readFileSync(file, "utf8"));
const problems = checkSetTopics(set);
if (typeof set.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(set.id)) problems.push("id must be a stable lowercase ID such as year4-plants-i");
if (!Number.isInteger(set.yearLevel) || set.yearLevel < 0 || set.yearLevel > 6) problems.push("yearLevel must be 0 (Prep) to 6");
if (project && !problems.length) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/vocabularySets/${set.id}`);
  if (response.status === 200) problems.push(`${set.id} already exists on ${project}; choose a new ID or edit the existing set`);
  else if (response.status !== 404) problems.push(`could not check ${project} (${response.status})`);
}
if (problems.length) { console.error(`✖ ${file}\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`✔ ${set.id}: topics ${set.topicIds.join(", ")}${project ? `; ID free on ${project}` : ""}`);
