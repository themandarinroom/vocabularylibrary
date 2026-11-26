# The Mandarin Room — Vocabulary Library

A lightweight, teacher-editable library of Mandarin vocabulary sets, with a deliberately focused flashcard student viewer. Version 0.4 adds cross-device cloud synchronisation for vocabulary sets while preserving Teacher Voice Cloud.

## Run locally

Because the JavaScript uses browser modules, serve the repository rather than opening the HTML file directly:

```sh
cd "The Mandarin Room"
python3 -m http.server 8000
```

Open `http://localhost:8000`. The project uses only plain HTML, CSS and JavaScript and has no build step or dependencies.

## Vocabulary data

Seed sets live in `js/vocabulary-data.js`, separate from the interface. Published teacher edits are stored in Firestore under `vocabularySets/{setId}` and update Home and Student View in real time across devices. The previous browser-local data under `mandarin-room-vocabulary-v2` remains as a migration and offline fallback so an existing Mac set can be published by opening it and choosing **Save**. Each set has a stable `id`, year level, English and Chinese titles, description, and an `items` array. Generic language items support words, phrases or sentences; Chinese, lowercase no-tone Pinyin, English, optional image and notes, independent AI/teacher audio settings, and reserved handwriting data.

```js
{
  id: "year5-countries",
  yearLevel: 5,
  title: "Countries",
  chineseTitle: "国家",
  description: "...",
  topicIds: ["countries"], // one or more stable IDs from js/topic-taxonomy.js; see "Topics" below
  topicId: "countries",    // mirror of topicIds[0] for older readers
  items: [/* vocabulary items */]
}
```

`getSet(id)` and `getSets()` treat the current Firebase project's Firestore documents as authoritative. `watchSet(id)` and `watchSets()` provide live updates. A project-specific browser cache is used only when a cloud read genuinely fails; cloud and packaged data are never merged. Authorised saves write Firestore first, then refresh that cache. Stable set and item IDs are not regenerated, so existing Teacher Voice documents remain linked.

## Topics

