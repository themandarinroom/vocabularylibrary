#!/usr/bin/env node
// Assigns the approved topicId to existing vocabulary sets. Idempotent and reversible.
//
//   node scripts/migrations/assign-topic-ids.mjs --project <id> [--emulator 127.0.0.1:8080]
//        [--apply] [--confirm-production] [--backup-dir <dir>]
//   node scripts/migrations/assign-topic-ids.mjs --project <id> --rollback <backup.json> [--apply] ...
//   Add --rename-retired to move sets off retired topic IDs instead (v1.1: greetings -> social-interactions),
//   with --rollback restoring the retired ID where the set still carries its replacement.
//
// Safety:
//   - Dry run unless --apply. The Production project also needs --confirm-production.
//   - Before any write, every vocabularySets document is backed up to JSON.
//   - Each write is a field-masked commit of topicId only, with an updateTime precondition, so
//     items, covers, audio, published and every other field cannot change, and a document
//     edited in the meantime is refused rather than overwritten.
//   - After apply, every document is read back and compared with the backup.
//   - Sets not in topic-assignments.json, or with a different topic already, are only reported.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { planMigration, verifyMigration, planRollback, planRetiredRename, planRetiredRenameRollback, docId } from "./topic-migration-core.mjs";
import { LEGACY_TOPIC_IDS } from "../../js/topic-taxonomy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTION = "the-mandarin-room";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };

const project = option("--project");
const emulator = option("--emulator");
const apply = flag("--apply");
const rollbackFile = option("--rollback");
const renameRetired = flag("--rename-retired");
const backupDir = path.resolve(option("--backup-dir") || path.join(here, "backups"));
if (!project || !/^[a-z0-9-]+$/.test(project)) throw new Error("Pass --project <firebase-project-id>.");
if (emulator && !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error("--emulator must be 127.0.0.1:<port> or localhost:<port>.");
if (!emulator && project === PRODUCTION && apply && !flag("--confirm-production")) throw new Error("Refusing to write to Production without --confirm-production.");

const { assignments } = JSON.parse(fs.readFileSync(path.join(here, "topic-assignments.json"), "utf8"));
const root = emulator ? `http://${emulator}/v1` : "https://firestore.googleapis.com/v1";
const collection = `${root}/projects/${project}/databases/(default)/documents/vocabularySets`;

async function accessToken() {
  if (emulator) return "owner"; // emulator admin bypass; never sent to a real project
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const require = createRequire("/opt/homebrew/lib/node_modules/firebase-tools/lib/");
  const { requireAuth } = require("./requireAuth.js");
  const { getAccessToken } = require("./apiv2.js");
  const { configstore } = require("./configstore.js");
  await requireAuth({ user: configstore.get("user"), tokens: configstore.get("tokens") });
  return getAccessToken();
}
const token = await accessToken();
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
async function listAll() {
  const docs = []; let pageToken = "";
  do {
    const page = await request(`${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    docs.push(...(page.documents || [])); pageToken = page.nextPageToken || "";
  } while (pageToken);
  return docs.sort((a, b) => docId(a).localeCompare(docId(b)));
}
const commitUrl = `${root}/projects/${project}/databases/(default)/documents:commit`;
// One atomic write per set: only topicId (updateMask), and only if the set is unchanged since the backup (updateTime).
// A topicId absent from fields with the mask set removes the field (rollback).
const writeTopic = (doc, topicId) => request(commitUrl, { method: "POST", body: JSON.stringify({ writes: [{
  update: { name: doc.name, fields: topicId ? { topicId: { stringValue: topicId } } : {} },
  updateMask: { fieldPaths: ["topicId"] },
  currentDocument: { updateTime: doc.updateTime }
}] }) });

const before = await listAll();
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `vocabularySets-${project}${emulator ? "-emulator" : ""}-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify({ project, emulator: emulator || null, takenAt: new Date().toISOString(), documents: before }, null, 2));
console.log(`Backup of ${before.length} documents: ${backupPath}`);

if (rollbackFile) {
  const backup = JSON.parse(fs.readFileSync(path.resolve(rollbackFile), "utf8"));
  if (backup.project !== project) throw new Error(`Backup is for ${backup.project}, not ${project}.`);
  const steps = renameRetired ? planRetiredRenameRollback(backup.documents, before, LEGACY_TOPIC_IDS) : planRollback(backup.documents, before, assignments);
  console.table(steps.map(({ id, action, current, value }) => ({ id, action, current: current ?? "", restore: value ?? "" })));
  if (!apply) { console.log("Dry run: nothing written. Add --apply to undo."); process.exit(0); }
  for (const step of steps.filter((entry) => entry.action === "remove" || entry.action === "restore")) {
    await writeTopic(step, step.action === "restore" ? step.value : null);
    console.log(`${step.action === "restore" ? `restored ${step.value}` : "removed topicId"}: ${step.id}`);
  }
  const after = await listAll();
  const left = after.filter((doc) => steps.some((step) => step.id === docId(doc) && ((step.action === "remove" && doc.fields?.topicId) || (step.action === "restore" && doc.fields?.topicId?.stringValue !== step.value))));
  if (left.length) throw new Error(`Rollback incomplete: ${left.map(docId).join(", ")}`);
  console.log("Rollback complete.");
  process.exit(0);
}

const plan = renameRetired ? planRetiredRename(before, LEGACY_TOPIC_IDS) : planMigration(before, assignments);
console.table(plan.actions.map(({ id, action, current, target }) => ({ id, action, current: current ?? "", target: target ?? "" })));
if (plan.missing.length) console.log(`Approved IDs not found (nothing done): ${plan.missing.join(", ")}`);
const toAssign = plan.actions.filter((entry) => entry.action === "assign");
const review = plan.actions.filter((entry) => entry.action === "conflict" || entry.action === "unmapped");
if (review.length) console.log(`Needs a proposal before migration (left unchanged): ${review.map((entry) => `${entry.id} (${entry.action})`).join(", ")}`);
if (!apply) { console.log(`Dry run: ${toAssign.length} set(s) would be assigned. Nothing written.`); process.exit(0); }

for (const step of toAssign) {
  await writeTopic(step, step.target);
  console.log(`assigned ${step.id} -> ${step.target}`);
}
const after = await listAll();
const failures = verifyMigration(before, after, plan);
fs.writeFileSync(backupPath.replace(/\.json$/, ".after.json"), JSON.stringify({ project, documents: after, failures }, null, 2));
if (failures.length) { console.error("Readback FAILED:\n" + failures.join("\n")); process.exit(1); }
console.log(`Readback passed: ${toAssign.length} assigned, all other fields unchanged. Rollback: --rollback ${backupPath}`);
