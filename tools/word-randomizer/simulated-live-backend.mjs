import { CONTROLLERS, LIVE_MODES, LiveSessionError, createLiveGroup, delegateLiveGroup, drawLiveGroup, normaliseLivePool, publicSessionSnapshot, resetLiveGroup, revokeLiveGroup } from "./live-session-core.mjs";

const randomId = (prefix = "id") => `${prefix}-${crypto.randomUUID()}`;
const token = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class SimulatedLiveSessionBackend {
  #sessions = new Map(); #codes = new Map(); #listeners = new Map(); #random; #queue = Promise.resolve();
  constructor({ random = Math.random } = {}) { this.#random = random; }

  #serial(operation) { const pending = this.#queue.then(operation, operation); this.#queue = pending.catch(() => {}); return pending; }
  #joinCode() { let code; do { code = Array.from({ length: 5 }, () => codeAlphabet[Math.floor(this.#random() * codeAlphabet.length)]).join(""); } while (this.#codes.has(code)); return code; }
  #snapshotFor(session, device) { const snapshot = publicSessionSnapshot(session); snapshot.assignedGroupId = device.groupId; if (device.role !== CONTROLLERS.TEACHER) { snapshot.devices = []; snapshot.connectedDeviceCount = undefined; } return snapshot; }
  #emit(session) { for (const entry of this.#listeners.get(session.id) || []) { const device = session.devices.get(entry.deviceId); if (device) queueMicrotask(() => entry.listener(this.#snapshotFor(session, device))); } }
  #session(id) { const session = this.#sessions.get(id); if (!session) throw new LiveSessionError("session-not-found", "Live session not found."); return session; }
  #device(session, credentials) {
    const device = session.devices.get(credentials?.deviceId);
    if (!device || device.token !== credentials?.deviceToken) throw new LiveSessionError("invalid-device", "This device is not part of the session.");
    if (!device.connected) device.connected = true;
    return device;
  }
  #teacher(session, credentials) { const device = this.#device(session, credentials); if (device.role !== CONTROLLERS.TEACHER) throw new LiveSessionError("teacher-required", "Teacher control is required."); return device; }

  async createSession({ teacherId = "teacher", teacherName = "Teacher", mode = LIVE_MODES.CLASS, items, drawMode, display = ["image", "chinese", "pinyin"], voiceMode = "auto", groupNames = ["Group A", "Group B"] }) {
    return this.#serial(() => {
      const pool = normaliseLivePool(items); const id = randomId("session"); const joinCode = this.#joinCode(); const teacherDeviceId = randomId("teacher-device"); const teacherToken = token();
      const groups = new Map();
      if (mode === LIVE_MODES.GROUPS) groupNames.forEach((name, index) => { const groupId = `group-${index + 1}`; groups.set(groupId, createLiveGroup({ id: groupId, name, itemKeys: pool.map((item) => item.drawKey), drawMode })); });
      else groups.set("class", createLiveGroup({ itemKeys: pool.map((item) => item.drawKey), drawMode }));
      const session = { id, joinCode, teacherId, status: "active", joiningLocked: false, mode, display, voiceMode, pool, groups, connectedDeviceCount: 1, expiresAt: Date.now() + 12 * 60 * 60 * 1000, devices: new Map([[teacherDeviceId, { id: teacherDeviceId, name: teacherName, role: CONTROLLERS.TEACHER, groupId: mode === LIVE_MODES.CLASS ? "class" : null, token: teacherToken, connected: true }]]) };
      this.#sessions.set(id, session); this.#codes.set(joinCode, id); this.#emit(session);
      return this.client({ sessionId: id, deviceId: teacherDeviceId, deviceToken: teacherToken });
    });
  }

  async join(joinCode, { name = "Student iPad", groupId = null } = {}) {
    return this.#serial(() => {
      const sessionId = this.#codes.get(String(joinCode).toUpperCase()); const session = this.#session(sessionId);
      if (session.status !== "active") throw new LiveSessionError("session-ended", "This session has ended.");
      if (session.joiningLocked) throw new LiveSessionError("joining-locked", "The teacher has locked joining.");
      const assignedGroup = session.mode === LIVE_MODES.CLASS ? "class" : groupId || session.groups.keys().next().value;
      if (!session.groups.has(assignedGroup)) throw new LiveSessionError("group-not-found", "Choose an available group.");
      const deviceId = randomId("student-device"); const deviceToken = token();
      session.devices.set(deviceId, { id: deviceId, name, role: CONTROLLERS.STUDENT, groupId: assignedGroup, token: deviceToken, connected: true });
      session.connectedDeviceCount += 1; this.#emit(session);
      return this.client({ sessionId: session.id, deviceId, deviceToken });
    });
  }

  client(credentials) {
    const backend = this; const creds = { ...credentials };
    return {
      credentials: { ...creds },
      get deviceId() { return creds.deviceId; },
      snapshot() { const session = backend.#session(creds.sessionId); const device = backend.#device(session, creds); return backend.#snapshotFor(session, device); },
      watch(listener) { const session = backend.#session(creds.sessionId); const device = backend.#device(session, creds); if (!backend.#listeners.has(session.id)) backend.#listeners.set(session.id, new Set()); const entry = { listener, deviceId: device.id }; backend.#listeners.get(session.id).add(entry); listener(backend.#snapshotFor(session, device)); return () => backend.#listeners.get(session.id)?.delete(entry); },
      draw(groupId, options = {}) { return backend.draw(creds, groupId, options); },
      delegate(groupId, deviceId, options) { return backend.delegate(creds, groupId, deviceId, options); },
      revoke(groupId) { return backend.revoke(creds, groupId); },
      reset(groupId, drawMode) { return backend.reset(creds, groupId, drawMode); },
      setJoiningLocked(locked) { return backend.setJoiningLocked(creds, locked); },
      assignGroup(deviceId, groupId) { return backend.assignGroup(creds, deviceId, groupId); },
      end() { return backend.end(creds); },
      disconnect() { return backend.disconnect(creds); }
    };
  }

  resume(credentials) { const session = this.#session(credentials.sessionId); this.#device(session, credentials); this.#emit(session); return this.client(credentials); }

  async draw(credentials, groupId, { requestId = randomId("draw"), expectedVersion, controlEpoch } = {}) {
    return this.#serial(() => {
      const session = this.#session(credentials.sessionId); const device = this.#device(session, credentials);
      if (session.status !== "active") throw new LiveSessionError("session-ended", "This session has ended.");
      const group = session.groups.get(groupId || device.groupId); if (!group) throw new LiveSessionError("group-not-found", "Group not found.");
      if (device.role === CONTROLLERS.STUDENT && device.groupId !== group.id) throw new LiveSessionError("wrong-group", "This device belongs to another group.");
      const request = { requestId, expectedVersion: expectedVersion ?? group.version, controlEpoch: controlEpoch ?? group.controller.epoch, role: device.role, deviceId: device.id };
      const result = drawLiveGroup(group, session.pool, request, this.#random); session.groups.set(group.id, result.group); this.#emit(session);
      return { ...result, snapshot: this.#snapshotFor(session, device) };
    });
  }

  async delegate(credentials, groupId, deviceId, options) { return this.#serial(() => { const session = this.#session(credentials.sessionId); this.#teacher(session, credentials); const device = session.devices.get(deviceId); if (!device?.connected || device.role !== CONTROLLERS.STUDENT) throw new LiveSessionError("invalid-student", "Choose a connected student device."); if (device.groupId !== groupId) throw new LiveSessionError("wrong-group", "That device belongs to another group."); session.groups.set(groupId, delegateLiveGroup(session.groups.get(groupId), deviceId, options)); this.#emit(session); return publicSessionSnapshot(session); }); }
  async revoke(credentials, groupId) { return this.#serial(() => { const session = this.#session(credentials.sessionId); this.#teacher(session, credentials); session.groups.set(groupId, revokeLiveGroup(session.groups.get(groupId))); this.#emit(session); return publicSessionSnapshot(session); }); }
  async reset(credentials, groupId, drawMode) { return this.#serial(() => { const session = this.#session(credentials.sessionId); this.#teacher(session, credentials); const group = session.groups.get(groupId); session.groups.set(groupId, resetLiveGroup(group, session.pool.map((item) => item.drawKey), drawMode || group.drawMode)); this.#emit(session); return publicSessionSnapshot(session); }); }
  async setJoiningLocked(credentials, locked) { return this.#serial(() => { const session = this.#session(credentials.sessionId); this.#teacher(session, credentials); session.joiningLocked = Boolean(locked); this.#emit(session); return publicSessionSnapshot(session); }); }
  async assignGroup(credentials, deviceId, groupId) { return this.#serial(() => { const session = this.#session(credentials.sessionId); this.#teacher(session, credentials); const device = session.devices.get(deviceId); if (!device || device.role !== CONTROLLERS.STUDENT || !session.groups.has(groupId)) throw new LiveSessionError("invalid-assignment", "Device or group is invalid."); for (const [id, group] of session.groups) if (group.controller.deviceId === deviceId) session.groups.set(id, revokeLiveGroup(group)); device.groupId = groupId; this.#emit(session); return publicSessionSnapshot(session); }); }
  async end(credentials) { return this.#serial(() => { const session = this.#session(credentials.sessionId); this.#teacher(session, credentials); session.status = "ended"; session.joiningLocked = true; this.#codes.delete(session.joinCode); this.#emit(session); return publicSessionSnapshot(session); }); }
  async disconnect(credentials) { return this.#serial(() => { const session = this.#session(credentials.sessionId); const device = this.#device(session, credentials); if (device.connected) { device.connected = false; session.connectedDeviceCount = Math.max(0, session.connectedDeviceCount - 1); for (const [id, group] of session.groups) if (group.controller.deviceId === device.id) session.groups.set(id, revokeLiveGroup(group)); this.#emit(session); } }); }
}
