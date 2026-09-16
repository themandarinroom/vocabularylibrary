// Word Randomiser v0.2 live-session backend.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

const db = getFirestore();
const tokenPepper = defineSecret("LIVE_SESSION_TOKEN_PEPPER");
const REGION = "australia-southeast1";
const SESSION_MS = 12 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_POOL = 200;
const MAX_GROUPS = 8;
const MAX_HISTORY = 250;
const MAX_SESSION_DEVICES = 60;
const JOIN_WINDOW_MS = 10 * 60 * 1000;
const JOIN_IP_LIMIT = 30;
const JOIN_CODE_LIMIT = 50;
const PRESENCE_STALE_MS = 5 * 60 * 1000;

const fail = (code, message) => { throw new HttpsError(code, message); };
const cleanText = (value, max = 80) => String(value || "").trim().slice(0, max);
const sessionRef = (id) => db.doc(`liveGameSessions/${id}`);
const publicRef = (id) => db.doc(`liveGameSessions/${id}/public/state`);
const groupRef = (id, groupId) => db.doc(`liveGameSessions/${id}/groups/${groupId}`);
const groupStateRef = (id, groupId) => db.doc(`liveGameSessions/${id}/groupStates/${groupId}`);
const deviceRef = (id, deviceId) => db.doc(`liveGameSessions/${id}/devices/${deviceId}`);
const deviceSecretRef = (id, deviceId) => db.doc(`liveGameSessions/${id}/deviceSecrets/${deviceId}`);
const deviceViewRef = (id, viewId) => db.doc(`liveGameSessions/${id}/deviceViews/${viewId}`);

function randomCode() { return Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join(""); }
function randomToken() { return crypto.randomBytes(40).toString("base64url"); }
function tokenHash(value) { return crypto.createHmac("sha256", tokenPepper.value()).update(String(value)).digest("hex"); }
function secureEqual(left, right) { const a = Buffer.from(String(left)); const b = Buffer.from(String(right)); return a.length === b.length && crypto.timingSafeEqual(a, b); }

async function loadVocabularyPool(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_POOL) fail("invalid-argument", `Choose 1–${MAX_POOL} vocabulary items.`);
  const selected = input.map((item) => ({ setId: cleanText(item.setId), id: cleanText(item.id) }));
  if (selected.some((item) => !item.setId || !item.id)) fail("invalid-argument", "Every selected word needs a stable set and item ID.");
  const drawKeys = selected.map((item) => `${item.setId}::${item.id}`); if (new Set(drawKeys).size !== drawKeys.length) fail("invalid-argument", "Vocabulary selections must be unique.");
  const setIds = [...new Set(selected.map((item) => item.setId))];
  const setSnapshots = await db.getAll(...setIds.map((setId) => db.doc(`vocabularySets/${setId}`))); const sets = new Map(setSnapshots.filter((snapshot) => snapshot.exists && snapshot.data()?.deleted !== true).map((snapshot) => [snapshot.id, snapshot.data()]));
  const voiceSnapshots = await db.getAll(...selected.map((item) => db.doc(`vocabularyTeacherVoices/${item.setId}--${item.id}`))); const voices = new Map(voiceSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data()]));
  return selected.map(({ setId, id }) => {
    const source = (sets.get(setId)?.items || []).find((item) => item?.id === id); if (!source) fail("failed-precondition", "A selected Vocabulary Library item is no longer available.");
    const voice = voices.get(`${setId}--${id}`);
    const teacherVoiceRevision = voice && Number.isFinite(Number(voice.revision)) ? Number(voice.revision) : null;
    return { drawKey: `${setId}::${id}`, setId, id, chinese: cleanText(source.chinese), pinyin: cleanText(source.pinyin), english: cleanText(source.english), image: cleanText(source.image, 1800), teacherAudioUrl: cleanText(voice?.teacherAudioUrl, 1800), teacherVoiceRevision };
  });
}

function initialGroup(id, name, itemKeys, drawMode) {
  return { id, name, drawMode, version: 0, round: 1, drawNumber: 0, currentItemKey: null, history: [], remainingItemKeys: itemKeys, controllerType: "teacher", controllerDeviceId: null, controlEpoch: 0, delegatedDrawsRemaining: null, updatedAt: FieldValue.serverTimestamp() };
}

