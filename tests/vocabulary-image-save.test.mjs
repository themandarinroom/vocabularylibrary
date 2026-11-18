import test from "node:test";
import assert from "node:assert/strict";
import { COVER_KEY, applyImageChanges, cleanUpSuperseded, isManagedImagePath, saveSetWithImages, supersededImages, unreferencedImages } from "../js/vocabulary-image-save.js";

const url = (path) => `https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(path)}?alt=media&token=t`;
const managed = (setId, key, rev) => { const path = `vocabulary/${setId}/${key}/image-${rev}.webp`; return { path, url: url(path) }; };
const oldCover = managed("year1-pets", "cover", 100);
const oldDog = managed("year1-pets", "dog", 101);
const external = "https://example.org/cat.png";
function baseSet() {
  return {
    id: "year1-pets", yearLevel: 1, title: "Pets", chineseTitle: "宠物", description: "",
    coverImage: oldCover.url, coverImageStoragePath: oldCover.path, coverImageGenerated: true,
    items: [
      { id: "dog", chinese: "狗", pinyin: "gou", english: "dog", image: oldDog.url, imageStoragePath: oldDog.path, imageGenerated: true, audio: { aiEnabled: true, teacherAudioUrl: "keep-me" } },
      { id: "cat", chinese: "猫", pinyin: "mao", english: "cat", image: external, audio: { aiEnabled: false } },
      { id: "pets", chinese: "宠物", pinyin: "chong wu", english: "pets", image: oldCover.url, imageSource: "set-cover", audio: { aiEnabled: true } }
    ]
  };
}
const blob = { size: 1000 };
function fakeDeps({ failUploadAt = -1, failSave = false, otherSets = [], listFails = false } = {}) {
  const calls = { uploads: [], deletes: [], saves: [] };
  let n = 0;
  return {
    calls,
    deps: {
      upload: async (setId, key) => { if (n === failUploadAt) { n += 1; throw Object.assign(new Error("net"), { code: "storage/retry-limit-exceeded" }); } const m = managed(setId, key, 200 + n++); calls.uploads.push(m.path); return { imageUrl: m.url, imageStoragePath: m.path }; },
      saveSet: async (set) => { if (failSave) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }); calls.saves.push(set); return set; },
      deleteImage: async (path) => { calls.deletes.push(path); },
      listSetsStrict: async () => { if (listFails) throw new Error("offline"); return otherSets; }
    }
  };
}

test("managed path recognition only accepts app-owned vocabulary images", () => {
  assert.ok(isManagedImagePath("vocabulary/year1-pets/cover/image-1.webp"));
  assert.ok(!isManagedImagePath("vocabulary/year1-pets/dog/teacher-voice-1"));
  assert.ok(!isManagedImagePath("units/u/l/worked-example-a.webp"));
  assert.ok(!isManagedImagePath("vocabulary/../x/image-1.webp"));
  assert.ok(!isManagedImagePath(null));
});

test("cover upload replaces cover, updates items following the cover, keeps other data", () => {
  const set = baseSet();
  const next = applyImageChanges(set, new Map([[COVER_KEY, { kind: "upload", blob }]]), new Map([[COVER_KEY, { imageUrl: "new-url", imageStoragePath: "vocabulary/year1-pets/cover/image-9.webp" }]]));
  assert.equal(next.coverImage, "new-url");
  assert.equal(next.coverImageGenerated, false);
  assert.equal(next.items[2].image, "new-url");
  assert.equal(next.items[0].image, oldDog.url);
  assert.equal(next.items[0].audio.teacherAudioUrl, "keep-me");
  assert.equal(set.coverImage, oldCover.url, "input set is not mutated");
});

test("item upload replaces AI image and clears AI metadata; removal clears image", () => {
  const next = applyImageChanges(baseSet(), new Map([["dog", { kind: "upload", blob }], ["cat", { kind: "remove" }]]), new Map([["dog", { imageUrl: "dog-new", imageStoragePath: "vocabulary/year1-pets/dog/image-9.webp" }]]));
  assert.deepEqual([next.items[0].image, next.items[0].imageSource, next.items[0].imageGenerated], ["dog-new", "upload", undefined]);
  assert.equal(next.items[1].image, null);
  assert.equal(next.items[1].chinese, "猫");
});

test("successful save uploads, saves once, then deletes only unreferenced superseded managed images", async () => {
  const { deps, calls } = fakeDeps({ otherSets: [] });
  const set = baseSet();
  const result = await saveSetWithImages({ set, previousSet: baseSet(), originalId: set.id, pending: new Map([[COVER_KEY, { kind: "upload", blob }], ["dog", { kind: "upload", blob }]]), deps });
  assert.ok(result.ok);
  assert.equal(calls.uploads.length, 2);
  assert.equal(calls.saves.length, 1);
  assert.deepEqual(calls.deletes.sort(), [oldCover.path, oldDog.path].sort());
});

