// Journey configuration for staging and production. No Unit content is copied or modified.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getApp } = require('firebase-admin/app');

const ALLOWED_PROJECTS = new Set(['the-mandarin-room-staging', 'the-mandarin-room']);
const STATUS = new Set(['completed', 'current', 'upcoming']);
const fail = (code, message) => { throw new HttpsError(code, message); };
const gradeKey = year => year === 0 ? 'prep' : `year-${year}`;
const journeyId = (academicYear, yearLevel) => `${academicYear}_${gradeKey(yearLevel)}`;
const CONFIG = 'journeyConfig/public';

function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== allowed.length ||
      !allowed.every(key => Object.hasOwn(value, key))) {
    fail('invalid-argument', 'Unexpected or missing fields.');
  }
}
function validateInput(input, save) {
  fields(input, save ? ['academicYear', 'yearLevel', 'placements', 'expectedRevision'] : ['academicYear', 'yearLevel', 'expectedRevision']);
  if (!Number.isInteger(input.academicYear) || input.academicYear < 2000 || input.academicYear > 2100 ||
      !Number.isInteger(input.yearLevel) || input.yearLevel < 0 || input.yearLevel > 6 ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= Number.MAX_SAFE_INTEGER) {
    fail('invalid-argument', 'Invalid academic year, year level or revision.');
  }
  if (save) validatePlacements(input.placements);
  return { id: journeyId(input.academicYear, input.yearLevel), grade: gradeKey(input.yearLevel) };
}
function validatePlacements(placements) {
  if (!Array.isArray(placements) || placements.length > 100) fail('invalid-argument', 'A Journey supports up to 100 placements.');
  const seen = new Set();
  let current = 0;
  for (const placement of placements) {
    fields(placement, ['unitId', 'status']);
    if (typeof placement.unitId !== 'string' || placement.unitId.length > 80 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(placement.unitId) || !STATUS.has(placement.status)) {
      fail('invalid-argument', 'Invalid Unit ID or Journey status.');
    }
    if (seen.has(placement.unitId)) fail('invalid-argument', 'Unit IDs must be unique within a Journey.');
    seen.add(placement.unitId);
    if (placement.status === 'current' && ++current > 1) fail('invalid-argument', 'Only one Unit may be Current.');
  }
}

