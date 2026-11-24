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

```yaml
English Title: Days of the Week
Chinese Title: 星期
Year Level: Year 4
Topic: Time & Weather
Topic ID: time-weather
```

## 2. Approved topics

The source of truth is `js/topic-taxonomy.js`.

| Topic | Chinese | Topic ID | Use for |
|---|---|---|---|
| Numbers | 数字 | `numbers` | Counting and using numbers |
| Colours | 颜色 | `colours` | Colours |
| People | 人物 | `people` | Family, body parts, age, self-introduction, personal information, appearance |
| Animals | 动物 | `animals` | Pets, wild animals, animal vocabulary |
| Greetings | 问候 | `greetings` | Greetings, responses, everyday expressions |
| Food & Drinks | 食物与饮料 | `food-drinks` | Fruit, food, drinks, food preferences |
| School | 学校 | `school` | School places and everyday school life |
| Free Time | 休闲活动 | `free-time` | Sports, hobbies, leisure, music, recreation |
| Countries | 国家 | `countries` | Countries, nationalities, capital cities, Australian states and geography |
| Time & Weather | 时间与天气 | `time-weather` | Time, dates, days, months, seasons, weather |
| Culture | 文化 | `culture` | Festivals, traditions, cultural vocabulary |

## 3. Rules for AI-assisted, scripted and batch creation

1. **Validate the topic before writing anything.** Use `resolveTopic()` or `isValidTopicId()` from `js/topic-taxonomy.js`. If the Topic and Topic ID disagree, the topic is missing, or the topic is not in the table, **stop and ask the owner**. Never guess, never fall back to a default, and never create a new topic.
2. **Write the stable `topicId`** (for example `free-time`) into the set document. Never write the display label. The editor and `saveSet()` refuse a set without a valid `topicId`, and Firestore rules reject an unknown one.
3. **Scripts and imports** that write documents directly must include `topicId` in the full document.
   - The rules apply to client writes only.
   - Admin and REST imports bypass the rules, so the script itself must validate the topic.
   - When updating an existing set, never drop its `topicId`.
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

## 4. Changing a set's topic

Open the set in the editor, choose the new Topic and save. The set ID, student URL, items, images and audio do not change. After a refresh, the set appears under its new topic.

## 5. Adding a topic

Adding a topic is a separate taxonomy change that the owner must approve. It updates all three of these together, and their tests check that they agree:

- `js/topic-taxonomy.js`;
- `validTopicId` in `firestore.rules`;
- the website's `dist/catalog.mjs`, together with its fixed topic illustration.
