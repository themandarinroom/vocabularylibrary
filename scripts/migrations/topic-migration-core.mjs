// Pure planning and verification logic for the topicId migration (no network, no Firebase).
// Documents are Firestore REST documents: { name, updateTime, fields }.
import { isValidTopicId } from "../../js/topic-taxonomy.js";

export const docId = (doc) => doc.name.split("/").pop();
const str = (field) => (field && "stringValue" in field ? field.stringValue : undefined);
const isTombstone = (doc) => doc.fields?.deleted?.booleanValue === true;

export function validateAssignments(assignments) {
  const problems = Object.entries(assignments).filter(([id, topicId]) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || !isValidTopicId(topicId));
  if (problems.length) throw new Error(`Invalid assignments: ${problems.map(([id, topic]) => `${id} -> ${topic}`).join(", ")}`);
  return assignments;
}

// Every document gets exactly one action; nothing is guessed.
//   assign       mapped set without a topic: write topicId
//   already      mapped set that already has the approved topic: skip (makes reruns safe)
//   conflict     mapped set with a different topic: never overwritten, reported for review
//   unmapped     set not in the approved list: left unassigned, reported for a proposal
//   tombstone    deleted set: untouched
// and every approved ID that does not exist is reported as "missing".
export function planMigration(docs, assignments) {
  validateAssignments(assignments);
  const actions = docs.map((doc) => {
    const id = docId(doc);
    const current = str(doc.fields?.topicId);
    const target = assignments[id];
    if (isTombstone(doc)) return { id, action: "tombstone", current };
    if (!target) return { id, action: "unmapped", current };
    if (current === target) return { id, action: "already", current, target };
    if (current !== undefined) return { id, action: "conflict", current, target };
    return { id, action: "assign", target, updateTime: doc.updateTime, name: doc.name };
  });
  const present = new Set(docs.map(docId));
  const missing = Object.keys(assignments).filter((id) => !present.has(id));
  return { actions, missing };
}

const withoutTopic = (fields = {}) => { const copy = { ...fields }; delete copy.topicId; return copy; };
const stable = (value) => JSON.stringify(value, (key, inner) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b))) : inner));

// After apply: no document may be added or lost, every field other than topicId must be
// byte-identical to the backup, and each assigned set must now carry its approved topic.
export function verifyMigration(beforeDocs, afterDocs, plan) {
  const failures = [];
  const after = new Map(afterDocs.map((doc) => [docId(doc), doc]));
  if (afterDocs.length !== beforeDocs.length) failures.push(`document count changed: ${beforeDocs.length} -> ${afterDocs.length}`);
  for (const before of beforeDocs) {
    const id = docId(before);
    const now = after.get(id);
    if (!now) { failures.push(`${id}: missing after migration`); continue; }
    if (stable(withoutTopic(before.fields)) !== stable(withoutTopic(now.fields))) failures.push(`${id}: fields other than topicId changed`);
    const action = plan.actions.find((entry) => entry.id === id);
    const expectedTopic = action?.action === "assign" ? action.target : str(before.fields?.topicId);
    if (str(now.fields?.topicId) !== expectedTopic) failures.push(`${id}: topicId is ${str(now.fields?.topicId)}, expected ${expectedTopic}`);
  }
  return failures;
}

// Rollback removes only the topicIds this migration added: sets that had no topicId in the
// backup and still carry exactly the approved value. Anything a teacher changed since is kept.
export function planRollback(backupDocs, currentDocs, assignments) {
  const backup = new Map(backupDocs.map((doc) => [docId(doc), doc]));
  return currentDocs.flatMap((doc) => {
    const id = docId(doc);
    const before = backup.get(id);
    const current = str(doc.fields?.topicId);
    if (!before || str(before.fields?.topicId) !== undefined) return [];
    if (current === undefined) return [];
    if (current !== assignments[id]) return [{ id, action: "keep-changed", current }];
    return [{ id, action: "remove", name: doc.name, updateTime: doc.updateTime }];
  });
}

// v1.1: sets whose topicId is a retired ID (e.g. greetings) move to its replacement (social-interactions).
// Every other set is untouched. The result has the same shape as planMigration, so verifyMigration applies.
export function planRetiredRename(docs, legacyMap) {
  const actions = docs.map((doc) => {
    const id = docId(doc);
    const current = str(doc.fields?.topicId);
    if (isTombstone(doc)) return { id, action: "tombstone", current };
    const target = legacyMap[current];
    if (current !== undefined && target) {
      if (!isValidTopicId(target)) throw new Error(`Legacy map points ${current} at invalid ${target}`);
      return { id, action: "assign", current, target, updateTime: doc.updateTime, name: doc.name };
    }
    return { id, action: "keep", current };
  });
  return { actions, missing: [] };
}

// Undo planRetiredRename: put the retired ID back only where the set still carries the replacement it was given.
export function planRetiredRenameRollback(backupDocs, currentDocs, legacyMap) {
  const backup = new Map(backupDocs.map((doc) => [docId(doc), doc]));
  return currentDocs.flatMap((doc) => {
    const id = docId(doc);
    const before = backup.get(id);
    const was = str(before?.fields?.topicId);
    const now = str(doc.fields?.topicId);
    if (!before || isTombstone(before) || !was || !legacyMap[was]) return []; // the rename never touches tombstones
    if (now !== legacyMap[was]) return [{ id, action: "keep-changed", current: now }];
    return [{ id, action: "restore", value: was, name: doc.name, updateTime: doc.updateTime }];
  });
}
