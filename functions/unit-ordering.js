const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fail = (code, message) => { throw new HttpsError(code, message); };
function validateOrder(input) {
  if (!input || Object.keys(input).sort().join(',') !== 'expectedRevision,unitIds,yearLevel' ||
      !Number.isInteger(input.yearLevel) || input.yearLevel < 0 || input.yearLevel > 6 ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      !Array.isArray(input.unitIds) || input.unitIds.length > 500 ||
      input.unitIds.some(id => typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80) ||
      new Set(input.unitIds).size !== input.unitIds.length) fail('invalid-argument', 'Invalid year-level order.');
}
function createOrderingHandler(db, timestamp) {
  return async request => {
    if (!request.auth?.uid || request.auth.token?.email_verified !== true) fail('permission-denied', 'Verified administrator sign-in required.');
    validateOrder(request.data);
    const { yearLevel, unitIds, expectedRevision } = request.data;
    return db.runTransaction(async tx => {
      const teacher = await tx.get(db.doc(`authorizedTeachers/${request.auth.uid}`));
      if (!teacher.exists || teacher.data().active !== true) fail('permission-denied', 'Administrator access required.');
      const ref = db.doc(`unitLibraryOrder/${yearLevel}`);
      const previous = await tx.get(ref);
      if ((previous.exists ? previous.data().revision : 0) !== expectedRevision) fail('aborted', 'Order changed on another device. Latest order loaded; try again.');
      const units = await tx.get(db.collection('units').where('yearLevel', '==', yearLevel));
      const current = units.docs.filter(doc => doc.data().deleted !== true).map(doc => doc.id);
      if (current.length !== unitIds.length || current.some(id => !unitIds.includes(id))) fail('failed-precondition', 'Units changed. Reload before reordering.');
      const revision = expectedRevision + 1;
      tx.set(ref, { yearLevel, unitIds, revision, updatedAt: timestamp(), updatedBy: request.auth.uid });
      return { revision };
    });
  };
}
exports.validateOrder = validateOrder;
exports.createOrderingHandler = createOrderingHandler;
const allowedProject = () => {
  if (!['the-mandarin-room-staging', 'the-mandarin-room'].includes(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT)) fail('failed-precondition', 'Unsupported Unit Library project.');
};
function createOrderingReader(db) {
  return async request => {
    if (!request.auth?.uid || request.auth.token?.email_verified !== true) fail('permission-denied', 'Verified administrator sign-in required.');
    const teacher = await db.doc(`authorizedTeachers/${request.auth.uid}`).get();
    if (!teacher.exists || teacher.data().active !== true) fail('permission-denied', 'Administrator access required.');
    const snapshot = await db.collection('unitLibraryOrder').get();
    return Object.fromEntries(snapshot.docs.filter(d => /^[0-6]$/.test(d.id)).map(d => [d.id, { unitIds: d.data().unitIds, revision: d.data().revision }]));
  };
}
exports.createOrderingReader = createOrderingReader;
exports.readUnitLibraryOrder = onCall({ region: 'us-central1' }, request => {
  allowedProject();
  return createOrderingReader(getFirestore())(request);
});
exports.saveUnitLibraryOrder = onCall({ region: 'us-central1' }, request => {
  allowedProject();
  return createOrderingHandler(getFirestore(), FieldValue.serverTimestamp)(request);
});