Every vocabulary set belongs to one or more topics through `topicIds` (stable IDs; `topicId` mirrors the first for older readers). A set appears on every chosen topic's page; it is still one set with one ID, so it is listed once everywhere else. The website's Topics page (themandarinroom.au/#/topics) reads it from the published sets on each page load, so publishing, moving, renaming, re-levelling, deleting or republishing a set shows up after a normal refresh. No website change, mapping file or redeployment is involved.

- **Canonical taxonomy:** `js/topic-taxonomy.js` holds the 13 approved topics (v1.1): `numbers`, `colours`, `people`, `animals`, `social-interactions`, `food-drinks`, `school`, `free-time`, `countries`, `time-weather`, `culture`, `nature` and `community`. Greetings was replaced by Social Interactions on 25 November 2026. `firestore.rules` (`validTopicId`) and the website's `dist/catalog.mjs` keep checked copies of the same list.
- **Editor:** the **Topics \*** checkboxes (all 13 topics) sit under Year level and the titles, and store topic IDs, never labels. Saving is refused until at least one topic is chosen. A set without any shows "Unassigned". Unticking one topic leaves the others.
- **Rules:**
  - Only authorised teachers can write `topicId`/`topicIds`; every ID must be one of the 13, `topicIds` has no duplicates, and `topicId` must be one of `topicIds`.
  - An edit may change a set's topics but can never drop them, and once a set has `topicIds` every edit must carry them. This stops an old, cached editor (which only knows `topicId`) from erasing extra topics.
- **Topic illustrations:** these belong to the website and never change when sets are added. Each set's own cover is still used on its card.
- **Changing the taxonomy:** adding, renaming or removing a topic is a separate, approved change to all three lists. Never create a topic automatically, and never infer one from a set's title.
- **Creating sets:** for manual, AI-assisted, script or import creation, follow [docs/VOCABULARY_SET_CREATION.md](docs/VOCABULARY_SET_CREATION.md). Imports use `scripts/vocabulary-import/` (`topicFieldsFor`, `check-set.mjs`).
- **Release record, schema and legacy `topicId` plan:** [docs/TOPICS.md](docs/TOPICS.md). Topics v1.1 (13 topics, multi-topic sets) has been live since 25 Nov 2026.
- **Migration:** existing sets get their topic from `scripts/migrations/assign-topic-ids.mjs`, using the frozen, owner-approved `topic-assignments.json`.
  - It is a dry run by default. `--apply` writes, and Production also needs `--confirm-production`.
  - It writes a JSON backup first and writes only `topicId`, with an update-time precondition.
  - It reads every set back afterwards and compares it with the backup, and is safe to rerun.
  - `--rollback <backup>` undoes it.

Tests:

- `node --test tests/*.test.mjs`
- Rules and migration, against the local emulator:

  ```bash
  firebase emulators:exec --only firestore --project demo-topics "node --test tests/topic-rules.emulator.mjs"
  ```

## Vocabulary images (local upload, URL or generated)

The **Vocabulary Set Cover** section sits directly below Set details. Covers and item images (item **⋯ More** panel) can come from **Upload Image** (file picker, iPad Photo Library/Files, or drag and drop on desktop), an image URL, or the existing AI generation.

- Accepts JPG, PNG and WebP up to 10 MB. The real format is detected from the file's bytes, not its name or MIME type.
- Images are resized without upscaling (cover ≤ 1200 px, item ≤ 800 px on the longest side), keep their aspect ratio and transparency, and are encoded as WebP (targets: cover ≤ 300 KB, item ≤ 150 KB). Safari/iPadOS, whose Canvas cannot encode WebP, uses the vendored libwebp encoder shared with Unit Library (`vendor/jsquash-webp`). Every upload is checked for genuine `RIFF…WEBP` bytes.
- Selecting an image only prepares a local preview. Nothing is uploaded and the published image is unchanged until **Save set**. Save uploads new images, writes the set once, then deletes superseded managed images only when no published set still references them. If anything fails, new uploads are rolled back, the published set is unchanged, and all unsaved edits stay in the editor for a retry.
- Storage paths reuse the existing convention: `vocabulary/{setId}/cover/image-{revision}.webp` and `vocabulary/{setId}/{itemId}/image-{revision}.webp`. Firestore stores only the download URL and `coverImageStoragePath` / item `imageStoragePath` (uploaded items also record `imageSource: "upload"`). No Base64 is stored.

Code: `js/vocabulary-image-processing.js` (validate, resize, encode), `js/vocabulary-image-field.js` (shared upload/preview control), `js/vocabulary-image-save.js` (save, rollback and reference-safe cleanup). Tests: `node --test tests/*.test.mjs`.

## Add a vocabulary set

Use **+ New Set** in the teacher library, or choose **Edit** on a card. Choose the **Topic** (required). Choose a permanent descriptive ID such as `year3-school-places`; do not rename published IDs. Items can be added individually or pasted as `Chinese | pinyin | English`. Chinese-only lines are also accepted for later editing. Items can be edited, deleted and reordered with the arrow controls.

The **Generate Pinyin & English** helper uses a deliberately small local dictionary for common seed vocabulary. It never calls a paid API, never overwrites a populated Pinyin or English field, and all results remain editable. When no suggestion exists, enter the fields manually.

Future apps under `/tools/` can use the stable set ID in URLs such as `/tools/randompicker/?set=year5-countries`, then load the matching set through a shared/exported version of this data layer. Random Picker is intentionally not included in v0.1.

## Teacher Voice Cloud

Teacher Voice uses the existing `the-mandarin-room` Firebase project and the same authorised-teacher Google sign-in model as Speaking v0.6.2.

1. Open an existing set in Teacher Authoring and sign in with an account whose `authorizedTeachers/{uid}` document has `active: true`.
2. Expand **Optional / Advanced** on an item.
3. Choose **Record**, **Stop**, and **Preview**.
4. Choose **Save** only when the take is ready. The previous cloud recording remains active until both the replacement upload and metadata write succeed.
5. Use **Delete** and confirm to permanently remove the current recording.

Each item has one deterministic Storage object:

```text
vocabulary/{setId}/{itemId}/teacher-voice-{revision}
```

Firestore stores only retrieval metadata in `vocabularyTeacherVoices/{setId}--{itemId}`:

```js
{ setId, itemId, teacherAudioUrl, storagePath, contentType, revision, updatedAt }
```

Student View listens to that metadata document. A successful save or deletion therefore appears across computers and iPads without copying audio into browser storage. AI Voice remains independent. Replacements upload to a new revision first, then atomically change the metadata pointer, and finally delete the previous object. A failed upload or metadata write leaves the previous recording active; failed new objects are cleaned up.

`firebase-config.js` contains Firebase's public web-app identifier—not a private server credential. Access is enforced by Google Authentication, `authorizedTeachers`, and the checked-in `firestore.rules` and `storage.rules`. Deploy both rule files from this directory with `firebase deploy --only firestore:rules,storage`; they preserve Speaking's existing rules and add only the Vocabulary paths. Do not deploy partial replacement rules copied from the README.

## Audio

AI Voice is isolated in `js/audio.js` and currently uses browser speech synthesis. Teacher Voice uses a standard cloud audio URL and `<audio>` playback, so it does not depend on Web Speech support. Recording follows Speaking's compatibility order: Opus/WebM where supported, MP4 on Safari where supported, then the browser default MediaRecorder format.

## Current limitations and future work

- Existing browser-local edits must be opened and saved once by an authorised teacher to publish them to Firestore.
- Microphone recording requires HTTPS or localhost and explicit browser permission. Older iPads must support `MediaRecorder`; playback has broader compatibility than recording.
- Teacher uploads require an authorised Google teacher account. Student playback is public for a known stable set/item ID and collects no student data.
- Browser AI voices and pronunciation quality vary by device.
- Image assets are not yet supplied.
- Handwriting fields are reserved but stroke animation is not implemented.
- Planned capabilities: handwriting/stroke animation, Random Picker, Listening, Bingo, Sentence Builder, and shared Vocabulary consumption from Speaking.

The repository root can be published as the standalone GitHub Pages project at `https://themandarinroom.github.io/vocabularylibrary/`.

## Classroom Tools: Word Randomiser v0.2

The production teacher interface is published at `https://themandarinroom.github.io/vocabularylibrary/tools/word-randomizer/`. It reads the same production `vocabularySets` and `vocabularyTeacherVoices` collections as Vocabulary Library, supports Local, teacher-led Live, delegated-student and independent-group modes, and keeps each Live Session on a stable vocabulary/audio snapshot until that session ends.

Students join without accounts through `https://themandarinroom.github.io/vocabularylibrary/tools/word-randomizer/join.html`. Authoritative draws and all shared-state mutations go through the seven production callable/scheduled Functions. App Check remains non-enforcing while classroom device monitoring continues; authentication, per-device capability tokens, join rate limits and Firestore Rules remain enforced.
