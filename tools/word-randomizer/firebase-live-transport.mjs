import { getFirebaseServices } from "../../js/firebase.js";

const REGION = "australia-southeast1";
const STORAGE_PREFIX = "tmr-live-session:";

function credentialsKey(sessionId) { return `${STORAGE_PREFIX}${sessionId}`; }
function codeKey(joinCode) { return `${STORAGE_PREFIX}code:${String(joinCode).toUpperCase()}`; }
function saveCredentials(credentials) { sessionStorage.setItem(credentialsKey(credentials.sessionId), JSON.stringify(credentials)); if (credentials.joinCode) sessionStorage.setItem(codeKey(credentials.joinCode), credentials.sessionId); }
function callable(services, name) { return services.functionsSdk.httpsCallable(services.functions, name); }

export class FirebaseLiveSessionTransport {
  async createSession(config) {
    const services = await getFirebaseServices();
    const result = await callable(services, "createLiveGameSession")(config);
    const credentials = result.data; saveCredentials(credentials);
    return new FirebaseLiveSessionClient(services, credentials);
  }

  async join(joinCode, details = {}) {
    const services = await getFirebaseServices();
    const result = await callable(services, "joinLiveGameSession")({ joinCode: String(joinCode).trim().toUpperCase(), ...details });
    const credentials = result.data; saveCredentials(credentials);
    return new FirebaseLiveSessionClient(services, credentials);
  }

  async resume(sessionId) {
    const stored = sessionStorage.getItem(credentialsKey(sessionId));
    if (!stored) return null;
    try { return new FirebaseLiveSessionClient(await getFirebaseServices(), JSON.parse(stored)); }
    catch { sessionStorage.removeItem(credentialsKey(sessionId)); return null; }
  }

  async resumeByCode(joinCode) { const sessionId = sessionStorage.getItem(codeKey(joinCode)); return sessionId ? this.resume(sessionId) : null; }
}

export class FirebaseLiveSessionClient {
  #services; #credentials; #snapshot = null; #unsubscribers = [];
  constructor(services, credentials) { this.#services = services; this.#credentials = { ...credentials }; }
  get credentials() { return { ...this.#credentials }; }
  get deviceId() { return this.#credentials.deviceId; }
  snapshot() { return this.#snapshot ? structuredClone(this.#snapshot) : null; }

  watch(listener, onError = console.error) {
    this.stopWatching();
    const { firestoreSdk: fs, db } = this.#services; const sessionId = this.#credentials.sessionId;
    let session = null; let groups = {}; let devices = []; let assignedGroupId = this.#credentials.groupId || null; let groupUnsubscribe = null;
    const publish = () => { if (!session) return; this.#snapshot = { ...session, joinCode: this.#credentials.joinCode, groups, devices, assignedGroupId, connectedDeviceCount: this.#credentials.role === "teacher" ? devices.filter((device) => device.connected !== false).length : undefined }; listener(this.snapshot()); };
    const watchStudentGroup = (groupId) => {
      if (!groupId || assignedGroupId === groupId && groupUnsubscribe) return; groupUnsubscribe?.(); assignedGroupId = groupId; groups = {};
      groupUnsubscribe = fs.onSnapshot(fs.doc(db, "liveGameSessions", sessionId, "groups", groupId), (doc) => { groups = doc.exists() ? { [groupId]: { id: groupId, ...doc.data() } } : {}; publish(); }, onError);
      this.#unsubscribers.push(() => { groupUnsubscribe?.(); groupUnsubscribe = null; });
    };
    this.#unsubscribers.push(fs.onSnapshot(fs.doc(db, "liveGameSessions", sessionId, "public", "state"), (doc) => { if (!doc.exists()) { onError(new Error("Live session not found.")); return; } session = { id: sessionId, ...doc.data() }; publish(); }, onError));
    if (this.#credentials.role === "teacher") {
      this.#unsubscribers.push(fs.onSnapshot(fs.collection(db, "liveGameSessions", sessionId, "groups"), (query) => { groups = Object.fromEntries(query.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])); publish(); }, onError));
      this.#unsubscribers.push(fs.onSnapshot(fs.collection(db, "liveGameSessions", sessionId, "devices"), (query) => { devices = query.docs.map((doc) => ({ id: doc.id, ...doc.data() })); publish(); }, onError));
    } else {
      this.#unsubscribers.push(fs.onSnapshot(fs.doc(db, "liveGameSessions", sessionId, "deviceViews", this.#credentials.deviceViewId), (doc) => { if (!doc.exists()) { onError(new Error("This device is no longer part of the session.")); return; } watchStudentGroup(doc.data().groupId); }, onError));
      watchStudentGroup(assignedGroupId);
    }
    return () => this.stopWatching();
  }

  stopWatching() { this.#unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe()); }
  #command(name, payload = {}) { return callable(this.#services, name)({ ...this.#credentials, ...payload }).then((result) => result.data); }
  draw(groupId, { requestId = crypto.randomUUID(), expectedVersion, controlEpoch } = {}) { return this.#command("drawLiveGameWord", { groupId, requestId, expectedVersion, controlEpoch }); }
  delegate(groupId, deviceId, { draws = 1 } = {}) { return this.#command("controlLiveGameSession", { action: "delegate", groupId, deviceId, draws }); }
  revoke(groupId) { return this.#command("controlLiveGameSession", { action: "revoke", groupId }); }
  reset(groupId, drawMode) { return this.#command("controlLiveGameSession", { action: "reset", groupId, drawMode }); }
  setJoiningLocked(locked) { return this.#command("controlLiveGameSession", { action: "set-lock", locked }); }
  assignGroup(deviceId, groupId) { return this.#command("controlLiveGameSession", { action: "assign-group", deviceId, groupId }); }
  end() { return this.#command("controlLiveGameSession", { action: "end" }); }
  heartbeat() { return this.#command("heartbeatLiveGameSession"); }
}

export const firebaseLiveRegion = REGION;
