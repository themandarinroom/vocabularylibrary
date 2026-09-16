import { canUseAiVoice, speakMandarin, playTeacherVoice } from "../../js/audio.js";
import { FirebaseLiveSessionTransport } from "./firebase-live-transport.mjs";
import { fitSingleLineText, scheduleSingleLineFit } from "./card-layout.mjs";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const state = { client: null, snapshot: null, pendingSnapshot: null, groupId: null, current: null, teacherVoiceUrl: "", teacherVoiceRevision: null, voiceMode: "auto", drawing: false };
const transport = new FirebaseLiveSessionTransport();

function groupFor(snapshot) {
  const groups = Object.values(snapshot.groups || {});
  return snapshot.groups?.[snapshot.assignedGroupId] || snapshot.groups?.[state.groupId] || groups[0] || null;
}

function renderCard(item, display, { preview = false } = {}) {
  const card = $("#student-result-card"); $("#student-waiting").hidden = Boolean(item);
  if (!item) { card.className = "result-card waiting"; ["#student-image", "#student-chinese", "#student-pinyin", "#student-english", "#student-voice-actions"].forEach((selector) => { $(selector).hidden = true; }); return; }
  const enabled = new Set(display); const image = $("#student-image"); const showImage = enabled.has("image") && Boolean(item.image); image.hidden = !showImage; if (showImage) { image.src = item.image; image.alt = item.english ? `${item.english} illustration` : "Vocabulary illustration"; }
  [["#student-chinese", "chinese"], ["#student-pinyin", "pinyin"], ["#student-english", "english"]].forEach(([selector, key]) => { const node = $(selector); node.hidden = !enabled.has(key); node.textContent = item[key] || ""; });
  const count = Number(showImage) + ["chinese", "pinyin", "english"].filter((key) => enabled.has(key)).length; card.className = `result-card content-${Math.max(1, count)}${showImage ? " has-image" : ""}${preview ? " previewing" : ""}`; scheduleSingleLineFit($("#student-chinese")); if (count === 1 && !showImage) { scheduleSingleLineFit($("#student-pinyin"), { minimumSize: 18 }); scheduleSingleLineFit($("#student-english"), { minimumSize: 18 }); } $("#student-voice-actions").hidden = preview;
}

function loadTeacherVoice(item) {
  state.teacherVoiceUrl = item?.teacherAudioUrl || "";
  state.teacherVoiceRevision = item?.teacherVoiceRevision ?? null;
  $("#student-play-teacher").hidden = !state.teacherVoiceUrl;
}

function render(snapshot) {
  if (state.drawing) { state.pendingSnapshot = snapshot; return; }
  state.snapshot = snapshot; const group = groupFor(snapshot); if (!group) return; state.groupId = group.id; state.voiceMode = snapshot.voiceMode || "auto";
  $("#student-connection").textContent = snapshot.status === "active" ? "Live · connected" : "Session ended"; $("#student-connection").classList.toggle("offline", snapshot.status !== "active");
  $("#student-group").textContent = group.name; $("#student-draw-number").textContent = `Draw ${group.drawNumber}`;
  state.current = group.currentItem || null; renderCard(state.current, snapshot.display || ["image", "chinese", "pinyin"]); if (state.current) loadTeacherVoice(state.current);
  const authorised = snapshot.status === "active" && group.controller?.type === "student" && group.controller.deviceId === state.client.deviceId && !group.isComplete;
  $("#student-draw").hidden = !authorised; $("#student-draw").disabled = state.drawing;
  $("#student-session-message").textContent = snapshot.status !== "active" ? "The teacher has ended this session." : group.isComplete ? "All words have been drawn." : authorised ? "You have control for the next draw." : "Waiting for the teacher…";
}

function showError(error) { console.error("[Student Live Session]", error); $("#student-session-message").textContent = error?.message || "Connection interrupted. Reconnecting…"; state.drawing = false; if (state.snapshot) render(state.snapshot); }

async function enterSession(client) {
  state.client = client; state.groupId = client.credentials.groupId || "class"; $("#student-join").hidden = true; $("#student-session").hidden = false;
  client.watch(render, showError); window.setInterval(() => { if (document.visibilityState === "visible") client.heartbeat().catch(showError); }, 120000);
}

