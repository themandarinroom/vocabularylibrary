const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { buildHandlers } = require("./feedback");

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host || "")) throw Error("Local emulator required.");
const projectId = "demo-feedback";
const root = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
const request = (data, ip = "192.0.2.10", auth) => ({ data, rawRequest: { ip }, auth });
const admin = { uid: "feedback-admin", token: { email_verified: true } };
const rejectCode = (promise, code) => assert.rejects(promise, { code });

test("feedback submission, access, atomic moderation, and pagination against Firestore rules", async t => {
  const app = initializeApp({ projectId }, "feedback-tests");
  const db = getFirestore(app);
  const { submit, list, moderate } = buildHandlers(db, { pepper: () => "local-test-pepper" });
  const rating = { id: randomUUID(), rating: 1 };
  const comment = { id: randomUUID(), comment: "这是留言。<script>text</script>", email: "private@example.test" };
  const combined = { id: randomUUID(), displayName: "测试", rating: 4, comment: "Feedback" };
  const action = (id, action, expectedStatus, auth = admin) => moderate(request({ id, action, expectedStatus }, undefined, auth));
  const adminList = status => moderate(request({ action: "list", status }, undefined, admin));

  try {
    const reset = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
    assert.ok(reset.ok);
    await db.doc(`authorizedTeachers/${admin.uid}`).set({ active: true });
    await db.doc("authorizedTeachers/inactive").set({ active: false });

    await t.test("rejects invalid, oversized, empty and spam submissions", async () => {
      for (const data of [{}, { name: "only" }, { comment: "  " }, { rating: 6 }, { rating: 1.5 },
        { rating: "5" }, { rating: 1, email: "incorrect@" }, { comment: "x".repeat(2001) },
        { displayName: "private@example.test", rating: 1 }, { comment: "Mail me at private@example.test" },
        { comment: "x", status: "approved" }, { comment: "spam", feedbackCheck: "filled" }]) {
        await rejectCode(submit(request({ id: randomUUID(), ...data })), "invalid-argument");
      }
      await rejectCode(submit({ ...request(rating), rawRequest: { rawBody: Buffer.alloc(16385) } }), "invalid-argument");
    });

    await t.test("rating only, comment only and both are pending; concurrent retries create one record", async () => {
      assert.deepEqual(await Promise.all([submit(request(rating)), submit(request(rating))]),
        [{ accepted: true }, { accepted: true }]);
      await rejectCode(submit(request({ ...rating, rating: 2 })), "already-exists");
      await submit(request(comment));
      await submit(request(combined));
      assert.deepEqual(await list(request({})), { entries: [], cursor: null });
      assert.equal((await db.collection("feedbackSubmissions").get()).size, 3);
      const pending = await adminList("pending");
      assert.equal(pending.entries.length, 3);
      assert.equal(pending.entries.find(entry => entry.id === comment.id).email, comment.email);
      assert.equal(pending.entries.find(entry => entry.id === rating.id).displayName, "");
      assert.equal((await db.doc(`feedbackSubmissions/${rating.id}`).get()).get("createdAt").toDate() instanceof Date, true);
    });

    await t.test("FireStore rules and live allowlist deny anonymous, inactive and unverified requests", async () => {
      for (const auth of [undefined, { ...admin, token: { email_verified: false } }, { ...admin, uid: "inactive" }]) {
        await rejectCode(moderate(request({ action: "list", status: "pending" }, undefined, auth)), "permission-denied");
        await rejectCode(moderate(request({ id: comment.id, action: "approve", expectedStatus: "pending" }, undefined, auth)), "permission-denied");
      }
      for (const collection of ["feedbackSubmissions", "publicFeedback", "feedbackRateLimits"]) {
        for (const [method,url] of [
          ["GET",`${root}/${collection}`], ["GET",`${root}/${collection}/${comment.id}`],
          ["PATCH",`${root}/${collection}/${comment.id}`]
        ]) {
          const options = method === "PATCH" ? { method, headers: {"Content-Type":"application/json"}, body:'{"fields":{}}' } : { method };
          const response = await fetch(url,options);
          assert.equal(response.status,403,`${method} ${collection}`);
        }
      }
    });

    await t.test("critical ratings are unchanged; published projections omit email and reject/delete retract them", async () => {
      await action(rating.id,"approve","pending");
      await action(comment.id,"approve","pending");
      await action(combined.id,"reject","pending");
      const page = await list(request({}));
      assert.deepEqual(page.entries.map(entry => entry.id),[comment.id,rating.id]);
      assert.equal(page.entries[1].rating,1);
      assert.equal(page.entries[0].comment,comment.comment);
      for (const entry of page.entries) assert.deepEqual(Object.keys(entry).sort(), ["comment","createdAt","displayName","id","rating"]);
      assert.deepEqual(Object.keys((await db.doc(`publicFeedback/${comment.id}`).get()).data()).sort(),
        ["comment","createdAt","displayName","rating"]);
      const reviewed = (await db.doc(`feedbackSubmissions/${comment.id}`).get()).data();
      assert.equal(reviewed.reviewedBy,admin.uid);
      assert.ok(reviewed.reviewedAt.toMillis() >= reviewed.createdAt.toMillis());
      await rejectCode(action(comment.id,"delete","pending"),"failed-precondition");
      await action(comment.id,"reject","approved");
      await action(rating.id,"delete","approved");
      assert.equal((await db.doc(`feedbackSubmissions/${rating.id}`).get()).exists,false);
      assert.equal((await adminList("rejected")).entries.length,2);
      assert.deepEqual((await list(request({}))).entries,[]);
    });

    await t.test("per-source quota and public pagination with a deleted cursor", async () => {
      const ids = [];
      for (let i = 0; i < 12; i++) {
        const id = randomUUID();
        ids.push(id);
        await submit(request({ id, rating: 2 },i < 10 ? "192.0.2.20" : "192.0.2.21"));
        await action(id,"approve","pending");
      }
      await rejectCode(submit(request({ id: randomUUID(), rating: 1 },"192.0.2.20")),"resource-exhausted");
      const first = await list(request({}));
      assert.deepEqual(first.entries.map(entry => entry.id),ids.slice(2).reverse());
      await action(first.cursor.id,"delete","approved");
      const last = await list(request({ cursor: first.cursor }));
      assert.deepEqual(last.entries.map(entry => entry.id),ids.slice(0,2).reverse());
      assert.equal(last.cursor,null);
      const approved = await adminList("approved");
      assert.equal(approved.entries.length,10);
      const more = await moderate(request({ action:"list", status:"approved", cursor:approved.cursor },undefined,admin));
      assert.equal(more.entries.length,1);
    });
  } finally {
    await deleteApp(app);
  }
});
