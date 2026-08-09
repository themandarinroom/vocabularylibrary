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
  items: [/* vocabulary items */]
}
```

`getSet(id)` and `getSets()` load cloud documents first and overlay them on local/seed fallback data. `watchSet(id)` and `watchSets()` provide live updates. Authorised saves write Firestore first, then update the current browser cache. Stable set and item IDs are not regenerated, so existing Teacher Voice documents remain linked.

## Add a vocabulary set

Use **+ New Set** in the teacher library, or choose **Edit** on a card. Choose a permanent descriptive ID such as `year3-school-places`; do not rename published IDs. Items can be added individually or pasted as `Chinese | pinyin | English`. Chinese-only lines are also accepted for later editing. Items can be edited, deleted and reordered with the arrow controls.

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