function publicGroup(privateGroup, poolByKey) {
  const historyKeys = privateGroup.history.slice(-MAX_HISTORY);
  return { id: privateGroup.id, name: privateGroup.name, drawMode: privateGroup.drawMode, version: privateGroup.version, round: privateGroup.round, drawNumber: privateGroup.drawNumber, currentItemKey: privateGroup.currentItemKey, currentItem: privateGroup.currentItemKey ? poolByKey.get(privateGroup.currentItemKey) || null : null, history: historyKeys, historyItems: historyKeys.map((key) => poolByKey.get(key)).filter(Boolean), remainingCount: privateGroup.drawMode === "no-repeat" ? privateGroup.remainingItemKeys.length : poolByKey.size, isComplete: privateGroup.drawMode === "no-repeat" && privateGroup.remainingItemKeys.length === 0, controller: { type: privateGroup.controllerType, deviceId: privateGroup.controllerDeviceId, epoch: privateGroup.controlEpoch, drawsRemaining: privateGroup.delegatedDrawsRemaining }, updatedAt: FieldValue.serverTimestamp() };
}

async function requireTeacher(uid) {
  if (!uid) fail("unauthenticated", "Teacher sign-in is required.");
  const teacher = await db.doc(`authorizedTeachers/${uid}`).get();
  if (!teacher.exists || teacher.data()?.active !== true) fail("permission-denied", "This teacher account is not authorised.");
}

async function reserveJoinCode(transaction, sessionId, expiresAt) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode(); const ref = db.doc(`liveGameJoinCodes/${code}`); const existing = await transaction.get(ref);
    if (!existing.exists) { transaction.create(ref, { sessionId, expiresAt }); return code; }
  }
  fail("resource-exhausted", "Could not allocate a classroom code. Try again.");
}

function joinRateKey(request) {
  const forwarded = cleanText(request.rawRequest?.headers?.["x-forwarded-for"], 200).split(",")[0].trim(); const address = cleanText(request.rawRequest?.ip, 100) || forwarded || "unknown";
  return crypto.createHmac("sha256", tokenPepper.value()).update(address).digest("hex").slice(0, 32);
}

async function reserveJoinAttempt(request, joinCode) {
  const windowId = Math.floor(Date.now() / JOIN_WINDOW_MS); const expiresAt = Timestamp.fromMillis((windowId + 2) * JOIN_WINDOW_MS);
  const ipRef = db.doc(`liveGameJoinRateLimits/ip-${joinRateKey(request)}-${windowId}`); const codeKey = crypto.createHmac("sha256", tokenPepper.value()).update(joinCode || "invalid").digest("hex").slice(0, 24); const codeRef = db.doc(`liveGameJoinRateLimits/code-${codeKey}-${windowId}`);
  await db.runTransaction(async (transaction) => {
    const [ipSnapshot, codeSnapshot] = await Promise.all([transaction.get(ipRef), transaction.get(codeRef)]); const ipCount = Number(ipSnapshot.data()?.count || 0); const codeCount = Number(codeSnapshot.data()?.count || 0);
    if (ipCount >= JOIN_IP_LIMIT || codeCount >= JOIN_CODE_LIMIT) fail("resource-exhausted", "Too many join attempts. Wait a few minutes and try again.");
    transaction.set(ipRef, { count: ipCount + 1, expiresAt }, { merge: true }); transaction.set(codeRef, { count: codeCount + 1, expiresAt }, { merge: true });
  });
}

// App Check starts in monitoring-only mode. Authentication, capability tokens,
// rate limits and Firestore Rules remain enforced independently of App Check.
const callableOptions = { region: REGION, secrets: [tokenPepper], enforceAppCheck: false, timeoutSeconds: 30, memory: "256MiB", maxInstances: 20 };

