const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createJourneyHandlers } = require('./learning-journeys');

const PROJECT = 'demo-learning-journey';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host || '')) throw new Error('Tests require a local Firestore emulator; cloud execution is prohibited.');
const app = initializeApp({ projectId: PROJECT }, 'journey-foundation-tests');
const db = getFirestore(app);
const handlers = createJourneyHandlers({ db, timestamp: () => FieldValue.serverTimestamp(), projectId: PROJECT });
const teacher = { uid: 'synthetic-teacher', token: { email_verified: true } };
const stranger = { uid: 'synthetic-stranger', token: { email_verified: true } };
const placement = (unitId = 'synthetic-unit-a', status = 'current') => ({ unitId, status });
const saveInput = (overrides = {}) => ({ academicYear: 2026, yearLevel: 5, placements: [placement()], expectedRevision: 0, ...overrides });
const publishInput = (overrides = {}) => ({ academicYear: 2026, yearLevel: 5, expectedRevision: 1, ...overrides });
const save = (data = saveInput(), auth = teacher) => handlers.saveJourney({ data, auth });
const publish = (data = publishInput(), auth = teacher) => handlers.publishJourney({ data, auth });
const setYear = (academicYear, expectedRevision, auth = teacher) => handlers.setActiveAcademicYear({ data: { academicYear, expectedRevision }, auth });
const activate = async (academicYear = 2026) => { const config = await get('journeyConfig/public'); return setYear(academicYear, config ? config.revision : 0); };
const get = async path => (await db.doc(path).get()).data();
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);

