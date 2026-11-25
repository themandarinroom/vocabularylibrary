const { onRequest } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");

const UNIT_LIBRARY_PROVIDER = "the-mandarin-room-unit-library";
const UNIT_LIBRARY_BASE_URL = "https://themandarinroom.github.io/units";
const PLANNER_ORIGINS = new Set([
  "https://specialist-progress-dashboard.vivien-wangwei.chatgpt.site",
  "https://specialistplanner.github.io",
]);

function isAllowedPlannerOrigin(origin) {
  return PLANNER_ORIGINS.has(origin);
}

function unitLibraryUrl(unitId, lessonId) {
  const params = new URLSearchParams({ unit: unitId });
  if (lessonId) params.set("lesson", lessonId);
  return `${UNIT_LIBRARY_BASE_URL}/view.html?${params.toString()}`;
}

function buildUnitLibraryIndex(units, generatedAt = new Date().toISOString()) {
  const visibleUnits = units
    .filter((unit) => unit && unit.deleted !== true && String(unit.id || "").trim())
    .map((unit) => ({
      id: String(unit.id),
      yearLevel: Number(unit.yearLevel),
      title: String(unit.englishTitle || unit.title || unit.id),
      url: unitLibraryUrl(String(unit.id)),
      lessons: (Array.isArray(unit.lessons) ? unit.lessons : [])
        .filter((lesson) => lesson && String(lesson.id || "").trim())
        .map((lesson) => ({
          id: String(lesson.id),
          title: String(lesson.title || lesson.id),
          url: unitLibraryUrl(String(unit.id), String(lesson.id)),
        })),
    }))
    .sort((a, b) => a.yearLevel - b.yearLevel || a.title.localeCompare(b.title));

  return { schemaVersion: 1, provider: UNIT_LIBRARY_PROVIDER, generatedAt, units: visibleUnits };
}

exports.buildUnitLibraryIndex = buildUnitLibraryIndex;
exports.isAllowedPlannerOrigin = isAllowedPlannerOrigin;
exports.unitLibraryIndex = onRequest({
  region: "australia-southeast1",
  maxInstances: 2,
  timeoutSeconds: 30,
}, async (request, response) => {
  const origin = request.get("Origin");
  response.set("Vary", "Origin");
  response.set("Cache-Control", "no-store, max-age=0");
  if (isAllowedPlannerOrigin(origin)) response.set("Access-Control-Allow-Origin", origin);
  if (request.method === "OPTIONS") {
    response.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Accept");
    response.status(isAllowedPlannerOrigin(origin) ? 204 : 403).send("");
    return;
  }
  if (request.method !== "GET") {
    response.set("Allow", "GET, OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const snapshot = await getFirestore().collection("units").get();
    const units = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    response.status(200).json(buildUnitLibraryIndex(units));
  } catch (error) {
    console.error("[Unit Library index]", error);
    response.status(503).json({ error: "Unit Library is temporarily unavailable" });
  }
});
