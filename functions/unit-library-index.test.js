const assert = require("node:assert/strict");
const test = require("node:test");
const { buildUnitLibraryIndex, isAllowedPlannerOrigin } = require("./unit-library-index");

test("live Unit Library index allows both Specialist Planner deployment origins", () => {
  assert.equal(isAllowedPlannerOrigin("https://specialistplanner.github.io"), true);
  assert.equal(isAllowedPlannerOrigin("https://specialist-progress-dashboard.vivien-wangwei.chatgpt.site"), true);
  assert.equal(isAllowedPlannerOrigin("https://specialistplanner.github.io.evil.example"), false);
  assert.equal(isAllowedPlannerOrigin("http://specialistplanner.github.io"), false);
});

test("live Unit Library index exposes only stable metadata and canonical links", () => {
  const index = buildUnitLibraryIndex([
    { id: "year-2-family", yearLevel: 2, englishTitle: "Family", privateNote: "never expose", lessons: [{ id: "family-l1", title: "Introduction", activities: ["private"] }] },
    { id: "deleted", yearLevel: 1, englishTitle: "Deleted", deleted: true, lessons: [] },
  ], "2026-09-05T00:00:00.000Z");
  assert.equal(index.units.length, 1);
  assert.deepEqual(index.units[0], {
    id: "year-2-family",
    yearLevel: 2,
    title: "Family",
    url: "https://themandarinroom.github.io/units/view.html?unit=year-2-family",
    lessons: [{ id: "family-l1", title: "Introduction", url: "https://themandarinroom.github.io/units/view.html?unit=year-2-family&lesson=family-l1" }],
  });
  assert.equal(JSON.stringify(index).includes("private"), false);
});

test("teacher-only lessons (e.g. assessments) never appear in the public index", () => {
  const index = buildUnitLibraryIndex([{ id: "year-5-nationalities", yearLevel: 5, englishTitle: "Nationalities", lessons: [
    { id: "l1", title: "Introduction" }, { id: "l2", title: "Speaking Assessment", teacherOnly: true }, { id: "l3", title: "Review", teacherOnly: false }] }]);
  assert.deepEqual(index.units[0].lessons.map((lesson) => lesson.title), ["Introduction", "Review"]);
  assert.equal(JSON.stringify(index).includes("Assessment"), false);
});
