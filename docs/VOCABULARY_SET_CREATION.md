# Creating a vocabulary set (standing instructions)

These rules apply to every new vocabulary set, whoever or whatever creates it: a teacher in the editor, Claude, Codex, a script, an import or a batch operation. **Topic is a required field.**

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
4. **Keep the existing publication workflow:**
   - Staging first, with the owner's approval, then Production.
   - Stable set and item IDs.
   - Images and covers as documented in the README.
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