const createLiveGameSession = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid || request.auth.token.email_verified !== true) fail("unauthenticated", "Sign in with a verified teacher account.");
  await requireTeacher(request.auth.uid);
  const pool = await loadVocabularyPool(request.data?.items); const itemKeys = pool.map((item) => item.drawKey); const poolByKey = new Map(pool.map((item) => [item.drawKey, item]));
  const mode = request.data?.mode === "groups" ? "groups" : "class"; const drawMode = request.data?.drawMode === "allow-repeats" ? "allow-repeats" : "no-repeat";
  const rawNames = mode === "groups" && Array.isArray(request.data?.groupNames) ? request.data.groupNames.slice(0, MAX_GROUPS) : ["Whole class"];
  const names = rawNames.map((name, index) => cleanText(name) || `Group ${index + 1}`); if (!names.length) fail("invalid-argument", "Create at least one group.");
  const id = crypto.randomUUID(); const teacherDeviceId = crypto.randomUUID(); const deviceToken = randomToken(); const expiresAt = Timestamp.fromMillis(Date.now() + SESSION_MS);
  let joinCode;
  await db.runTransaction(async (transaction) => {
    joinCode = await reserveJoinCode(transaction, id, expiresAt);
    const privateSession = { teacherUid: request.auth.uid, status: "active", mode, joinCode, joiningLocked: false, deviceCount: 1, pool, display: Array.isArray(request.data?.display) ? request.data.display : ["image", "chinese", "pinyin"], voiceMode: cleanText(request.data?.voiceMode) || "auto", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), expiresAt, cleanupAt: expiresAt };
    transaction.create(sessionRef(id), privateSession);
    transaction.create(publicRef(id), { status: "active", mode, joiningLocked: false, pool, display: privateSession.display, voiceMode: privateSession.voiceMode, expiresAt, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(deviceRef(id, teacherDeviceId), { name: cleanText(request.data?.teacherName) || "Teacher", role: "teacher", groupId: mode === "class" ? "class" : null, connected: true, lastSeenAt: FieldValue.serverTimestamp() });
    transaction.create(deviceSecretRef(id, teacherDeviceId), { tokenHash: tokenHash(deviceToken), role: "teacher", teacherUid: request.auth.uid, groupId: mode === "class" ? "class" : null, connected: true, lastSeenAt: FieldValue.serverTimestamp() });
    names.forEach((name, index) => { const groupId = mode === "class" ? "class" : `group-${index + 1}`; const group = initialGroup(groupId, name, itemKeys, drawMode); transaction.create(groupStateRef(id, groupId), group); transaction.create(groupRef(id, groupId), publicGroup(group, poolByKey)); });
  });
  return { sessionId: id, joinCode, deviceId: teacherDeviceId, deviceToken, role: "teacher" };
});

