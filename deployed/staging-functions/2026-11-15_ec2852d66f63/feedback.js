const { createHmac } = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldPath, FieldValue, Timestamp } = require("firebase-admin/firestore");

const options = {
  region: "australia-southeast1", timeoutSeconds: 20, maxInstances: 4,
  cors: ["https://themandarinroom.github.io", /^http:\/\/(127\.0\.0\.1|localhost):8765$/]
};
const rateSecret = defineSecret("LIVE_SESSION_TOKEN_PEPPER");
const statuses = ["pending", "approved", "rejected"];
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const emailPattern = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;
const publicEmailPattern = /[^\s@]+@[^\s@.]+\.[^\s@.]+/u;
const windowMs = 10 * 60 * 1000;
const pageSize = 10;

function check(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function fields(data, allowed) {
  check(data && typeof data === "object" && !Array.isArray(data) &&
    Object.keys(data).every(key => allowed.includes(key)),
  "invalid-argument", "Unexpected feedback fields.");
}

function text(value, max) {
  if (value === undefined) return "";
  check(typeof value === "string" && value.length <= max, "invalid-argument", "Invalid text length.");
  return value.trim();
}

function validateSubmission(data) {
  fields(data, ["id", "displayName", "email", "rating", "comment", "feedbackCheck"]);
  check(typeof data.id === "string" && idPattern.test(data.id), "invalid-argument", "Invalid request ID.");
  check(data.feedbackCheck === undefined || data.feedbackCheck === "", "invalid-argument", "Invalid submission.");
  const displayName = text(data.displayName, 80);
  const email = text(data.email, 254);
  const comment = text(data.comment, 2000);
  const rating = data.rating ?? null;
  check(rating === null || (Number.isInteger(rating) && rating >= 1 && rating <= 5),
    "invalid-argument", "Invalid rating.");
  check(rating !== null || comment, "invalid-argument", "Provide a rating or a comment.");
  check(!email || emailPattern.test(email), "invalid-argument", "Invalid email address.");
  check(!publicEmailPattern.test(displayName.normalize("NFKC")) && !publicEmailPattern.test(comment.normalize("NFKC")),
    "invalid-argument", "Use the private email field for email addresses.");
  return { displayName, email, rating, comment };
}

function publicFields({ displayName, rating, comment, createdAt }) {
  return { displayName, rating, comment, createdAt };
}

function wireRecord(doc, includePrivate) {
  const data = doc.data();
  const { createdAt, ...entry } = publicFields(data);
  return {
    id: doc.id,
    ...entry,
    createdAt: createdAt.toDate().toISOString(),
    ...(includePrivate ? { email: data.email, status: data.status } : {})
  };
}

function assertSize(request) {
  check((request.rawRequest.rawBody?.length ?? 0) <= 16384,
    "invalid-argument", "Feedback request is too large.");
}

async function assertAdmin(db, auth, transaction) {
  check(auth?.token?.email_verified === true, "permission-denied", "Administrator access required.");
  const ref = db.doc(`authorizedTeachers/${auth.uid}`);
  const teacher = transaction ? await transaction.get(ref) : await ref.get();
  check(teacher.data()?.active === true, "permission-denied", "Administrator access required.");
}

function buildHandlers(db, { now = Date.now, pepper = () => rateSecret.value() } = {}) {
  async function submit(request) {
    assertSize(request);
    const entry = validateSubmission(request.data);
    const submission = db.doc(`feedbackSubmissions/${request.data.id}`);
    const time = now();
    const window = Math.floor(time / windowMs);
    const source = createHmac("sha256", pepper())
      .update(`${window}:${request.rawRequest.ip || "unknown"}`).digest("hex");
    const globalRef = db.doc("feedbackRateLimits/global");
    const sourceRef = db.doc(`feedbackRateLimits/${source}`);

    await db.runTransaction(async tx => {
      const [existing, globalLimit, sourceLimit] = await tx.getAll(submission, globalRef, sourceRef);
      if (existing.exists) {
        check(Object.keys(entry).every(key => existing.get(key) === entry[key]),
          "already-exists", "This request ID has already been used.");
        return;
      }

      const globalCount = globalLimit.get("window") === window ? globalLimit.get("count") : 0;
      const sourceCount = sourceLimit.get("count") ?? 0;
      check(globalCount < 120 && sourceCount < 10, "resource-exhausted", "Please try again later.");
      tx.set(globalRef, { window, count: globalCount + 1 });
      tx.set(sourceRef, { count: sourceCount + 1, expiresAt: Timestamp.fromMillis((window + 1) * windowMs) });
      tx.create(submission, {
        ...entry, status: "pending", createdAt: FieldValue.serverTimestamp(),
        reviewedAt: null, reviewedBy: null
      });
    });
    return { accepted: true };
  }

  async function list(request, admin = false) {
    assertSize(request);
    const data = request.data;
    fields(data, admin ? ["action", "status", "cursor"] : ["cursor"]);
    let query;
    if (admin) {
      await assertAdmin(db, request.auth);
      check(statuses.includes(data.status), "invalid-argument", "Invalid status.");
      query = db.collection("feedbackSubmissions").where("status", "==", data.status)
        .orderBy(FieldPath.documentId(), "desc");
    } else {
      query = db.collection("publicFeedback").orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc");
    }

    if (data.cursor !== undefined && data.cursor !== null) {
      const cursor = data.cursor;
      fields(cursor, admin ? ["id"] : ["id", "seconds", "nanoseconds"]);
      check(typeof cursor.id === "string" && idPattern.test(cursor.id), "invalid-argument", "Invalid page cursor.");
      if (admin) query = query.startAfter(cursor.id);
      else {
        check(Number.isInteger(cursor.seconds) && cursor.seconds >= 0 && cursor.seconds <= 253402300799 &&
          Number.isInteger(cursor.nanoseconds) && cursor.nanoseconds >= 0 && cursor.nanoseconds < 1e9,
        "invalid-argument", "Invalid page cursor.");
        query = query.startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), cursor.id);
      }
    }
    const result = await query.limit(pageSize + 1).get();
    const page = result.docs.slice(0, pageSize);
    let cursor = null;
    if (result.docs.length > pageSize) {
      const last = page.at(-1);
      cursor = { id: last.id };
      if (!admin) {
        const createdAt = last.get("createdAt");
        Object.assign(cursor, { seconds: createdAt.seconds, nanoseconds: createdAt.nanoseconds });
      }
    }
    return { entries: page.map(doc => wireRecord(doc, admin)), cursor };
  }

  async function moderate(request) {
    assertSize(request);
    const { data } = request;
    if (data?.action === "list") return list(request, true);
    fields(data, ["id", "action", "expectedStatus"]);
    check(typeof data.id === "string" && idPattern.test(data.id) &&
      ["approve", "reject", "delete"].includes(data.action) && statuses.includes(data.expectedStatus),
    "invalid-argument", "Invalid moderation request.");
    const privateRef = db.doc(`feedbackSubmissions/${data.id}`);
    const publicRef = db.doc(`publicFeedback/${data.id}`);
    await db.runTransaction(async tx => {
      await assertAdmin(db, request.auth, tx);
      const submission = await tx.get(privateRef);
      check(submission.exists, "not-found", "Feedback no longer exists.");
      check(submission.get("status") === data.expectedStatus, "failed-precondition", "Feedback already changed. Refresh the list.");
      if (data.action === "delete") {
        tx.delete(privateRef);
        tx.delete(publicRef);
        return;
      }
      const status = data.action === "approve" ? "approved" : "rejected";
      tx.update(privateRef, { status, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: request.auth.uid });
      if (status === "approved") tx.set(publicRef, publicFields(submission.data()));
      else tx.delete(publicRef);
    });
    return { updated: true };
  }

  return { submit, list, moderate };
}

function feedbackFunctions() {
  const handlers = buildHandlers(getFirestore());
  return {
    submitFeedback: onCall({ ...options, secrets: [rateSecret] }, handlers.submit),
    listPublicFeedback: onCall(options, request => handlers.list(request)),
    moderateFeedback: onCall(options, handlers.moderate)
  };
}

module.exports = { feedbackFunctions, buildHandlers };
