// Pure planning and verification logic for the topicId migration (no network, no Firebase).
// Documents are Firestore REST documents: { name, updateTime, fields }.
import { isValidTopicId, normaliseTopicIds, setTopicIds } from "../../js/topic-taxonomy.js";

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

// ---- Multi-topic (v1.1) ---------------------------------------------------------------------------------
// Every write below sets both fields together: topicIds (all topics, taxonomy order) and topicId (mirror of the
// first, for older readers). `next` holds the target values; null means the field is removed.
const arr = (field) => (field && "arrayValue" in field ? (field.arrayValue.values || []).map(str) : undefined);
const topicsOf = (doc) => setTopicIds({ topicId: str(doc.fields?.topicId), topicIds: arr(doc.fields?.topicIds) });
const nextFor = (topicIds) => (topicIds.length ? { topicIds, topicId: topicIds[0] } : { topicIds: null, topicId: null });
const sameTopics = (doc, next) => JSON.stringify(arr(doc.fields?.topicIds) ?? null) === JSON.stringify(next.topicIds) && (str(doc.fields?.topicId) ?? null) === next.topicId;

// Sets on a retired ID (e.g. greetings) move to its replacement (social-interactions), in topicId and topicIds.
export function planRetiredRename(docs, legacyMap) {
  const actions = docs.map((doc) => {
    const id = docId(doc);
    if (isTombstone(doc)) return { id, action: "tombstone" };
    const rawIds = arr(doc.fields?.topicIds) ?? [];
    const rawId = str(doc.fields?.topicId);
    if (!rawIds.some((t) => legacyMap[t]) && !legacyMap[rawId]) return { id, action: "keep", current: rawId };
    for (const target of Object.values(legacyMap)) if (!isValidTopicId(target)) throw new Error(`Legacy map points at invalid ${target}`);
    const hadArray = arr(doc.fields?.topicIds) !== undefined;
    const mapped = normaliseTopicIds((hadArray ? rawIds : [rawId]).map((t) => legacyMap[t] || t));
    const next = hadArray ? nextFor(mapped) : { topicIds: null, topicId: mapped[0] ?? null };
    return { id, action: "write", current: rawId, target: next.topicId, next, name: doc.name, updateTime: doc.updateTime };
  });
  return { actions, missing: [] };
}

// Give every set that has only the single topicId the matching topicIds array. Nothing else changes.
export function planTopicIdsBackfill(docs) {
  return { missing: [], actions: docs.map((doc) => {
    const id = docId(doc);
    if (isTombstone(doc)) return { id, action: "tombstone" };
    if (arr(doc.fields?.topicIds) !== undefined) return { id, action: "already", current: str(doc.fields?.topicId) };
    const topics = topicsOf(doc);
    if (!topics.length) return { id, action: "unassigned" };
    return { id, action: "write", current: topics[0], target: topics[0], next: nextFor(topics), name: doc.name, updateTime: doc.updateTime };
  }) };
}

// Explicit, owner-approved topic lists, e.g. { "year3-age": ["people", "numbers"] }. Unknown sets or topics stop the plan.
export function planExplicitTopics(docs, wanted) {
  const byId = new Map(docs.map((doc) => [docId(doc), doc]));
  for (const [id, topics] of Object.entries(wanted)) {
    if (!byId.has(id)) throw new Error(`Set not found: ${id}`);
    if (isTombstone(byId.get(id))) throw new Error(`Set is deleted: ${id}`);
    if (!topics.length || topics.some((t) => !isValidTopicId(t))) throw new Error(`Invalid topics for ${id}: ${topics.join(",")}`);
  }
  return { missing: [], actions: docs.map((doc) => {
    const id = docId(doc);
    if (!wanted[id]) return { id, action: "keep" };
    const next = nextFor(normaliseTopicIds(wanted[id]));
    if (sameTopics(doc, next)) return { id, action: "already", current: next.topicIds.join(",") };
    return { id, action: "write", current: topicsOf(doc).join(","), target: next.topicIds.join(","), next, name: doc.name, updateTime: doc.updateTime };
  }) };
}

// After a topic write: nothing added or lost, every field other than topicId/topicIds byte-identical, written sets
// carry exactly `next`, untouched sets keep their topic fields.
export function verifyTopicFields(beforeDocs, afterDocs, plan) {
  const failures = [];
  const after = new Map(afterDocs.map((doc) => [docId(doc), doc]));
  const strip = (fields = {}) => { const copy = { ...fields }; delete copy.topicId; delete copy.topicIds; return copy; };
  if (afterDocs.length !== beforeDocs.length) failures.push(`document count changed: ${beforeDocs.length} -> ${afterDocs.length}`);
  for (const before of beforeDocs) {
    const id = docId(before); const now = after.get(id);
    if (!now) { failures.push(`${id}: missing after migration`); continue; }
    if (stable(strip(before.fields)) !== stable(strip(now.fields))) failures.push(`${id}: fields other than topicId/topicIds changed`);
    const step = plan.actions.find((entry) => entry.id === id);
    if (step?.action === "write") { if (!sameTopics(now, step.next)) failures.push(`${id}: topics are not ${JSON.stringify(step.next)}`); }
    else if (stable({ a: before.fields?.topicId, b: before.fields?.topicIds }) !== stable({ a: now.fields?.topicId, b: now.fields?.topicIds })) failures.push(`${id}: topics changed unexpectedly`);
  }
  return failures;
}

// Undo a saved plan: restore the backup's topicId/topicIds only where the set still carries what the plan wrote.
export function planTopicFieldsRollback(backupDocs, currentDocs, plan) {
  const backup = new Map(backupDocs.map((doc) => [docId(doc), doc]));
  const current = new Map(currentDocs.map((doc) => [docId(doc), doc]));
  return plan.actions.filter((step) => step.action === "write").map((step) => {
    const now = current.get(step.id); const before = backup.get(step.id);
    if (!now || !before) return { id: step.id, action: "missing" };
    if (!sameTopics(now, step.next)) return { id: step.id, action: "keep-changed" };
    return { id: step.id, action: "restore", name: now.name, updateTime: now.updateTime,
      next: { topicIds: arr(before.fields?.topicIds) ?? null, topicId: str(before.fields?.topicId) ?? null } };
  });
}
