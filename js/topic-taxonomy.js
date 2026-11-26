// Canonical topic taxonomy for The Mandarin Room (v1.1, approved 25 November 2026: 13 topics).
//
// This module is the single source of truth for topic IDs, labels and order.
// Two enforced copies exist because they cannot import this file:
//   - firestore.rules (validTopicId), checked by tests/topic-taxonomy.test.mjs
//   - the website's dist/catalog.mjs, checked by the website's topic tests
// Topic illustrations are presentation and live only in the website.
//
// Adding, removing or renaming a topic is a separate, approved taxonomy change.
// Never create a topic automatically, and never infer a topic from a set title.
export const TOPIC_TAXONOMY = Object.freeze([
  ["numbers", "Numbers", "数字", "Counting and using numbers."],
  ["colours", "Colours", "颜色", "Recognising and using colours."],
  ["people", "People", "人物", "Family, body parts and personal information."],
  ["animals", "Animals", "动物", "Pets, wild animals and animal vocabulary."],
  ["social-interactions", "Social Interactions", "社交", "Greetings, polite expressions and everyday social interactions."],
  ["food-drinks", "Food & Drinks", "餐饮", "Fruit, food, drinks and food preferences."],
  ["school", "School", "学校", "School places and everyday school life."],
  ["free-time", "Free Time", "休闲活动", "Sports, hobbies and leisure activities."],
  ["countries", "Countries", "国家", "Countries, nationalities and geographical places."],
  ["time-weather", "Time & Weather", "时间与天气", "Time, dates, seasons and weather."],
  ["culture", "Culture", "文化", "Festivals, traditions and cultural vocabulary."],
  ["nature", "Nature", "自然", "Plants, natural landscapes and the environment."],
  ["community", "Community", "社区", "Community places, occupations, transport and everyday life."]
].map(([id, titleEn, titleZh, description], index) => Object.freeze({ id, titleEn, titleZh, description, order: index + 1 })));

export const TOPIC_IDS = Object.freeze(TOPIC_TAXONOMY.map((topic) => topic.id));

// Retired topic IDs and their replacements: the 12-topic structure used before 24 November 2026, and
// Greetings (24–25 November 2026). Only for reading old links and metadata; never written to a vocabulary set.
export const LEGACY_TOPIC_IDS = Object.freeze({
  family: "people",
  "body-parts": "people",
  food: "food-drinks",
  weather: "time-weather",
  time: "time-weather",
  greetings: "social-interactions"
});

export function isValidTopicId(value) {
  return typeof value === "string" && TOPIC_IDS.includes(value);
}

export function topicById(id) {
  return TOPIC_TAXONOMY.find((topic) => topic.id === id) || null;
}

// "Food & Drinks" -> "food-drinks". Accepts an ID or an exact English or Chinese label,
// for AI-assisted and batch creation tasks. Returns null when nothing matches exactly.
export function resolveTopic(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return TOPIC_TAXONOMY.find((topic) => topic.id === text || topic.titleEn.toLowerCase() === text.toLowerCase() || topic.titleZh === text) || null;
}

// Multi-topic (v1.1): a set may belong to several topics through `topicIds`, an array of stable topic IDs.
// Valid IDs are kept once each, in taxonomy order, so the same choice always produces the same array.
export function normaliseTopicIds(list) {
  if (!Array.isArray(list)) return [];
  const chosen = new Set(list.filter(isValidTopicId));
  return TOPIC_IDS.filter((id) => chosen.has(id));
}

// The topics of a stored set. `topicIds` wins when present; older sets only have the single `topicId`.
// `topicId` is kept on new saves as a mirror of the first topic, for readers that predate topicIds.
export function setTopicIds(set) {
  if (Array.isArray(set?.topicIds)) return normaliseTopicIds(set.topicIds);
  return isValidTopicId(set?.topicId) ? [set.topicId] : [];
}
