# Vocabulary content, data and import standard

**Owner document** for the vocabulary data model, stable IDs, pinyin, English capitalisation and the import workflow. It is part of the Shared Development Standards v1.0 (`docs/PROJECT_STANDARDS.md`). Images, covers and audio are covered in `docs/ASSETS.md`; topics schema and history in `docs/TOPICS.md`.

These rules apply to every new vocabulary set and every content change, whoever or whatever makes it: a teacher in the editor, Claude, Codex, a script, an import or a batch operation. **Topic is a required field.**

Contents:
1. Task metadata
2. Approved topics
3. Rules for AI-assisted, scripted and batch creation
4. Changing a set's topics
5. Adding a topic
6. Import and publication workflow
7. Data model and stable IDs
8. Pinyin standard
9. English standard (capitalisation)
10. Future maintained import tool

## 1. Task metadata

Every vocabulary set creation task must state:

```yaml
English Title: Hobbies I
Chinese Title: 爱好 I
Year Level: Year 5
Topic: Free Time
Topic ID: free-time
```

A set may belong to several topics. List each one:

```yaml
English Title: Age
Chinese Title: 年龄
Year Level: Year 3
Topics: Numbers, People
Topic IDs: numbers, people
```

```yaml
English Title: Days of the Week
Chinese Title: 星期
Year Level: Year 4
Topic: Time & Weather
Topic ID: time-weather
```

```yaml
English Title: Greetings I
Chinese Title: 问候 I
Year Level: Year 2
Topic: Social Interactions
Topic ID: social-interactions
```

```yaml
English Title: Plants I
Chinese Title: 植物 I
Year Level: Year 4
Topic: Nature
Topic ID: nature
```

```yaml
English Title: Places in the Community
Chinese Title: 社区场所
Year Level: Year 5
Topic: Community
Topic ID: community
```

These are format examples only; they are not sets to create.

## 2. Approved topics (v1.1, 13 topics)

The source of truth is `js/topic-taxonomy.js`.

| Topic | Chinese | Topic ID | Use for |
|---|---|---|---|
| Numbers | 数字 | `numbers` | Counting and using numbers |
| Colours | 颜色 | `colours` | Colours |
| People | 人物 | `people` | Family, body parts, age, self-introduction, personal information, appearance |
| Animals | 动物 | `animals` | Pets, wild animals, animal vocabulary |
| Social Interactions | 社交 | `social-interactions` | Greetings and farewells, asking how someone is, thanking and apologising, polite expressions, invitations, everyday conversational exchanges |
| Food & Drinks | 餐饮 | `food-drinks` | Fruit, food, drinks, food preferences |
| School | 学校 | `school` | School places and everyday school life |
| Free Time | 休闲活动 | `free-time` | Sports, hobbies, leisure, music, recreation |
| Countries | 国家 | `countries` | Countries, nationalities, capital cities, Australian states and geography |
| Time & Weather | 时间与天气 | `time-weather` | Time, dates, days, months, seasons, weather |
| Culture | 文化 | `culture` | Festivals, traditions, cultural vocabulary |
| Nature | 自然 | `nature` | Plants, trees, flowers; mountains, rivers, oceans; landscapes; environments; environmental protection and sustainability. Animals stay under Animals; weather and seasons under Time & Weather |
| Community | 社区 | `community` | Community places and public facilities, occupations, transport, shopping, directions and locations, everyday community life. School vocabulary stays under School; social expressions under Social Interactions |

**Greetings is not a topic.** Greetings vocabulary belongs to Social Interactions (`social-interactions`). The old ID `greetings` is refused.

## 3. Rules for AI-assisted, scripted and batch creation

1. **Validate the topic before writing anything.** Use `resolveTopic()` or `isValidTopicId()` from `js/topic-taxonomy.js`. If the Topic and Topic ID disagree, the topic is missing, or the topic is not in the table, **stop and ask the owner**. Never guess, never fall back to a default, and never create a new topic.
2. **Write the stable topic IDs** into the set document as `topicIds` (one or more, for example `["free-time"]` or `["numbers", "people"]`), plus `topicId` equal to the first. Never write display labels. The editor and `saveSet()` refuse a set without at least one valid topic, and Firestore rules reject unknown or duplicate IDs.
3. **Scripts and imports** that write documents directly must build the topic fields with `topicFieldsFor()` from `scripts/vocabulary-import/topic-fields.mjs`. This writes `topicIds` (all topics) and `topicId` (the first). They must also run `node scripts/vocabulary-import/check-set.mjs set.json --project <project>` before writing, which refuses unknown, retired or duplicate topics and an ID that already exists.
   - Never hand-write topic fields. The import scripts kept in `The Mandarin Room/imports/` from before 26 Nov write only `topicId` and must not be copied unchanged.
   - The rules apply to client writes only.
   - Admin and REST imports bypass the rules, so the script itself must validate the topic.
   - When updating an existing set, never drop its `topicId` or `topicIds`.
4. **Keep the existing publication workflow** (§6):
   - Staging first, then Production under the approval policy in `docs/PROJECT_STANDARDS.md` §5.
   - Stable set and item IDs (§7).
   - Images and covers as in `docs/ASSETS.md`.
   - No change to audio handling.