test("replacing an external URL image never deletes the external image", async () => {
  const { deps, calls } = fakeDeps();
  const result = await saveSetWithImages({ set: baseSet(), previousSet: baseSet(), originalId: "year1-pets", pending: new Map([["cat", { kind: "upload", blob }]]), deps });
  assert.ok(result.ok);
  assert.deepEqual(calls.deletes, []);
});

test("an image still used by another set (e.g. a duplicate) is retained", async () => {
  const duplicate = { id: "year1-pets-copy", coverImage: null, items: [{ id: "dog-x", image: oldDog.url }] };
  const { deps, calls } = fakeDeps({ otherSets: [duplicate] });
  const result = await saveSetWithImages({ set: baseSet(), previousSet: baseSet(), originalId: "year1-pets", pending: new Map([["dog", { kind: "remove" }]]), deps });
  assert.ok(result.ok);
  assert.deepEqual(calls.deletes, []);
  assert.deepEqual(result.cleanup.retained, [oldDog.path]);
});

test("cover removal keeps the cover file when an item in this set still uses its URL directly", async () => {
  const set = baseSet();
  set.items[1].image = oldCover.url; // explicit URL copy, not following the cover
  const { deps, calls } = fakeDeps();
  await saveSetWithImages({ set, previousSet: baseSet(), originalId: set.id, pending: new Map([[COVER_KEY, { kind: "remove" }]]), deps });
  assert.ok(!calls.deletes.includes(oldCover.path));
});

test("upload failure rolls back earlier uploads and never writes the set", async () => {
  const { deps, calls } = fakeDeps({ failUploadAt: 1 });
  const result = await saveSetWithImages({ set: baseSet(), previousSet: baseSet(), originalId: "year1-pets", pending: new Map([[COVER_KEY, { kind: "upload", blob }], ["dog", { kind: "upload", blob }]]), deps });
  assert.equal(result.ok, false);
  assert.equal(result.phase, "upload");
  assert.equal(calls.saves.length, 0);
  assert.deepEqual(calls.deletes, [calls.uploads[0]]);
  assert.match(result.message, /timed out|Upload failed/);
});

test("Firestore failure deletes the new uploads, keeps old images, and reports auth expiry", async () => {
  const { deps, calls } = fakeDeps({ failSave: true });
  const result = await saveSetWithImages({ set: baseSet(), previousSet: baseSet(), originalId: "year1-pets", pending: new Map([["dog", { kind: "upload", blob }]]), deps });
  assert.equal(result.ok, false);
  assert.equal(result.phase, "save");
  assert.deepEqual(calls.deletes, calls.uploads);
  assert.ok(!calls.deletes.includes(oldDog.path));
  assert.match(result.message, /sign-in has expired/);
});

test("pending map is not consumed on failure, so the teacher can retry", async () => {
  const pending = new Map([["dog", { kind: "upload", blob }]]);
  await saveSetWithImages({ set: baseSet(), previousSet: baseSet(), originalId: "year1-pets", pending, deps: fakeDeps({ failSave: true }).deps });
  assert.equal(pending.size, 1);
  const retry = await saveSetWithImages({ set: baseSet(), previousSet: baseSet(), originalId: "year1-pets", pending, deps: fakeDeps().deps });
  assert.ok(retry.ok);
});

test("reference check failure retains every superseded image", async () => {
  const { deps, calls } = fakeDeps({ listFails: true });
  const result = await cleanUpSuperseded(baseSet(), { ...baseSet(), coverImage: null, coverImageStoragePath: null, items: [] }, deps);
  assert.deepEqual(calls.deletes, []);
  assert.equal(result.retained.length, 2);
});

test("deleting an item from the set cleans up its managed image (no orphan)", () => {
  const saved = baseSet(); saved.items = saved.items.filter((item) => item.id !== "dog");
  assert.deepEqual(supersededImages(baseSet(), saved).map((r) => r.path), [oldDog.path]);
});

test("new sets have nothing to clean up", async () => {
  const { deps, calls } = fakeDeps();
  const set = { ...baseSet(), id: "year2-new", coverImage: null, coverImageStoragePath: null, items: [{ id: "a", image: null, audio: {} }] };
  const result = await saveSetWithImages({ set, previousSet: null, pending: new Map([["a", { kind: "upload", blob }]]), deps });
  assert.ok(result.ok);
  assert.equal(calls.uploads[0], "vocabulary/year2-new/a/image-200.webp");
  assert.deepEqual(calls.deletes, []);
});

test("pending entries for items deleted before saving are ignored", async () => {
  const { deps, calls } = fakeDeps();
  await saveSetWithImages({ set: baseSet(), previousSet: baseSet(), originalId: "year1-pets", pending: new Map([["ghost", { kind: "upload", blob }]]), deps });
  assert.equal(calls.uploads.length, 0);
});

test("unreferencedImages ignores the set being saved", () => {
  assert.equal(unreferencedImages([oldDog], [baseSet()], "year1-pets").length, 1);
});