function createJourneyHandlers({ db, timestamp, projectId }) {
  // Tests can use only a local demo project. Never fall back to production.
  const localDemo = /^demo-[a-z0-9-]+$/.test(projectId || '') &&
    /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
  if (!ALLOWED_PROJECTS.has(projectId) && !localDemo) throw new Error('Learning Journey requires the staging or production Firebase project.');

  function requireIdentity(request) {
    if (!request.auth?.uid) fail('unauthenticated', 'Teacher sign-in is required.');
    if (request.auth.token?.email_verified !== true) fail('permission-denied', 'A verified teacher email is required.');
    return request.auth.uid;
  }
  async function requireTeacher(transaction, uid) {
    const teacher = await transaction.get(db.doc(`authorizedTeachers/${uid}`));
    if (!teacher.exists || teacher.data().active !== true) fail('permission-denied', 'This teacher account is not authorised.');
  }
  function checkRevision(snapshot, expectedRevision) {
    const actual = snapshot.exists ? snapshot.data().revision : 0;
    if (actual !== expectedRevision) fail('aborted', 'The Journey changed. Reload before saving or publishing.');
  }

  return {
    async saveJourney(request) {
      const uid = requireIdentity(request);
      const input = request.data;
      const { id } = validateInput(input, true);
      const ref = db.doc(`learningJourneys/${id}`);
      return db.runTransaction(async transaction => {
        await requireTeacher(transaction, uid);
        const existing = await transaction.get(ref);
        checkRevision(existing, input.expectedRevision);
        const revision = input.expectedRevision + 1;
        transaction.set(ref, {
          schemaVersion: 1, academicYear: input.academicYear, yearLevel: input.yearLevel,
          placements: input.placements.map(({ unitId, status }) => ({ unitId, status })),
          revision, updatedAt: timestamp(), updatedBy: uid
        });
        return { journeyId: id, revision };
      });
    },
    async publishJourney(request) {
      const uid = requireIdentity(request);
      const input = request.data;
      const { id, grade } = validateInput(input, false);
      const ref = db.doc(`learningJourneys/${id}`);
      return db.runTransaction(async transaction => {
        await requireTeacher(transaction, uid);
        const existing = await transaction.get(ref);
        if (!existing.exists) fail('not-found', 'Save this Journey before publishing.');
        checkRevision(existing, input.expectedRevision);
        const draft = existing.data();
        if (draft.schemaVersion !== 1 || draft.academicYear !== input.academicYear || draft.yearLevel !== input.yearLevel) {
          fail('failed-precondition', 'Invalid stored Journey configuration.');
        }
        validatePlacements(draft.placements);
        // Upcoming entries expose no Unit reference. All exposed references must
        // already have an explicitly approved public read model in this project.
        const visible = draft.placements.filter(placement => placement.status !== 'upcoming');
        const approved = await Promise.all(visible.map(({ unitId }) => transaction.get(db.doc(`publicUnits/${unitId}`))));
        if (approved.some((snapshot, index) => !snapshot.exists || snapshot.data().id !== visible[index].unitId ||
            snapshot.data().schemaVersion !== 1 || snapshot.data().published !== true || snapshot.data().approvedForStudents !== true)) {
          fail('failed-precondition', 'Every visible Unit needs an approved, published public Unit record.');
        }
        // The active public academic year is chosen only by setActiveAcademicYear. Publishing a
        // Journey for any other year stores its snapshot without exposing it to students.
        const config = await transaction.get(db.doc(CONFIG));
        if (!config.exists) fail('failed-precondition', 'Choose the active public academic year before publishing Journeys.');
        const active = config.data().activeAcademicYear === input.academicYear;
        const revision = input.expectedRevision + 1;
        const publishedAt = timestamp();
        transaction.update(ref, { revision, updatedAt: publishedAt, updatedBy: uid });
        transaction.set(db.doc(`publishedJourneys/${id}`), {
          schemaVersion: 1, academicYear: input.academicYear, yearLevel: input.yearLevel, revision, publishedAt,
          slots: draft.placements.map(({ unitId, status }, order) => status === 'upcoming' ? { order, status } : { order, status, unitId })
        });
        if (active) transaction.set(db.doc(`journeySettings/${grade}`), {
          journeyId: id, academicYear: input.academicYear, yearLevel: input.yearLevel, revision, publishedAt
        });
        return { journeyId: id, revision, active, activeAcademicYear: config.data().activeAcademicYear };
      });
    },
    // Teacher-controlled switch of the public academic year. journeyConfig/public is the single source of
    // truth; the seven journeySettings pointers are derived from it here and in publishJourney only.
    async setActiveAcademicYear(request) {
      const uid = requireIdentity(request);
      const input = request.data;
      fields(input, ['academicYear', 'expectedRevision']);
      if (!Number.isInteger(input.academicYear) || input.academicYear < 2000 || input.academicYear > 2100 ||
          !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= Number.MAX_SAFE_INTEGER) {
        fail('invalid-argument', 'Invalid academic year or revision.');
      }
      return db.runTransaction(async transaction => {
        await requireTeacher(transaction, uid);
        const configRef = db.doc(CONFIG), config = await transaction.get(configRef);
        if ((config.exists ? config.data().revision : 0) !== input.expectedRevision) fail('aborted', 'The active year changed. Reload before switching.');
        const grades = [0, 1, 2, 3, 4, 5, 6];
        const published = await Promise.all(grades.map(grade => transaction.get(db.doc(`publishedJourneys/${journeyId(input.academicYear, grade)}`))));
        const live = [];
        const updatedAt = timestamp();
        grades.forEach((grade, index) => {
          const snapshot = published[index], data = snapshot.exists ? snapshot.data() : null;
          const pointer = db.doc(`journeySettings/${gradeKey(grade)}`);
          if (data && data.schemaVersion === 1 && data.academicYear === input.academicYear && data.yearLevel === grade && Number.isSafeInteger(data.revision) && data.revision > 0) {
            transaction.set(pointer, { journeyId: snapshot.id, academicYear: input.academicYear, yearLevel: grade, revision: data.revision, publishedAt: data.publishedAt });
            live.push(grade);
          } else transaction.delete(pointer);
        });
        const revision = input.expectedRevision + 1;
        transaction.set(configRef, {
          schemaVersion: 1, activeAcademicYear: input.academicYear,
          previousAcademicYear: config.exists ? config.data().activeAcademicYear : null,
          revision, updatedAt, updatedBy: uid
        });
        return { activeAcademicYear: input.academicYear, revision, liveYearLevels: live };
      });
    }
  };
}

let handlers;
function getHandlers() {
  if (!handlers) handlers = createJourneyHandlers({
    db: getFirestore(), timestamp: () => FieldValue.serverTimestamp(),
    projectId: getApp().options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
  });
  return handlers;
}
const options = { region: 'australia-southeast1', maxInstances: 2, timeoutSeconds: 30, memory: '256MiB' };
exports.saveJourney = onCall(options, request => getHandlers().saveJourney(request));
exports.publishJourney = onCall(options, request => getHandlers().publishJourney(request));
exports.setActiveAcademicYear = onCall(options, request => getHandlers().setActiveAcademicYear(request));
exports.createJourneyHandlers = createJourneyHandlers;