5. **Verify after publishing:**
   - Refresh `https://themandarinroom.au/#/topics?topic=<topic-id>`.
   - Confirm the set appears under the right topic, with the correct title, cover and year label.
   - Confirm the topic card's year badges include the set's year.
   - Confirm the topic illustration is unchanged.

## 4. Changing a set's topics

A set can belong to several topics (for example Age: Numbers and People). Task metadata may list several: `Topics: Numbers, People` / `Topic IDs: numbers, people`.

Open the set in the editor, tick or untick topics and save. Unticking one topic leaves the others. The set ID, student URL, items, images and audio do not change. After a refresh, the set appears under its new topic.

## 5. Adding a topic

Adding a topic is a separate taxonomy change that the owner must approve. It updates all three of these together, and their tests check that they agree:

- `js/topic-taxonomy.js`;
- `validTopicId` in `firestore.rules`;
- the website's `dist/catalog.mjs`, together with its fixed topic illustration.

## 6. Import and publication workflow

Reference implementations:
- `The Mandarin Room/imports/colours-i-ii/`: Colours I image update plus new Colours II, 28 Nov 2026.
- `The Mandarin Room/imports/fruit-ii/`: Fruit II, 28 Nov 2026.

Earlier folders (Sports, Countries II/III and others) predate Topics. They are records of completed imports, not templates.

**Steps**
1. **Brief:**
   - Confirm the task metadata (§1), the exact entries and order, the Year level and the cover choice.
   - Report any mismatch with the source PDF or list before writing anything.
2. **Inspect:**
   - Read both projects read-only. Look for a set with the same ID, title or Chinese title, and for overlap with related sets (for example Fruit I versus Fruit II).
   - Report differences between environments that matter to the task.
3. **Prepare:**
   - Build `set.json` with `topicFieldsFor()` and item IDs per §7.
   - Prepare images per `docs/ASSETS.md` and record hashes in `asset-manifest.json`.
   - Review a contact sheet on a light and a dark background.
   - Run `check-set.mjs` against both projects.
4. **Staging:**
   - Snapshot `vocabularySets` and `vocabularyTeacherVoices` in **both** projects.
   - Upload images create-only and re-download them byte-identical.
   - Write the set with one create-only commit (`currentDocument.exists: false`). When an existing set must be updated, use an `updateTime` precondition and a field mask (`items` only, as Colours I did).
   - Snapshot again. Prove that only the intended documents changed, Teacher Voice is unchanged in both projects, and the other project is unchanged. Read back the full document.
5. **Verify in Staging:**
   - Student View for every entry (text, image loads, AI Voice button), with AI Voice played at least once.
   - The topic page on a Staging preview (`#/topics?topic=<id>`): title, cover, year.
   - The Bingo, Great Wall listening, Word Randomiser and Tarsia data adapters.
   - Desktop and iPad-size viewports.
6. **Production:**
   - Only under the approval policy (`docs/PROJECT_STANDARDS.md` §5).
   - Same script, same checks, plus a check that the Staging result matches the prepared data.
7. **Verify live:**
   - The Student View link, and `themandarinroom.au/#/topics?topic=<id>`, including year badges and an unchanged topic illustration.
   - The live game word selectors list the set.
8. **Archive** the masters locally (`docs/ASSETS.md` §5).
9. **Report:** write `REPORT.md` in the import folder with the ten report sections (`docs/PROJECT_STANDARDS.md` §7), including the Student View link.

Never modify other sets, Teacher Voice records or application code as part of an import.

## 7. Data model and stable IDs

**Set document** `vocabularySets/{setId}`:

| Field | Value |
|---|---|
| `id` | Stable set ID, for example `year3-fruit-ii` |
| `yearLevel` | 0 (Prep) to 6 |
| `title`, `chineseTitle` | Series numbering uses Roman numerals: `Fruit II` / `水果 II` |
| `description` | `""` when there is none; some older sets have `null` |
| `topicIds`, `topicId` | From `topicFieldsFor()` (§3) |
| `coverImage`, `coverImageStoragePath`, `coverImageGenerated` | `docs/ASSETS.md` §4 |
| `published` | `true` |
| `items` | Array, in teaching order |
| `updatedAt`, `updatedBy` | Server timestamp; the UID of an active `authorizedTeachers` account in that project |

**Item fields:**
- `id`, `chinese`, `pinyin`, `english`
- `type`: `word`, `phrase` or `sentence`
- `notes`
- `image`, `imageStoragePath`, `imageType`, `imageGenerated`, `imageGenerationNote`
- `audio: { aiEnabled: true }`
- `handwriting: { enabled: false, characters: [...chinese] }`

`imageType` is `auto` for new items. The older values `single` and `group` exist and remain valid.

**Stable IDs (Decision 3)**
- **New scripted imports:** item IDs are `<english-id>-<set-suffix>`, for example `orange-fruit-ii`, `mango-fruit-ii`, `brown-colours-ii`.
  - `<english-id>` is the English meaning in lowercase, with non-alphanumerics turned to single hyphens.
  - `<set-suffix>` is the set ID without its year prefix.
