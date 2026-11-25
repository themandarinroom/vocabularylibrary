// Staging-only, explicit student publication. Original Unit documents are read,
// never changed. This module does not publish anything when it is loaded.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const TOPICS = new Set(['numbers','family','food','animals','weather','countries','school','colours','body-parts','time','people','culture']);
const fail = (code, message) => { throw new HttpsError(code, message); };
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== allowed.length || !allowed.every(key => Object.hasOwn(value, key))) fail('invalid-argument', 'Unexpected or missing publication fields.');
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('invalid-argument', 'Invalid student-facing text.');
  return value;
}
function stableId(value, max = 80) {
  if (typeof value !== 'string' || value.length > max || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) fail('invalid-argument', 'Invalid stable ID.');
  return value;
}
function uniqueList(value, max) {
  if (!Array.isArray(value) || value.length > max || value.some(item => typeof item !== 'string') || new Set(value).size !== value.length) fail('invalid-argument', 'Invalid or duplicate selections.');
  return value;
}
function publicUrl(value) {
  text(value, 2000, true);
  let parsed; try { parsed = new URL(value); } catch { fail('invalid-argument', 'Invalid public resource URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail('invalid-argument', 'Student resources require HTTPS URLs without credentials.');
  return value;
}
function sourceVersion(unit) {
  const stamp = unit.updatedAt;
  if (!Number.isInteger(stamp?.seconds) || !Number.isInteger(stamp?.nanoseconds)) fail('failed-precondition', 'The source Unit needs a valid cloud revision.');
  return `${stamp.seconds}:${stamp.nanoseconds}`;
}
function projection(unit, input) {
  keys(input, ['description', 'topics', 'lessons']);
  const topics = uniqueList(input.topics, 12);
  if (!topics.length || topics.some(topic => !TOPICS.has(topic))) fail('invalid-argument', 'Select at least one reviewed topic.');
  if (!Number.isInteger(unit.yearLevel) || unit.yearLevel < 0 || unit.yearLevel > 6) fail('failed-precondition', 'Invalid source recommended year.');
  if (!Array.isArray(input.lessons) || !input.lessons.length || input.lessons.length > 30 || !Array.isArray(unit.lessons)) fail('invalid-argument', 'Approve 1–30 lessons.');
  const sourceIds = unit.lessons.map(lesson => lesson.id);
  if (new Set(sourceIds).size !== sourceIds.length) fail('failed-precondition', 'Source lesson IDs are not unique.');
  let lastIndex = -1;
  const lessons = input.lessons.map(selection => {
    keys(selection, ['id','includeLearningIntention','content','includeVocabulary','includeSpeaking','resourceUrls','workedExampleIds']);
    stableId(selection.id, 100);
    const index = sourceIds.indexOf(selection.id);
    if (index <= lastIndex || index < 0) fail('invalid-argument', 'Selected lessons must be unique and retain source order.');
    lastIndex = index;
    const source = unit.lessons[index];
    for (const key of ['includeLearningIntention','includeVocabulary','includeSpeaking']) if (typeof selection[key] !== 'boolean') fail('invalid-argument', 'Every field selection must be explicit.');
    const resourceUrls = uniqueList(selection.resourceUrls, 30);
    const sourceResources = String(source.resources || '').split('\n').map(line => line.trim()).filter(Boolean);
    const links = resourceUrls.map((url, i) => {
      if (!sourceResources.includes(url)) fail('invalid-argument', 'A selected resource is not in the source lesson.');
      return { label: `Resource ${i + 1}`, url: publicUrl(url) };
    });
    if (selection.includeVocabulary) links.unshift({ label: 'Vocabulary', url: `https://themandarinroom.github.io/vocabularylibrary/?set=${encodeURIComponent(stableId(source.vocabularySetId))}` });
    if (selection.includeSpeaking) links.push({ label: 'Speaking', url: `https://themandarinroom.github.io/speaking/student.html?practice=${encodeURIComponent(stableId(source.speakingPracticeId))}` });
    const workedExamples = uniqueList(selection.workedExampleIds, 12).map(id => {
      stableId(id, 100);
      const example = (source.workedExamples || []).find(item => item.id === id);
      if (!example) fail('invalid-argument', 'A selected worked example is not in the source lesson.');
      return { url: publicUrl(example.url), alt: text(example.alt || '', 300) };
    });
    return { id: selection.id, title: text(source.title, 120, true),
      learningIntention: selection.includeLearningIntention ? text(source.learningIntention || '', 1000) : '',
      content: text(selection.content, 5000), links, workedExamples };
  });
  return { yearLevel: unit.yearLevel, englishTitle: text(unit.englishTitle, 100, true), chineseTitle: text(unit.chineseTitle || '', 100),
    description: text(input.description, 1000), topics: [...topics], lessons };
}
function createPublicUnitHandlers({ db, projectId }) {
  const demo = /^demo-[a-z0-9-]+$/.test(projectId || '') && /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
  if (projectId !== 'the-mandarin-room-staging' && !demo) throw new Error('Public Unit publication requires the explicit staging project.');
  function identity(request) {
    if (!request.auth?.uid) fail('unauthenticated', 'Teacher sign-in is required.');
    if (request.auth.token?.email_verified !== true) fail('permission-denied', 'A verified teacher email is required.');
    return request.auth.uid;
  }
  async function teacher(tx, uid) {
    const snap = await tx.get(db.doc(`authorizedTeachers/${uid}`));
    if (!snap.exists || snap.data().active !== true) fail('permission-denied', 'This teacher is not authorised.');
  }
  function validate(input, publish) {
    keys(input, publish ? ['unitId','expectedRevision','sourceVersion','approved','student'] : ['unitId','expectedRevision']);
    stableId(input.unitId);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= Number.MAX_SAFE_INTEGER) fail('invalid-argument', 'Invalid expected revision.');
    if (publish && (input.approved !== true || typeof input.sourceVersion !== 'string')) fail('invalid-argument', 'Explicit Unit approval and source revision are required.');
  }
  function revision(snapshot, expected) {
    if ((snapshot.exists ? snapshot.data().revision : 0) !== expected) fail('aborted', 'Publication changed. Reload before continuing.');
    return expected + 1;
  }
  return {
    async publishPublicUnit(request) {
      const uid = identity(request), input = request.data; validate(input, true);
      return db.runTransaction(async tx => {
        await teacher(tx, uid);
        const source = await tx.get(db.doc(`units/${input.unitId}`));
        const ref = db.doc(`publicUnits/${input.unitId}`), previous = await tx.get(ref);
        if (!source.exists || source.data().id !== input.unitId || source.data().deleted === true) fail('failed-precondition', 'Source Unit is unavailable.');
        if (sourceVersion(source.data()) !== input.sourceVersion) fail('aborted', 'Source Unit changed. Review it again before approving.');
        const nextRevision = revision(previous, input.expectedRevision);
        const safe = projection(source.data(), input.student);
        if (Buffer.byteLength(JSON.stringify(safe), 'utf8') > 900000) fail('invalid-argument', 'Approved student content exceeds the safe document size.');
        tx.set(ref, { id: input.unitId, schemaVersion: 1, ...safe, published: true, approvedForStudents: true, revision: nextRevision });
        return { unitId: input.unitId, revision: nextRevision, published: true };
      });
    },
    async unpublishPublicUnit(request) {
      const uid = identity(request), input = request.data; validate(input, false);
      return db.runTransaction(async tx => {
        await teacher(tx, uid);
        const ref = db.doc(`publicUnits/${input.unitId}`), previous = await tx.get(ref);
        if (!previous.exists) fail('not-found', 'This Unit has no student publication.');
        const nextRevision = revision(previous, input.expectedRevision);
        tx.set(ref, { id: input.unitId, schemaVersion: 1, revision: nextRevision, published: false, approvedForStudents: false });
        return { unitId: input.unitId, revision: nextRevision, published: false };
      });
    }
  };
}
let handlers;
function service() {
  if (!handlers) handlers = createPublicUnitHandlers({ db: getFirestore(), projectId: getApp().options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT });
  return handlers;
}
const options = { region: 'australia-southeast1', maxInstances: 2, timeoutSeconds: 30, memory: '256MiB' };
exports.publishPublicUnit = onCall(options, request => service().publishPublicUnit(request));
exports.unpublishPublicUnit = onCall(options, request => service().unpublishPublicUnit(request));
exports.createPublicUnitHandlers = createPublicUnitHandlers;
