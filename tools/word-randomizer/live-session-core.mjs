import { DRAW_MODES } from "./random-engine.mjs";

export const LIVE_MODES = Object.freeze({ CLASS: "class", GROUPS: "groups" });
export const CONTROLLERS = Object.freeze({ TEACHER: "teacher", STUDENT: "student" });

export class LiveSessionError extends Error {
  constructor(code, message) { super(message); this.name = "LiveSessionError"; this.code = code; }
}

const clone = (value) => structuredClone(value);
const assert = (condition, code, message) => { if (!condition) throw new LiveSessionError(code, message); };

export function normaliseLivePool(items) {
  assert(Array.isArray(items) && items.length > 0, "empty-pool", "Select at least one vocabulary item.");
  const keys = new Set();
  return items.map((item) => {
    const key = String(item.drawKey || `${item.setId || "set"}::${item.id || "item"}`);
    assert(!keys.has(key), "duplicate-word", `Duplicate draw key: ${key}`); keys.add(key);
    return {
      drawKey: key, setId: String(item.setId || ""), id: String(item.id || ""),
      chinese: String(item.chinese || ""), pinyin: String(item.pinyin || ""), english: String(item.english || ""),
      image: String(item.image || ""), teacherAudioUrl: String(item.teacherAudioUrl || ""),
      teacherVoiceRevision: item.teacherVoiceRevision ?? null
    };
  });
}

export function createLiveGroup({ id = "class", name = "Whole class", itemKeys, drawMode = DRAW_MODES.NO_REPEAT } = {}) {
  assert(Object.values(DRAW_MODES).includes(drawMode), "invalid-mode", "Unknown draw mode.");
  assert(Array.isArray(itemKeys) && itemKeys.length > 0, "empty-pool", "A group needs vocabulary.");
  return {
    id, name, drawMode, version: 0, round: 1, drawNumber: 0, currentItemKey: null,
    history: [], remainingItemKeys: [...itemKeys],
    controller: { type: CONTROLLERS.TEACHER, deviceId: null, epoch: 0, drawsRemaining: null },
    processedRequests: []
  };
}

function requestResult(group, requestId) { return group.processedRequests.find((entry) => entry.requestId === requestId) || null; }
function boundedRequests(requests, entry) { return [...requests, entry].slice(-60); }

export function drawLiveGroup(groupInput, pool, request, random = Math.random) {
  const group = clone(groupInput);
  const duplicate = requestResult(group, request.requestId);
  if (duplicate) return { group, item: pool.find((item) => item.drawKey === duplicate.itemKey), duplicate: true };
  assert(request.requestId, "missing-request-id", "A draw request ID is required.");
  assert(request.expectedVersion === group.version, "stale-request", "The game changed. Refresh before drawing again.");
  assert(request.controlEpoch === group.controller.epoch, "revoked-control", "Draw control has changed.");
  const isTeacher = request.role === CONTROLLERS.TEACHER;
  const authorisedStudent = group.controller.type === CONTROLLERS.STUDENT && request.role === CONTROLLERS.STUDENT && request.deviceId === group.controller.deviceId;
  assert((isTeacher && group.controller.type === CONTROLLERS.TEACHER) || authorisedStudent, "not-controller", "This device is not allowed to draw.");

  const source = group.drawMode === DRAW_MODES.NO_REPEAT ? group.remainingItemKeys : pool.map((item) => item.drawKey);
  assert(source.length > 0, "round-complete", "All words have been drawn.");
  const value = Number(random());
  const index = Math.min(source.length - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * source.length)));
  const itemKey = source[index];
  const item = pool.find((entry) => entry.drawKey === itemKey);
  assert(item, "missing-word", "The selected vocabulary item no longer exists.");
  if (group.drawMode === DRAW_MODES.NO_REPEAT) group.remainingItemKeys.splice(index, 1);
  group.version += 1; group.drawNumber += 1; group.currentItemKey = itemKey; group.history.push(itemKey);
  group.processedRequests = boundedRequests(group.processedRequests, { requestId: request.requestId, itemKey, version: group.version });
  if (authorisedStudent && group.controller.drawsRemaining === 1) {
    group.controller = { type: CONTROLLERS.TEACHER, deviceId: null, epoch: group.controller.epoch + 1, drawsRemaining: null };
  }
  return { group, item, duplicate: false };
}

export function delegateLiveGroup(groupInput, deviceId, { draws = 1 } = {}) {
  assert(deviceId, "missing-device", "Choose a connected student device.");
  const group = clone(groupInput); group.version += 1;
  group.controller = { type: CONTROLLERS.STUDENT, deviceId, epoch: group.controller.epoch + 1, drawsRemaining: draws === Infinity ? null : Math.max(1, Number(draws) || 1) };
  return group;
}

export function revokeLiveGroup(groupInput) {
  const group = clone(groupInput); group.version += 1;
  group.controller = { type: CONTROLLERS.TEACHER, deviceId: null, epoch: group.controller.epoch + 1, drawsRemaining: null };
  return group;
}

export function resetLiveGroup(groupInput, itemKeys, drawMode = groupInput.drawMode) {
  const next = createLiveGroup({ id: groupInput.id, name: groupInput.name, itemKeys, drawMode });
  next.version = groupInput.version + 1; next.round = groupInput.round + 1;
  next.controller.epoch = groupInput.controller.epoch + 1;
  return next;
}

export function publicSessionSnapshot(session) {
  const poolByKey = new Map(session.pool.map((item) => [item.drawKey, item]));
  return clone({
    id: session.id, joinCode: session.joinCode, status: session.status, joiningLocked: session.joiningLocked,
    mode: session.mode, display: session.display, voiceMode: session.voiceMode, connectedDeviceCount: session.connectedDeviceCount,
    expiresAt: session.expiresAt, pool: session.pool,
    devices: [...session.devices.values()].filter((device) => device.connected).map(({ token, tokenHash, ...device }) => device),
    groups: Object.fromEntries([...session.groups].map(([id, group]) => [id, {
      ...group, currentItem: group.currentItemKey ? poolByKey.get(group.currentItemKey) : null,
      historyItems: group.history.map((key) => poolByKey.get(key)).filter(Boolean),
      remainingCount: group.drawMode === DRAW_MODES.NO_REPEAT ? group.remainingItemKeys.length : session.pool.length,
      isComplete: group.drawMode === DRAW_MODES.NO_REPEAT && group.remainingItemKeys.length === 0
    }]))
  });
}