- **Editor-generated IDs** (such as `banana-mtqvbivc`, `item-mtqvdkso`) and plain IDs from earlier imports (such as `afghanistan`) remain valid.
- **Collisions:** an item ID must be unique within its set. If two entries would produce the same ID (for example two senses of one English word), add a short disambiguator from the Chinese or pinyin (`orange-colour-…` versus `orange-fruit-…`) and report it. Never reuse or overwrite an existing ID. `check-set.mjs` refuses a set ID that already exists.
- **IDs are identity, not content.** An ID is never regenerated or changed when the translation, spelling, capitalisation, set title or topic changes. Edit the content fields and keep the ID.
- **Teacher Voice depends on IDs:** recordings are keyed `vocabularyTeacherVoices/{setId}--{itemId}`, so preserving IDs preserves recordings.
- **No ID migration** is performed or planned under this standard. A proposed migration (such as the Family proposal in the 28 Nov capitalisation record) needs its own approval and a reference-impact audit.

## 8. Pinyin standard (Decision 7)

Student-facing vocabulary pinyin uses:
- lowercase letters;
- no tone marks and no tone numbers;
- one space between syllables;
- standard Hanyu Pinyin spelling;
- the letter **ü** where required.

| Approved | Not approved |
|---|---|
| lü se | lv se |
| nü | nv |
| lü | lu |

- `v` may be a keyboard input mechanism in a future Pinyin Input Practice tool, but it never replaces `ü` in displayed vocabulary content.
- This convention does not prevent tone-marked pinyin in dedicated pronunciation or tone-learning resources.
- **Validators must accept `ü`.** A valid syllable pattern is `^[a-zü]+( [a-zü]+)*$`.
  - The import scripts used so far (`^[a-z ]+$` or `^[a-z]+( [a-z]+)*$`) reject it.
  - Fixing them is a future implementation task (`docs/PROJECT_STANDARDS.md` §11). No validator was changed in Phase 3.

## 9. English standard (capitalisation)

Approved by the owner and applied to existing content on 28 Nov 2026. Source: `The Mandarin Room/audit-reports/english-capitalisation-2026-11-27/` (audit report and `implementation-2026-11-28/`).

- **Spelling:** use Australian English.
- **Lowercase:** common nouns, verbs, adjectives, adverbs and ordinary vocabulary phrases.
- **Preserve capitals for:** proper nouns, geographical names, nationalities, languages, proper adjectives, days, months, recognised festivals, acronyms and official names.
- **Sentences:** complete sentences and questions use standard sentence capitalisation and punctuation.
- **I:** preserve the pronoun I and its contractions.
- **Examples, lowercase:** snake; snow leopard; Tibetan antelope; red-crowned crane; play basketball; happy; summer; doughnut; ninja course; art room.
- **Examples, preserved:** Australia; Melbourne; Australian; Mandarin (the language); January; Monday; AFL; Chinese New Year; I'm so-so; Great!; How is it?
- **Context decides.** In Fruit, *mandarin* is the fruit and stays lowercase.
- **No blanket rules:** do not apply title case or blanket lowercase. Review each translation in its Chinese and set context.
- **Escalate** ambiguous names, sentence fragments, alternative translations and official-name conventions to the teacher.
- **Keep changes separate:** report spelling or meaning concerns separately. Do not bundle them into a case correction.
- **Machine suggestions get the same review:** AI suggestions, local dictionaries and generated import files.

## 10. Future maintained import tool (not built)

**Status:** requirements only. This is a future task that needs approval. Until it exists, follow §6 and adapt the reference implementations, without copying their hard-coded values.

**Where:** this repository, under `scripts/vocabulary-import/`, using the existing `topic-fields.mjs` and `check-set.mjs` (`docs/PROJECT_STANDARDS.md` §8).

The tool must consolidate the verified safety patterns from the Sports, Countries, Colours and Fruit II imports:
1. **Input validation:** exact entries and order; pinyin per §8, accepting `ü`; English per §9; year; title.
2. **Stable item ID generation** per §7, with collision reporting.
3. **Topic validation** through `topicFieldsFor()` and `check-set.mjs`.
4. **Image processing** per `docs/ASSETS.md` §3, with an asset manifest, contact sheets and edge and transparency checks.
5. **Reference-safe cover reuse** (`docs/ASSETS.md` §4).
6. **Create-only database writes** (`exists: false`); for updates, `updateTime` preconditions and field masks.
7. **Storage preconditions** (`ifGenerationMatch=0`), immutable revision names and delivery WebP only by default.
8. **Asset integrity:** byte-identical re-download before any Firestore write.
9. **Snapshots** of `vocabularySets` and `vocabularyTeacherVoices` in both projects, before and after.
10. **Teacher Voice protection:** a proven unchanged state; no writes.
11. **Staging import and verification** helpers (data adapters, Student View checks).
12. **Production approval check:** refuse Production without a recorded approval and a passing Staging result.
13. **Production readback:** full document comparison.
14. **Local asset archiving** after Production, never overwriting.
15. **A standard `REPORT.md`** with the ten sections.