function token(auth) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [{ alg: 'none', typ: 'JWT' }, {
    sub: auth.uid, user_id: auth.uid, email_verified: auth.token.email_verified,
    aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: now, exp: now + 3600,
    firebase: { sign_in_provider: 'google.com', identities: {} }
  }];
  return parts.map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.';
}
async function rest(path, { auth, method = 'GET', body } = {}) {
  return fetch(`http://${host}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method, headers: { ...(auth ? { Authorization: `Bearer ${token(auth)}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
async function reset() {
  const response = await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.status, 200);
}

test('Learning Journey secure foundation — local synthetic records only', async t => {
  t.beforeEach(async () => {
    await reset();
    await db.doc('authorizedTeachers/synthetic-teacher').set({ active: true });
    await db.doc('authorizedTeachers/synthetic-inactive').set({ active: false });
    for (const id of ['synthetic-unit-a', 'synthetic-unit-b']) {
      await db.doc(`publicUnits/${id}`).set({ id, schemaVersion: 1, published: true, approvedForStudents: true, recommendedYearLevel: 2 });
    }
    await activate(2026);
  });
  t.after(async () => { try { await reset(); } finally { await db.terminate(); await deleteApp(app); } });

  await t.test('authorised save preserves ordered references without changing Unit metadata', async () => {
    const result = await save(saveInput({ placements: [placement('synthetic-unit-b', 'upcoming'), placement('synthetic-unit-a', 'current')] }));
    assert.deepEqual(result, { journeyId: '2026_year-5', revision: 1 });
    const draft = await get('learningJourneys/2026_year-5');
    assert.deepEqual(draft.placements.map(p => p.unitId), ['synthetic-unit-b', 'synthetic-unit-a']);
    assert.equal(draft.updatedBy, teacher.uid);
    assert(draft.updatedAt.toMillis() > 0);
    assert.equal((await get('publicUnits/synthetic-unit-a')).recommendedYearLevel, 2);
    assert.equal((await db.collection('units').get()).size, 0);
  });
  await t.test('anonymous, unverified, inactive and unlisted callers cannot save or publish', async () => {
    for (const auth of [null, stranger, { uid: teacher.uid, token: { email_verified: false } }, { uid: 'synthetic-inactive', token: { email_verified: true } }]) {
      const code = auth ? 'permission-denied' : 'unauthenticated';
      await rejectsCode(save(saveInput(), auth), code);
      await rejectsCode(publish(publishInput(), auth), code);
    }
    assert.equal((await db.collection('learningJourneys').get()).size, 0);
  });
  await t.test('all nested and top-level fields are allowlisted', async () => {
    await rejectsCode(save(saveInput({ updatedBy: 'spoof' })), 'invalid-argument');
    await rejectsCode(save(saveInput({ placements: [{ ...placement(), title: 'private title' }] })), 'invalid-argument');
    await rejectsCode(publish({ ...publishInput(), placements: [] }), 'invalid-argument');
  });
  await t.test('academic year, grade, revision, ID, count and status validation', async () => {
    for (const overrides of [{ academicYear: 1999 }, { academicYear: '2026' }, { yearLevel: 7 }, { yearLevel: -1 }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER }, { placements: [placement('../unit')] }, { placements: [placement('unit-a', 'learned')] }, { placements: Array.from({ length: 101 }, (_, i) => placement(`unit-${i}`, 'upcoming')) }]) {
      await rejectsCode(save(saveInput(overrides)), 'invalid-argument');
    }
  });
  await t.test('duplicate Unit IDs are rejected', async () => {
    await rejectsCode(save(saveInput({ placements: [placement('unit-a', 'completed'), placement('unit-a', 'upcoming')] })), 'invalid-argument');
  });
  await t.test('multiple Current placements are rejected', async () => {
    await rejectsCode(save(saveInput({ placements: [placement(), placement('synthetic-unit-b')] })), 'invalid-argument');
  });
  await t.test('stale saves and stale publications are rejected', async () => {
    await save();
    await rejectsCode(save(), 'aborted');
    await rejectsCode(publish(publishInput({ expectedRevision: 0 })), 'aborted');
    await publish();
    await rejectsCode(publish(), 'aborted');
    await rejectsCode(save(saveInput({ expectedRevision: 1 })), 'aborted');
  });
  await t.test('concurrent edits allow exactly one winner', async () => {
    await save();
    const results = await Promise.allSettled([save(saveInput({ expectedRevision: 1 })), save(saveInput({ expectedRevision: 1, placements: [] }))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'aborted');
    assert.equal((await get('learningJourneys/2026_year-5')).revision, 2);
  });
  await t.test('publication hides Upcoming references and all Admin identity fields', async () => {
    await save(saveInput({ placements: [placement('synthetic-unit-b', 'completed'), placement(), placement('private-future-unit', 'upcoming')] }));
    await publish();
    const publicJourney = await get('publishedJourneys/2026_year-5');
    assert.deepEqual(publicJourney.slots, [{ order: 0, status: 'completed', unitId: 'synthetic-unit-b' }, { order: 1, status: 'current', unitId: 'synthetic-unit-a' }, { order: 2, status: 'upcoming' }]);
    const json = JSON.stringify(publicJourney);
    for (const secret of ['private-future-unit', teacher.uid, 'updatedBy', 'placements', 'recommendedYearLevel']) assert(!json.includes(secret));
    assert.deepEqual(Object.keys(publicJourney).sort(), ['academicYear', 'publishedAt', 'revision', 'schemaVersion', 'slots', 'yearLevel'].sort());
  });
  await t.test('missing, unpublished, unapproved or mismatched visible public Units reject publication atomically', async () => {
    await save();
    for (const invalid of [null, { published: false }, { approvedForStudents: false }, { id: 'other-unit' }, { schemaVersion: 2 }]) {
      const ref = db.doc('publicUnits/synthetic-unit-a');
      if (invalid === null) await ref.delete();
      else await ref.set({ id: 'synthetic-unit-a', schemaVersion: 1, published: true, approvedForStudents: true, ...invalid });
      await rejectsCode(publish(), 'failed-precondition');
      assert.equal((await get('learningJourneys/2026_year-5')).revision, 1);
      assert.equal(await get('publishedJourneys/2026_year-5'), undefined);
      assert.equal(await get('journeySettings/year-5'), undefined);
    }
  });
  await t.test('private Unit existence alone never grants approval', async () => {
    await db.doc('units/private-unit').set({ id: 'private-unit', notes: 'private teacher content' });
    await save(saveInput({ placements: [placement('private-unit')] }));
    await rejectsCode(publish(), 'failed-precondition');
    assert.equal((await get('units/private-unit')).notes, 'private teacher content');
    assert.equal(await get('publicUnits/private-unit'), undefined);
  });
  await t.test('publication and active pointer have the same atomic commit timestamp and revision', async () => {
    await save();
    await publish();
    const snapshots = await Promise.all(['learningJourneys/2026_year-5', 'publishedJourneys/2026_year-5', 'journeySettings/year-5'].map(path => db.doc(path).get()));
    for (const snapshot of snapshots) {
      assert.equal(snapshot.data().revision, 2);
      assert(snapshot.updateTime.isEqual(snapshots[0].updateTime));
    }
    assert.equal(snapshots[2].data().journeyId, '2026_year-5');
  });
  await t.test('academic years and grades are independent; repeated Unit references across Journeys are allowed', async () => {
    await save();
    await save(saveInput({ academicYear: 2027 }));
    await save(saveInput({ yearLevel: 3 }));
    await publish();
    await publish(publishInput({ yearLevel: 3 }));
    const firstYear = await get('learningJourneys/2026_year-5');
    const otherGrade = await get('journeySettings/year-3');
    assert.equal((await publish(publishInput({ academicYear: 2027 }))).active, false);
    assert.deepEqual(await get('learningJourneys/2026_year-5'), firstYear);
    assert.deepEqual(await get('journeySettings/year-3'), otherGrade);
    assert.equal((await get('journeySettings/year-5')).journeyId, '2026_year-5', 'publishing 2027 never switches the public year');
  });
  await t.test('empty Journeys and Prep are valid configurations', async () => {
    await save(saveInput({ yearLevel: 0, placements: [] }));
    await publish(publishInput({ yearLevel: 0 }));
    assert.equal((await get('journeySettings/prep')).journeyId, '2026_prep');
    assert.deepEqual((await get('publishedJourneys/2026_prep')).slots, []);
  });
  await t.test('anonymous users can read only the active public Journey and grade pointer', async () => {
    await save(); await publish();
    assert.equal((await rest('journeySettings/year-5')).status, 200);
    assert.equal((await rest('publishedJourneys/2026_year-5')).status, 200);
    for (const path of ['learningJourneys/2026_year-5', 'learningJourneys', 'journeySettings', 'publishedJourneys', 'journeySettings/invalid']) {
      assert.equal((await rest(path)).status, 403, path);
    }
    await save(saveInput({ academicYear: 2027 }));
    await publish(publishInput({ academicYear: 2027 }));
    assert.equal((await rest('publishedJourneys/2026_year-5')).status, 200, '2026 stays public');
    assert.equal((await rest('publishedJourneys/2027_year-5')).status, 403, 'published 2027 is not public before activation');
    await activate(2027);
    assert.equal((await rest('publishedJourneys/2026_year-5')).status, 403);
    assert.equal((await rest('publishedJourneys/2027_year-5')).status, 200);
    assert.equal((await rest('publishedJourneys/2026_year-5', { auth: teacher })).status, 200);
  });
  await t.test('private configurations permit only verified active teacher reads', async () => {
    await save();
    assert.equal((await rest('learningJourneys/2026_year-5', { auth: teacher })).status, 200);
    assert.equal((await rest('learningJourneys', { auth: teacher })).status, 200);
    for (const auth of [stranger, { ...teacher, token: { email_verified: false } }, { uid: 'synthetic-inactive', token: { email_verified: true } }]) {
      assert.equal((await rest('learningJourneys/2026_year-5', { auth })).status, 403);
      assert.equal((await rest('learningJourneys', { auth })).status, 403);
    }
  });
  await t.test('even authorised teachers cannot directly create, update or delete Journey documents', async () => {
    await save(); await publish();
    for (const path of ['learningJourneys/2026_year-5', 'journeySettings/year-5', 'publishedJourneys/2026_year-5', 'journeyConfig/public']) {
      for (const auth of [null, teacher]) {
        assert.equal((await rest(path, { auth, method: 'PATCH', body: { fields: { revision: { integerValue: '999' } } } })).status, 403);
        assert.equal((await rest(path, { auth, method: 'DELETE' })).status, 403);
      }
    }
    assert.equal((await rest('learningJourneys/2099_year-1', { auth: teacher, method: 'PATCH', body: { fields: {} } })).status, 403);
  });
  await t.test('a pointer revision mismatch denies public projection access', async () => {
    await save(); await publish();
    await db.doc('journeySettings/year-5').update({ revision: 999 });
    assert.equal((await rest('publishedJourneys/2026_year-5')).status, 403);
  });
  await t.test('private Unit Library remains closed to students and read-only for Admin', async () => {
    await db.doc('units/synthetic-unit').set({ notes: 'private' });
    for (const auth of [null, teacher]) {
      assert.equal((await rest('units/synthetic-unit', { auth })).status, auth ? 200 : 403);
      assert.equal((await rest('units', { auth })).status, auth ? 200 : 403);
    }
  });
  await t.test('academic year: 2026 and 2027 are stored separately; preparing 2027 never touches public 2026', async () => {
    await save(saveInput({ placements: [placement('synthetic-unit-a', 'current')] })); await publish();
    const public2026 = await get('publishedJourneys/2026_year-5'), pointer2026 = await get('journeySettings/year-5');
    await save(saveInput({ academicYear: 2027, placements: [placement('synthetic-unit-b', 'current'), placement('future-private-unit', 'upcoming')] }));
    const result = await publish(publishInput({ academicYear: 2027 }));
    assert.deepEqual([result.active, result.activeAcademicYear], [false, 2026]);
    assert.deepEqual(await get('publishedJourneys/2026_year-5'), public2026);
    assert.deepEqual(await get('journeySettings/year-5'), pointer2026);
    assert.equal((await rest('publishedJourneys/2027_year-5')).status, 403);
    assert.equal((await rest('learningJourneys/2027_year-5')).status, 403);
    assert.equal((await get('learningJourneys/2026_year-5')).placements[0].unitId, 'synthetic-unit-a', '2026 history preserved');
  });
  await t.test('academic year: switching repoints every year level, hides years without a Journey, and rolls back exactly', async () => {
    await save(); await publish();                                                // 2026 Year 5 live
    await save(saveInput({ yearLevel: 0, placements: [] })); await publish(publishInput({ yearLevel: 0 }));   // 2026 Prep live
    await save(saveInput({ academicYear: 2027 })); await publish(publishInput({ academicYear: 2027 }));      // 2027 Year 5 prepared only
    const before = await Promise.all(['journeySettings/year-5', 'journeySettings/prep'].map(get));
    const switched = await activate(2027);
    assert.deepEqual(switched, { activeAcademicYear: 2027, revision: 2, liveYearLevels: [5] });
    assert.equal((await get('journeySettings/year-5')).journeyId, '2027_year-5');
    assert.equal(await get('journeySettings/prep'), undefined, 'no 2027 Prep Journey: students see the fallback, never 2026 content');
    assert.equal((await rest('journeySettings/prep')).status, 404);
    assert.deepEqual(await get('journeyConfig/public'), { ...(await get('journeyConfig/public')), activeAcademicYear: 2027, previousAcademicYear: 2026 });
    const rolledBack = await activate(2026);
    assert.deepEqual(rolledBack.liveYearLevels, [0, 5]);
    const after = await Promise.all(['journeySettings/year-5', 'journeySettings/prep'].map(get));
    assert.deepEqual(after.map(p => [p.journeyId, p.revision]), before.map(p => [p.journeyId, p.revision]), 'rollback restores the exact 2026 publications');
    assert.equal((await rest('publishedJourneys/2026_year-5')).status, 200);
    assert.equal((await rest('publishedJourneys/2027_year-5')).status, 403);
  });
  await t.test('academic year: only verified active teachers can switch; stale and malformed switches are refused', async () => {
    for (const auth of [null, stranger, { uid: teacher.uid, token: { email_verified: false } }, { uid: 'synthetic-inactive', token: { email_verified: true } }]) {
      await rejectsCode(setYear(2027, 1, auth), auth ? 'permission-denied' : 'unauthenticated');
    }
    await rejectsCode(setYear(2027, 0), 'aborted');
    for (const data of [{ academicYear: 1999, expectedRevision: 1 }, { academicYear: '2027', expectedRevision: 1 }, { academicYear: 2027 }, { academicYear: 2027, expectedRevision: 1, force: true }]) {
      await rejectsCode(handlers.setActiveAcademicYear({ data, auth: teacher }), 'invalid-argument');
    }
    const concurrent = await Promise.allSettled([setYear(2027, 1), setYear(2028, 1)]);
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await get('journeyConfig/public')).revision, 2);
  });
  await t.test('academic year: publishing requires an explicit active year; the config is teacher-read-only', async () => {
    await db.doc('journeyConfig/public').delete();
    await save();
    await rejectsCode(publish(), 'failed-precondition');
    assert.equal(await get('publishedJourneys/2026_year-5'), undefined);
    await activate(2026);
    assert.equal((await rest('journeyConfig/public')).status, 403);
    assert.equal((await rest('journeyConfig/public', { auth: teacher })).status, 200);
    assert.equal((await rest('journeyConfig/public', { auth: stranger })).status, 403);
  });
  await t.test('backend refuses production and unspecified project targets', () => {
    for (const projectId of ['the-mandarin-room-prod', '', 'unrelated-project']) {
      assert.throws(() => createJourneyHandlers({ db, timestamp: () => FieldValue.serverTimestamp(), projectId }), /staging or production/);
    }
    assert.match(fs.readFileSync(require.resolve('./index.js'), 'utf8'), /exports\.saveJourney = journeys\.saveJourney;/);
  });
});