const joinLiveGameSession = onCall(callableOptions, async (request) => {
  const joinCode = cleanText(request.data?.joinCode, 5).toUpperCase(); await reserveJoinAttempt(request, joinCode);
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(joinCode)) fail("failed-precondition", "This classroom code is unavailable.");
  const codeReference = db.doc(`liveGameJoinCodes/${joinCode}`); const codeSnapshot = await codeReference.get(); if (!codeSnapshot.exists || codeSnapshot.data().expiresAt?.toMillis?.() <= Date.now()) fail("failed-precondition", "This classroom code is unavailable.");
  const id = codeSnapshot.data().sessionId; const deviceId = crypto.randomUUID(); const deviceViewId = crypto.randomUUID(); const deviceToken = randomToken();
  let groupId;
  await db.runTransaction(async (transaction) => {
    const [freshCode, sessionSnapshot] = await Promise.all([transaction.get(codeReference), transaction.get(sessionRef(id))]);
    if (!freshCode.exists || !sessionSnapshot.exists) fail("failed-precondition", "This classroom code is unavailable.");
    const session = sessionSnapshot.data(); if (freshCode.data().sessionId !== id || freshCode.data().expiresAt.toMillis() <= Date.now() || session.status !== "active" || session.expiresAt.toMillis() <= Date.now() || session.joiningLocked || Number(session.deviceCount || 1) >= MAX_SESSION_DEVICES) fail("failed-precondition", "This classroom code is unavailable.");
    groupId = session.mode === "class" ? "class" : cleanText(request.data?.groupId) || "group-1";
    const chosenGroup = await transaction.get(groupStateRef(id, groupId)); if (!chosenGroup.exists) fail("not-found", "That group does not exist.");
    transaction.create(deviceRef(id, deviceId), { name: cleanText(request.data?.name) || "Student iPad", role: "student", groupId, connected: true, lastSeenAt: FieldValue.serverTimestamp() });
    transaction.create(deviceSecretRef(id, deviceId), { tokenHash: tokenHash(deviceToken), role: "student", groupId, viewId: deviceViewId, connected: true, lastSeenAt: FieldValue.serverTimestamp() });
    transaction.create(deviceViewRef(id, deviceViewId), { groupId, status: "active", expiresAt: session.expiresAt, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(sessionRef(id), { deviceCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  });
  logger.info("Live session join accepted", { sessionId: id, appCheck: request.app ? "valid" : "missing" });
  return { sessionId: id, joinCode, deviceId, deviceViewId, deviceToken, role: "student", groupId };
});

function deterministicIndex(sessionId, group, requestId, entropy, length) {
  const digest = crypto.createHash("sha256").update(sessionId).update(group.id).update(String(group.version)).update(requestId).update(entropy).digest();
  return digest.readUInt32BE(0) % length;
}

const drawLiveGameWord = onCall(callableOptions, async (request) => {
  const id = cleanText(request.data?.sessionId, 80); const groupId = cleanText(request.data?.groupId, 80); const deviceId = cleanText(request.data?.deviceId, 80); const requestId = cleanText(request.data?.requestId, 100); const suppliedToken = cleanText(request.data?.deviceToken, 180);
  if (!id || !groupId || !deviceId || !requestId || !suppliedToken) fail("invalid-argument", "Draw credentials are incomplete.");
  const receiptRef = db.doc(`liveGameSessions/${id}/drawRequests/${requestId}`); const entropy = crypto.randomBytes(32); let result;
  await db.runTransaction(async (transaction) => {
    const [sessionSnapshot, groupSnapshot, deviceSnapshot, receiptSnapshot] = await Promise.all([transaction.get(sessionRef(id)), transaction.get(groupStateRef(id, groupId)), transaction.get(deviceSecretRef(id, deviceId)), transaction.get(receiptRef)]);
    if (receiptSnapshot.exists) { const receipt = receiptSnapshot.data(); if (receipt.deviceId !== deviceId) fail("permission-denied", "Request ID belongs to another device."); result = { item: receipt.item, version: receipt.version, duplicate: true }; return; }
    if (!sessionSnapshot.exists || !groupSnapshot.exists || !deviceSnapshot.exists) fail("not-found", "Live session state was not found.");
    const session = sessionSnapshot.data(); const group = groupSnapshot.data(); const device = deviceSnapshot.data();
    if (session.status !== "active" || session.expiresAt.toMillis() <= Date.now()) fail("failed-precondition", "This session has ended.");
    if (!secureEqual(device.tokenHash, tokenHash(suppliedToken))) fail("permission-denied", "Device token is invalid.");
    if (Number(request.data?.expectedVersion) !== group.version) fail("aborted", "Stale draw request.");
    if (Number(request.data?.controlEpoch) !== group.controlEpoch) fail("permission-denied", "Draw control has changed.");
    const teacherDraw = device.role === "teacher" && request.auth?.uid === session.teacherUid && group.controllerType === "teacher";
    const studentDraw = device.role === "student" && device.groupId === groupId && group.controllerType === "student" && group.controllerDeviceId === deviceId;
    if (!teacherDraw && !studentDraw) fail("permission-denied", "This device is not the current draw controller.");
    const source = group.drawMode === "no-repeat" ? [...group.remainingItemKeys] : session.pool.map((item) => item.drawKey); if (!source.length) fail("failed-precondition", "All words have been drawn.");
    const index = deterministicIndex(id, group, requestId, entropy, source.length); const itemKey = source[index]; const item = session.pool.find((entry) => entry.drawKey === itemKey); if (!item) fail("data-loss", "Vocabulary item is missing.");
    if (group.drawMode === "no-repeat") source.splice(index, 1);
    const next = { ...group, version: group.version + 1, drawNumber: group.drawNumber + 1, currentItemKey: itemKey, history: [...group.history, itemKey].slice(-MAX_HISTORY), remainingItemKeys: group.drawMode === "no-repeat" ? source : group.remainingItemKeys, updatedAt: FieldValue.serverTimestamp() };
    if (studentDraw && group.delegatedDrawsRemaining === 1) { next.controllerType = "teacher"; next.controllerDeviceId = null; next.controlEpoch += 1; next.delegatedDrawsRemaining = null; }
    const poolByKey = new Map(session.pool.map((entry) => [entry.drawKey, entry]));
    transaction.update(groupStateRef(id, groupId), next); transaction.set(groupRef(id, groupId), publicGroup(next, poolByKey));
    transaction.create(receiptRef, { deviceId, groupId, item, version: next.version, createdAt: FieldValue.serverTimestamp(), expiresAt: session.expiresAt }); result = { item, version: next.version, duplicate: false };
  });
  return result;
});

async function teacherSession(id, request) {
  if (!request.auth?.uid) fail("unauthenticated", "Teacher sign-in is required."); await requireTeacher(request.auth.uid);
  const snapshot = await sessionRef(id).get(); if (!snapshot.exists || snapshot.data().teacherUid !== request.auth.uid) fail("permission-denied", "Only the session teacher can change this game."); if (snapshot.data().status !== "active" || snapshot.data().expiresAt.toMillis() <= Date.now()) fail("failed-precondition", "This session has ended."); return snapshot.data();
}

const controlLiveGameSession = onCall(callableOptions, async (request) => {
  const id = cleanText(request.data?.sessionId, 80); const action = cleanText(request.data?.action, 30); const groupId = cleanText(request.data?.groupId, 80);
  const session = await teacherSession(id, request); const poolByKey = new Map(session.pool.map((item) => [item.drawKey, item]));
  if (action === "set-lock" || action === "end") {
    await db.runTransaction(async (transaction) => { const current = await transaction.get(sessionRef(id)); if (current.data()?.status !== "active") fail("failed-precondition", "This session has ended."); const ending = action === "end"; const privateUpdate = { joiningLocked: ending || Boolean(request.data?.locked), status: ending ? "ended" : "active", updatedAt: FieldValue.serverTimestamp() }; if (ending) privateUpdate.cleanupAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000); transaction.update(sessionRef(id), privateUpdate); transaction.update(publicRef(id), { joiningLocked: ending || Boolean(request.data?.locked), status: ending ? "ended" : "active", updatedAt: FieldValue.serverTimestamp() }); if (ending) transaction.delete(db.doc(`liveGameJoinCodes/${session.joinCode}`)); });
    return { ok: true };
  }
  if (action === "assign-group") {
    const targetId = cleanText(request.data?.deviceId, 80); const nextGroupId = groupId;
    await db.runTransaction(async (transaction) => {
      const target = await transaction.get(deviceSecretRef(id, targetId)); if (!target.exists || target.data().role !== "student") fail("invalid-argument", "Choose a student device."); const oldGroupId = target.data().groupId;
      const [oldSnapshot, nextSnapshot] = await Promise.all([transaction.get(groupStateRef(id, oldGroupId)), transaction.get(groupStateRef(id, nextGroupId))]); if (!nextSnapshot.exists) fail("not-found", "Group not found.");
      const oldGroup = oldSnapshot.data(); const nextGroup = nextSnapshot.data();
      const oldNext = oldGroupId === nextGroupId ? null : { ...oldGroup, version: oldGroup.version + 1, controllerType: oldGroup.controllerDeviceId === targetId ? "teacher" : oldGroup.controllerType, controllerDeviceId: oldGroup.controllerDeviceId === targetId ? null : oldGroup.controllerDeviceId, controlEpoch: oldGroup.controllerDeviceId === targetId ? oldGroup.controlEpoch + 1 : oldGroup.controlEpoch };
      const assigned = oldGroupId === nextGroupId ? nextGroup : { ...nextGroup, version: nextGroup.version + 1 };
      transaction.update(deviceSecretRef(id, targetId), { groupId: nextGroupId }); transaction.update(deviceRef(id, targetId), { groupId: nextGroupId }); transaction.update(deviceViewRef(id, target.data().viewId), { groupId: nextGroupId, updatedAt: FieldValue.serverTimestamp() });
      if (oldNext) { transaction.set(groupStateRef(id, oldGroupId), oldNext); transaction.set(groupRef(id, oldGroupId), publicGroup(oldNext, poolByKey)); }
      transaction.set(groupStateRef(id, nextGroupId), assigned); transaction.set(groupRef(id, nextGroupId), publicGroup(assigned, poolByKey));
    });
    return { ok: true };
  }
  if (!groupId) fail("invalid-argument", "Group is required.");
  await db.runTransaction(async (transaction) => {
    const stateSnapshot = await transaction.get(groupStateRef(id, groupId)); if (!stateSnapshot.exists) fail("not-found", "Group not found."); const group = stateSnapshot.data(); let next;
    if (action === "delegate") {
      const targetId = cleanText(request.data?.deviceId, 80); const target = await transaction.get(deviceSecretRef(id, targetId)); if (!target.exists || target.data().role !== "student" || target.data().groupId !== groupId) fail("invalid-argument", "Choose a student in this group.");
      next = { ...group, version: group.version + 1, controllerType: "student", controllerDeviceId: targetId, controlEpoch: group.controlEpoch + 1, delegatedDrawsRemaining: Math.max(1, Number(request.data?.draws) || 1), updatedAt: FieldValue.serverTimestamp() };
    } else if (action === "revoke") next = { ...group, version: group.version + 1, controllerType: "teacher", controllerDeviceId: null, controlEpoch: group.controlEpoch + 1, delegatedDrawsRemaining: null, updatedAt: FieldValue.serverTimestamp() };
    else if (action === "reset") { const drawMode = request.data?.drawMode === "allow-repeats" ? "allow-repeats" : group.drawMode; next = initialGroup(group.id, group.name, session.pool.map((item) => item.drawKey), drawMode); next.version = group.version + 1; next.round = group.round + 1; next.controlEpoch = group.controlEpoch + 1; }
    else fail("invalid-argument", "Unknown live-session action.");
    transaction.set(groupStateRef(id, groupId), next); transaction.set(groupRef(id, groupId), publicGroup(next, poolByKey));
  });
  return { ok: true };
});

const heartbeatLiveGameSession = onCall(callableOptions, async (request) => {
  const id = cleanText(request.data?.sessionId, 80); const deviceId = cleanText(request.data?.deviceId, 80); const suppliedToken = cleanText(request.data?.deviceToken, 180);
  await db.runTransaction(async (transaction) => { const current = await transaction.get(deviceSecretRef(id, deviceId)); if (!current.exists || !secureEqual(current.data().tokenHash, tokenHash(suppliedToken))) fail("permission-denied", "Device token is invalid."); const wasConnected = current.data().connected === true; transaction.update(deviceSecretRef(id, deviceId), { connected: true, lastSeenAt: FieldValue.serverTimestamp() }); if (!wasConnected) transaction.update(deviceRef(id, deviceId), { connected: true, lastSeenAt: FieldValue.serverTimestamp() }); }); return { ok: true };
});

const expireDisconnectedLiveDevices = onSchedule({ region: REGION, schedule: "every 2 minutes", timeoutSeconds: 60, memory: "256MiB" }, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - PRESENCE_STALE_MS); const stale = await db.collectionGroup("deviceSecrets").where("connected", "==", true).where("lastSeenAt", "<", cutoff).limit(200).get();
  await Promise.all(stale.docs.map(async (candidate) => {
    const liveSession = candidate.ref.parent.parent; if (!liveSession) return; const id = liveSession.id; const deviceId = candidate.id; const groupId = candidate.data().groupId;
    await db.runTransaction(async (transaction) => {
      const refs = [candidate.ref, deviceRef(id, deviceId), sessionRef(id)]; if (groupId) refs.push(groupStateRef(id, groupId));
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref))); const [secretSnapshot, visibleDevice, privateSession, groupSnapshot] = snapshots;
      if (!secretSnapshot.exists || secretSnapshot.data().connected !== true || !privateSession.exists) return;
      transaction.update(candidate.ref, { connected: false }); if (visibleDevice.exists) transaction.update(deviceRef(id, deviceId), { connected: false });
      if (groupSnapshot?.exists && groupSnapshot.data().controllerDeviceId === deviceId) { const group = { ...groupSnapshot.data(), version: groupSnapshot.data().version + 1, controllerType: "teacher", controllerDeviceId: null, controlEpoch: groupSnapshot.data().controlEpoch + 1, delegatedDrawsRemaining: null }; const pool = privateSession.data()?.pool || []; transaction.set(groupStateRef(id, groupId), group); transaction.set(groupRef(id, groupId), publicGroup(group, new Map(pool.map((item) => [item.drawKey, item])))); }
    });
  }));
});

const cleanupExpiredLiveSessions = onSchedule({ region: REGION, schedule: "every 60 minutes", timeoutSeconds: 300, memory: "256MiB" }, async () => {
  const expired = await db.collection("liveGameSessions").where("cleanupAt", "<=", Timestamp.now()).limit(100).get();
  for (const session of expired.docs) { const joinCode = session.data().joinCode; if (joinCode) await db.doc(`liveGameJoinCodes/${joinCode}`).delete().catch(() => {}); await db.recursiveDelete(session.ref); }
  const oldLimits = await db.collection("liveGameJoinRateLimits").where("expiresAt", "<=", Timestamp.now()).limit(500).get(); if (!oldLimits.empty) { const batch = db.batch(); oldLimits.docs.forEach((doc) => batch.delete(doc.ref)); await batch.commit(); }
});

module.exports = { createLiveGameSession, joinLiveGameSession, drawLiveGameWord, controlLiveGameSession, heartbeatLiveGameSession, expireDisconnectedLiveDevices, cleanupExpiredLiveSessions };
