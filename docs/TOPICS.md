# Topics: release record, schema and legacy-field plan

## Topics v1.1: released to Production on 25 November 2026 (11:37–11:43 UTC)

| Component | Version |
|---|---|
| Vocabulary Library `main` | `56db84f` |
| Firestore rules | `17af1788`, deployed from this repository's `firestore.rules` |
| Production `publishPublicUnit` | from `e399672` (branch `claude/topics-v1.1-functions`) |
| Website | Hosting `5b2c8405ab5fecf5`, source `2d69017`, tag `production/2026-11-25-5b2c8405ab5fecf5` |

The full report is kept outside this repository, in `outputs/topics-v1.1-phase-d/REPORT.md` in the Codex project folder.

**Final 13-topic taxonomy** (`js/topic-taxonomy.js`; Firestore `validTopicId` and the website `catalog.mjs` are checked copies):

| # | Topic | Chinese | ID |
|---|---|---|---|
| 1 | Numbers | 数字 | `numbers` |
| 2 | Colours | 颜色 | `colours` |
| 3 | People | 人物 | `people` |
| 4 | Animals | 动物 | `animals` |
| 5 | Social Interactions | 社交 | `social-interactions` |
| 6 | Food & Drinks | 餐饮 | `food-drinks` |
| 7 | School | 学校 | `school` |
| 8 | Free Time | 休闲活动 | `free-time` |
| 9 | Countries | 国家 | `countries` |
| 10 | Time & Weather | 时间与天气 | `time-weather` |
| 11 | Culture | 文化 | `culture` |
| 12 | Nature | 自然 | `nature` |
| 13 | Community | 社区 | `community` |

**Retired IDs** (read-only mapping; never written): `family` and `body-parts` → `people`; `food` → `food-drinks`; `weather` and `time` → `time-weather`; `greetings` → `social-interactions`.

**Multi-topic sets:**
- A set may belong to several topics. It is still one set, with one ID and one student URL.
- It appears on each of its topic pages, and **once** on the Vocabulary page, in search, in the Vocabulary Library and in every game.

**Data at release (Production):**
- 25 published vocabulary sets, all with `topicIds`.
- **Age** (`year3-age`) → Numbers and People.
- **How are you?** (`year2-how-are-you`) → Social Interactions (moved from `greetings`).

**Not repeated in Phase D:** an authenticated Unit publication on **Production**. The same Function code was tested end to end on Staging by the owner on 25 Nov: publish with Social Interactions, Nature and Community; listed under those topics; then cleaned up.

## Production schema (`vocabularySets/{id}`)

```js
topicIds: ["numbers", "people"], // canonical: one or more topic IDs, no duplicates, taxonomy order
topicId: "numbers",              // LEGACY mirror of topicIds[0]; kept for compatibility (see below)
```

**Enforced by:**
- **Rules:**
  - `topicIds` is a list of at most 13 distinct canonical IDs.
  - `topicId`, when present, is one of them.
  - An edit can't drop topics, and once a set has `topicIds` every edit must carry them.
- **Editor and `saveSet()`:** at least one topic; the editor shows 13 checkboxes.
- **Imports:** `scripts/vocabulary-import/` (below).

## Import requirements (from 26 Nov 2026)
Every scripted import, batch import or AI-assisted creation must:
1. **State its topics** as `Topic IDs: numbers, people` (one or more) in the task metadata. If a topic is unclear, ask the owner; never invent a topic.
2. **Build the fields with the helper:** `topicFieldsFor(ids)` in `scripts/vocabulary-import/topic-fields.mjs`, which returns `{ topicIds, topicId }`. It refuses unknown, retired and duplicate IDs.
3. **Check the prepared document before writing:**

   ```bash
   node scripts/vocabulary-import/check-set.mjs set.json --project <project>
   ```

   This checks the topic fields, the ID and year level, and that the ID is free, so the set appears exactly once.
4. **Keep the existing publication workflow:**
   - Staging first, with the owner's approval, then Production.
   - Create-only writes (`currentDocument.exists: false`), plus readback.
5. **Verify after publishing:** refresh `themandarinroom.au/#/topics?topic=<id>` for **each** assigned topic, and confirm the set appears once on the Vocabulary page.

Admin and REST imports bypass the Firestore rules, so step 2 is the only guard for scripted writes. See `docs/VOCABULARY_SET_CREATION.md`.

## Legacy field `topicId`: kept for now; deprecation plan

**Status:** retained. Do not remove it, and do not run a destructive migration, until the plan below is approved.

**Current readers** (each also reads `topicIds` first, except where noted):

| Reader | How it uses `topicId` |
|---|---|
| Website `dist/catalog.mjs` `setTopics()` | fallback when `topicIds` is absent |
| Website `dist/public-data.mjs` | selects the field in the public query |
| `js/topic-taxonomy.js` `setTopicIds()` and `js/vocabulary-store.js` `publicSet()` | fallback for sets without `topicIds` |
| `firestore.rules` | validates it, and that it is one of `topicIds` |
| **Old cached clients and rollback targets** | read **only** `topicId`: website Hosting `4aa80c4e…` and earlier, and Vocabulary Library `≤ 2a084e2` (an editor tab left open since before 25 Nov) |
| Migration scripts (`scripts/migrations/`) | plan, verify and roll back using both fields |

**Current writers:**

| Writer | What it writes |
|---|---|
| `js/vocabulary-store.js` `saveSet()` | writes `topicId = topicIds[0]` |
| `scripts/migrations/assign-topic-ids.mjs` | topic-field modes write both fields |
| `scripts/vocabulary-import/topic-fields.mjs` | returns both fields for imports |
| **Old untracked import scripts** in `The Mandarin Room/imports/` (outside any repository) | `how-are-you`, `numbers-ii-iii`, and earlier `weather`, `twelve-months`, `countries-ii-iii` and others write **only** `topicId` (or no topic, before 24 Nov). They are records of completed imports and must not be reused as templates without adding `topicIds` |

**Not involved:** games (Bingo, Great Wall, Word Randomiser), Functions and Units. Units use their own `topics` array.

**Deprecation plan.** Each step needs separate approval.
1. **Observe** (now until at least one school term after 25 Nov, and until no rollback to v1.0 is plausible): keep writing the mirror. Periodically check that every published set has `topicIds`, with `assign-topic-ids.mjs --backfill-topic-ids` as a dry run.
2. **Stop depending on it:**
   - Make `topicIds` required for new documents in the rules and the store.
   - Remove the `topicId` fallbacks from the website and the store.
   - Keep accepting the field if it is present.
   - Release together; verify old links and editors.
3. **Stop writing it:** `saveSet()` and the import helper no longer write `topicId`. The rules still accept it, so old documents remain valid.
4. **Remove it from data:** only after a backup, using a field-masked delete of `topicId` with a dry run, readback and rollback, as in the existing migration script. Then remove it from the rules key list.

Steps 2–4 need the website and the Vocabulary Library released together, and the website rollback target moved past v1.0.