async function join() {
  const code = $("#student-code").value.trim().toUpperCase(); const name = $("#student-name").value.trim() || "Student iPad"; $("#student-join-error").textContent = ""; $("#student-join-button").disabled = true;
  try { await enterSession(await transport.join(code, { name })); }
  catch (error) { $("#student-join-error").textContent = error?.message || "Could not join this class."; $("#student-join-button").disabled = false; }
}

$("#student-join-button").addEventListener("click", join);
$("#student-code").addEventListener("input", () => { $("#student-code").value = $("#student-code").value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5); });
$("#student-draw").addEventListener("click", async () => {
  const group = groupFor(state.snapshot); if (!group || state.drawing) return;
  state.drawing = true; state.pendingSnapshot = null; $("#student-draw").disabled = true; $("#student-session-message").textContent = "Drawing…";
  const candidates = Array.isArray(state.snapshot?.pool) ? state.snapshot.pool : [];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let previewTimer = null;
  if (!reducedMotion && candidates.length) previewTimer = window.setInterval(() => {
    const preview = candidates[Math.floor(Math.random() * candidates.length)];
    renderCard(preview, state.snapshot.display || ["image", "chinese", "pinyin"], { preview: true });
  }, 75);
  const minimum = reducedMotion ? Promise.resolve() : new Promise((resolve) => window.setTimeout(resolve, 525));
  try {
    const [result] = await Promise.all([state.client.draw(group.id, { expectedVersion: group.version, controlEpoch: group.controller.epoch }), minimum]);
    if (previewTimer) window.clearInterval(previewTimer);
    state.drawing = false;
    const authoritativeSnapshot = state.pendingSnapshot; state.pendingSnapshot = null;
    if (authoritativeSnapshot) render(authoritativeSnapshot);
    else if (result?.item) {
      state.current = result.item; renderCard(result.item, state.snapshot.display || ["image", "chinese", "pinyin"]); loadTeacherVoice(result.item);
      $("#student-draw").hidden = true; $("#student-session-message").textContent = "Waiting for the teacher…";
    }
  } catch (error) {
    if (previewTimer) window.clearInterval(previewTimer);
    showError(error);
  } finally {
    state.drawing = false;
    if (state.pendingSnapshot) { const latest = state.pendingSnapshot; state.pendingSnapshot = null; render(latest); }
    else if (state.snapshot && !state.current) render(state.snapshot);
  }
});
$("#student-play-teacher").addEventListener("click", () => { if (!state.teacherVoiceUrl) return; playTeacherVoice(state.teacherVoiceUrl, { onStart: () => { $("#student-audio-status").textContent = "Playing Teacher Voice…"; }, onEnd: () => { $("#student-audio-status").textContent = ""; }, onError: () => { $("#student-audio-status").textContent = "Teacher Voice could not be played."; } }); });
$("#student-play-voice").addEventListener("click", () => {
  if (!state.current) return; const fallback = () => { if (state.teacherVoiceUrl) $("#student-play-teacher").click(); else $("#student-audio-status").textContent = "AI Voice is unavailable on this device."; };
  if (state.voiceMode === "teacher") { fallback(); return; } if (!canUseAiVoice()) { fallback(); return; }
  speakMandarin(state.current.chinese, { onStart: () => { $("#student-audio-status").textContent = "Playing AI Voice…"; }, onEnd: () => { $("#student-audio-status").textContent = ""; }, onUnavailable: fallback, onError: state.voiceMode === "auto" ? fallback : () => { $("#student-audio-status").textContent = "AI Voice is unavailable."; } });
});

const requestedCode = String(params.get("code") || "").toUpperCase();
if (requestedCode) {
  $("#student-code").value = requestedCode;
  const resumed = await transport.resumeByCode(requestedCode); if (resumed) enterSession(resumed).catch(showError);
}
window.addEventListener("resize", () => {
  fitSingleLineText($("#student-chinese"));
  if ($("#student-result-card").classList.contains("content-1")) {
    fitSingleLineText($("#student-pinyin"), { minimumSize: 18 });
    fitSingleLineText($("#student-english"), { minimumSize: 18 });
  }
});
