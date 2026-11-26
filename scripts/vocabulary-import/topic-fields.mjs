// Shared topic handling for every vocabulary import (Topics v1.1, released 25 Nov 2026).
//
// Production schema (vocabularySets/{id}):
//   topicIds: ["numbers", "people"]   one or more canonical topic IDs, no duplicates, canonical order
//   topicId:  "numbers"               legacy mirror of topicIds[0], kept for older readers (see docs/TOPICS.md)
//
// Every import script must build these two fields with topicFieldsFor() (or check a prepared set.json with
// check-set.mjs) instead of writing topic fields by hand. Firestore rules apply to the editor only; Admin/REST
// imports bypass them, so this validation is the only guard for scripted writes.
import { TOPIC_IDS, LEGACY_TOPIC_IDS, isValidTopicId } from "../../js/topic-taxonomy.js";

export class TopicFieldError extends Error {}

// Accepts the requested topics as an array of IDs (preferred) or a single ID, as written in a task's
// "Topic IDs:" metadata. Refuses empty lists, unknown or retired IDs and duplicates instead of guessing.
export function topicFieldsFor(requested) {
  const list = Array.isArray(requested) ? requested : requested === undefined || requested === null || requested === "" ? [] : [requested];
  if (!list.length) throw new TopicFieldError("At least one topic ID is required (Topic IDs: ...).");
  const problems = [];
  for (const id of list) {
    if (typeof id !== "string") problems.push(`${JSON.stringify(id)} is not a topic ID`);
    else if (LEGACY_TOPIC_IDS[id]) problems.push(`${id} is retired; use ${LEGACY_TOPIC_IDS[id]}`);
    else if (!isValidTopicId(id)) problems.push(`${id} is not one of the 13 topics (${TOPIC_IDS.join(", ")})`);
  }
  const seen = new Set();
  for (const id of list) { if (seen.has(id)) problems.push(`${id} is listed twice`); seen.add(id); }
  if (problems.length) throw new TopicFieldError(`Invalid topics: ${problems.join("; ")}. Ask the owner; never invent a topic.`);
  const topicIds = TOPIC_IDS.filter((id) => seen.has(id));
  return { topicIds, topicId: topicIds[0] };
}

// Checks a prepared set document (the set.json an import script writes). Returns the list of problems.
export function checkSetTopics(set) {
  const problems = [];
  if (!Array.isArray(set?.topicIds)) problems.push("topicIds (array) is missing; single-topic documents are no longer accepted for new sets");
  else {
    try {
      const expected = topicFieldsFor(set.topicIds);
      if (JSON.stringify(expected.topicIds) !== JSON.stringify(set.topicIds)) problems.push(`topicIds must be in canonical order: ${JSON.stringify(expected.topicIds)}`);
      if (set.topicId !== expected.topicId) problems.push(`topicId must equal topicIds[0] (${expected.topicId})`);
    } catch (error) { problems.push(error.message); }
  }
  return problems;
}
