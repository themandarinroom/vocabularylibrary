const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

initializeApp();
const db = getFirestore();
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const stableId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAILY_LIMIT = 100;
const ITEM_COOLDOWN_MS = 15000;

function requireStableId(value, label) {
  if (typeof value !== "string" || !stableId.test(value)) throw new HttpsError("invalid-argument", `${label} is invalid.`);
  return value;
}

async function requireAuthorisedTeacher(uid) {
  const teacher = await db.doc(`authorizedTeachers/${uid}`).get();
  if (!teacher.exists || teacher.data()?.active !== true) throw new HttpsError("permission-denied", "This account is not authorised to generate vocabulary images.");
}

async function reserveGeneration(uid, setId, itemId) {
  const now = Date.now();
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const usageRef = db.doc(`vocabularyImageGenerationUsage/${uid}--${dayKey}`);
  const lockRef = db.doc(`vocabularyImageGenerationLocks/${uid}--${setId}--${itemId}`);
  await db.runTransaction(async (transaction) => {
    const [usage, lock] = await Promise.all([transaction.get(usageRef), transaction.get(lockRef)]);
    const count = usage.exists ? Number(usage.data().count || 0) : 0;
    if (count >= DAILY_LIMIT) throw new HttpsError("resource-exhausted", `Daily image generation limit reached (${DAILY_LIMIT}). Try again tomorrow.`);
    const previousTime = lock.exists ? lock.data().requestedAt?.toMillis?.() || 0 : 0;
    if (now - previousTime < ITEM_COOLDOWN_MS) throw new HttpsError("resource-exhausted", "This item was just generated. Wait a few seconds before replacing it again.");
    transaction.set(usageRef, { uid, dayKey, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(lockRef, { uid, setId, itemId, requestedAt: Timestamp.fromMillis(now) });
  });
  return { usageRef, lockRef };
}

async function releaseFailedGeneration(refs) {
  try { await db.runTransaction(async (transaction) => {
    const usage = await transaction.get(refs.usageRef);
    if (usage.exists) transaction.update(refs.usageRef, { count: Math.max(0, Number(usage.data().count || 1) - 1), updatedAt: FieldValue.serverTimestamp() });
    transaction.delete(refs.lockRef);
  }); } catch (error) { console.error("[Vocabulary image quota rollback]", error); }
}

function generationConcept(item, requestedEnglish, requestedChinese) {
  const english = String(requestedEnglish || item?.english || "").trim().slice(0, 120);
  const corrected = english.toLowerCase() === "lizzard" ? "lizard" : english;
  return corrected || String(requestedChinese || item?.chinese || "").trim().slice(0, 80);
}

function itemImagePrompt(concept) {
  return `A clear child-friendly classroom vocabulary illustration of one ${concept}. Simple warm picture-book style, centred subject, immediately recognisable at thumbnail size, plain light neutral background, minimal visual detail, consistent soft colours, no border, no label, no letters, no words, no text.`;
}

function setCoverConcepts(set) {
  const title = String(set?.title || "").trim().toLowerCase();
  const seen = new Set();
  return (set?.items || []).map((item) => {
    const concept = String(item?.english || item?.chinese || "").trim();
    return concept.toLowerCase() === "lizzard" ? "lizard" : concept;
  }).filter((concept) => {
    const key = concept.toLowerCase();
    if (!key || key === title || (title.length >= 3 && key.includes(title)) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function setCoverPrompt(set, concepts) {
  const setName = [String(set?.title || "").trim(), String(set?.chineseTitle || "").trim()].filter(Boolean).join(" / ");
  if (concepts.length <= 1) return `A clear child-friendly classroom vocabulary cover illustration for the set “${setName}”, showing ${concepts[0] || setName} as one clear subject. Simple warm picture-book style, centred subject, immediately recognisable at small card size, plain light neutral background, minimal visual detail, no border, no label, no letters, no words, no text.`;
  return `A clean child-friendly classroom vocabulary cover illustration for the set “${setName}”. The actual vocabulary concepts are: ${concepts.join(", ")}. Create one cohesive group scene containing 3 to 6 distinct, representative subjects selected only from that list. Show the subjects together with balanced spacing; do not make one subject dominate. Simple warm educational picture-book style, immediately recognisable at small card size, uncluttered composition, plain light neutral background, consistent soft colours, no border, no label, no letters, no words, no text.`;
}

exports.generateVocabularyImage = onCall({
  region: "australia-southeast1",
  secrets: [openaiApiKey],
  timeoutSeconds: 120,
  memory: "1GiB",
  maxInstances: 2
}, async (request) => {
  if (!request.auth?.uid || request.auth.token.email_verified !== true) throw new HttpsError("unauthenticated", "Sign in with a verified teacher account.");
  const setId = requireStableId(request.data?.setId, "Set ID");
  const target = request.data?.target === "set-cover" ? "set-cover" : "item";
  const itemId = target === "set-cover" ? "set-cover" : requireStableId(request.data?.itemId, "Item ID");
  const replaceExisting = request.data?.replaceExisting === true;
  await requireAuthorisedTeacher(request.auth.uid);

  const setSnapshot = await db.doc(`vocabularySets/${setId}`).get();
  if (!setSnapshot.exists || setSnapshot.data()?.deleted === true) throw new HttpsError("not-found", "Vocabulary set not found.");
  const set = setSnapshot.data();
  const item = target === "item" ? (set.items || []).find((candidate) => candidate?.id === itemId) : null;
  if (target === "item" && !item) throw new HttpsError("not-found", "Vocabulary item not found.");
  if (target === "item" && item.image && !replaceExisting) throw new HttpsError("failed-precondition", "This item already has an image. Choose Replace explicitly to generate another candidate.");
  if (target === "set-cover" && set.coverImage && !replaceExisting) throw new HttpsError("failed-precondition", "This set already has a cover image. Choose Replace explicitly to generate another candidate.");
  const concepts = target === "set-cover" ? setCoverConcepts(set) : [];
  const concept = target === "set-cover" ? String(set.title || set.chineseTitle || "Vocabulary set").trim() : generationConcept(item, request.data?.english, request.data?.chinese);
  if (!concept) throw new HttpsError("failed-precondition", target === "set-cover" ? "Add a set title before generating a cover image." : "Add an English meaning or Chinese text before generating an image.");
  const prompt = target === "set-cover" ? setCoverPrompt(set, concepts) : itemImagePrompt(concept);

  const reservation = await reserveGeneration(request.auth.uid, setId, itemId);
  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiApiKey.value()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1024", quality: "low", output_format: "webp", output_compression: 80, n: 1 })
    });
    if (!response.ok) { const details = await response.text(); console.error(`[Vocabulary image API] ${response.status}`, details.slice(0, 500)); throw new HttpsError("internal", "Image generation failed. No vocabulary data was changed."); }
    const result = await response.json();
    const imageBase64 = result.data?.[0]?.b64_json;
    if (!imageBase64) throw new HttpsError("internal", "Image generation returned no image.");
    if (Buffer.byteLength(imageBase64, "base64") >= 2 * 1024 * 1024) throw new HttpsError("resource-exhausted", "The generated image was too large to save safely. Try replacing it with another suggestion.");
    return { imageBase64, contentType: "image/webp", concept, target, requestId: result.data?.[0]?.id || crypto.randomUUID() };
  } catch (error) {
    await releaseFailedGeneration(reservation);
    if (error instanceof HttpsError) throw error;
    console.error("[Vocabulary image generation]", error);
    throw new HttpsError("internal", "Image generation could not complete. No vocabulary data was changed.");
  }
});
