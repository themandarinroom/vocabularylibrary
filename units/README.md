# Unit Library v0.1

Open `/units/` from the repository's local web server. The module is deliberately separate from Vocabulary Library and Speaking.

Units contain reusable curriculum content only: stable ID, year level, English and Chinese titles, and an ordered lesson list. Lessons store stable reference IDs for Vocabulary (`vocabularySetId`) and Speaking (`yearLevelId:practiceId`); linked content is never copied into a Unit. Dates belong to a future scheduled Unit instance and are not part of this model.

For safe preview, the sample and edits persist under the browser key `mandarin-room-units-v0.1`. When an authorised teacher already has a Firebase session on the same origin, saves are also written to the separate `units` collection under the checked-in rules. No rules or data have been deployed by this change.

Speaking currently publishes two practices per year-level document rather than independent activities. v0.1 therefore uses the smallest stable reference available (`year-4:core`, for example) and opens the existing Speaking teacher interface at its separate production site. A future independent Speaking activity collection can replace the resolver without changing Lesson records generally.
