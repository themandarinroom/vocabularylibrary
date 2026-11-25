# Vocabulary Library: agent instructions (Claude, Codex and others)

## Creating or importing vocabulary sets
- Follow `docs/VOCABULARY_SET_CREATION.md`. Topics are required.
- Use the 13 canonical topic IDs in `js/topic-taxonomy.js`. A set may have **one or more**: `topicIds`, plus the legacy mirror `topicId = topicIds[0]`.
- Build the topic fields with `topicFieldsFor()` from `scripts/vocabulary-import/topic-fields.mjs`.
- Run `node scripts/vocabulary-import/check-set.mjs <set.json> --project <project>` before any write.
- Never invent a topic, write a display label, use a retired ID (such as `greetings`), or reuse an existing set ID.
- Staging first, then Production, only with the owner's approval for each.

## Topics
`docs/TOPICS.md` is the release record and schema. **Do not remove the legacy `topicId` field**; its deprecation plan is in that file and needs separate approval.

## Protection
- No Production change without the owner's explicit approval.
- The push guard stays in place: push only by explicit URL, fast-forward only, never force.
- `firestore.rules` here is the deployed Production ruleset.
