import { getSet, getSets } from "../../js/vocabulary-store.js?v=firebase-authority-1";
import { canUseAiVoice, speakMandarin, playTeacherVoice } from "../../js/audio.js";
import { cacheSafeAudioUrl, getTeacherVoice } from "../../js/teacher-voice-cloud.js";
import { getFirebaseServices } from "../../js/firebase.js";
import { DRAW_MODES, RandomSelectionEngine } from "./random-engine.mjs";
import { LIVE_MODES } from "./live-session-core.mjs";
import { FirebaseLiveSessionTransport } from "./firebase-live-transport.mjs";
import { fitSingleLineText, scheduleSingleLineFit } from "./card-layout.mjs";
import qrcode from "./vendor/qrcode-generator-2.0.4.mjs";

const $ = (selector) => document.querySelector(selector);
const escapeKey = (setId, itemId) => `${setId}::${itemId}`;
const params = new URLSearchParams(location.search);
const state = {
  sets: [], selectedSetIds: new Set(), selectedItemKeys: new Set(), display: new Set(["image", "chinese", "pinyin"]),
  engine: null, current: null, animating: false, teacherVoiceUrl: "", teacherVoiceRevision: null, teacherVoicePromise: Promise.resolve(), audioRequest: 0, voiceAttempt: 0,
  liveClient: null, liveSnapshot: null, liveGroupId: null, liveUnsubscribe: null, liveHeartbeat: null, liveAuthReady: false, joinQrValue: "", joinDisplayTrigger: null
};

function yearLabel(year) { return Number(year) === 0 ? "Prep" : `Year ${year}`; }
function selectedSets() { return state.sets.filter((set) => state.selectedSetIds.has(set.id)); }
function combinedItems() {
  return selectedSets().flatMap((set) => set.items.map((item) => ({ ...item, setId: set.id, setTitle: set.title, drawKey: escapeKey(set.id, item.id) })));
}
function selectedItems() { return combinedItems().filter((item) => state.selectedItemKeys.has(item.drawKey)); }
function isLive() { return Boolean(state.liveClient); }
function activeLiveGroup() { return state.liveSnapshot?.groups?.[state.liveGroupId] || null; }
function joinLink(joinCode = state.liveSnapshot?.joinCode || state.liveClient?.credentials.joinCode || "") {
  const link = new URL("./join.html", location.href); link.searchParams.set("code", joinCode); if (params.get("firebase") === "staging") link.searchParams.set("firebase", "staging"); return link;
}
function drawQr(canvas, value, cssSize) {
  if (!canvas || !value) return;
  const qr = qrcode(0, "M"); qr.addData(value); qr.make();
  const quiet = 4; const modules = qr.getModuleCount(); const total = modules + quiet * 2; const ratio = Math.max(1, window.devicePixelRatio || 1); const cell = Math.max(1, Math.floor(cssSize * ratio / total)); const pixels = total * cell;
  canvas.width = pixels; canvas.height = pixels; canvas.style.width = `${cssSize}px`; canvas.style.height = `${cssSize}px`;
  const context = canvas.getContext("2d"); context.imageSmoothingEnabled = false; context.fillStyle = "#fff"; context.fillRect(0, 0, pixels, pixels); context.fillStyle = "#102e27";
  for (let row = 0; row < modules; row += 1) for (let column = 0; column < modules; column += 1) if (qr.isDark(row, column)) context.fillRect((column + quiet) * cell, (row + quiet) * cell, cell, cell);
}
function updateJoinQr(joinCode) {
  if (!joinCode) return; const value = joinLink(joinCode).href; if (value === state.joinQrValue) return; state.joinQrValue = value; drawQr($("#join-qr"), value, 58); drawQr($("#join-qr-large"), value, 340); $("#join-code-large").textContent = joinCode;
}
function openJoinDisplay(focus, trigger) {
  if (!state.joinQrValue) return; state.joinDisplayTrigger = trigger; const card = $("#join-display-card"); card.classList.toggle("focus-code", focus === "code"); card.classList.toggle("focus-qr", focus === "qr"); $("#join-display-modal").hidden = false; document.body.classList.add("join-display-open"); window.requestAnimationFrame(() => $("#close-join-display").focus());
}
function closeJoinDisplay() { $("#join-display-modal").hidden = true; document.body.classList.remove("join-display-open"); state.joinDisplayTrigger?.focus?.(); state.joinDisplayTrigger = null; }

function renderSets() {
  $("#set-list").replaceChildren(...state.sets.map((set) => {
    const label = document.createElement("label");
    label.className = "set-choice";
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = state.selectedSetIds.has(set.id);
    input.addEventListener("change", () => toggleSet(set, input.checked));
    const text = document.createElement("span");
    const strong = document.createElement("strong"); strong.textContent = set.title;
    const small = document.createElement("small"); small.textContent = `${yearLabel(set.yearLevel)} · ${set.items.length} words · ${set.chineseTitle || "Vocabulary"}`;
    text.append(strong, small); label.append(input, text); return label;
  }));
}

function toggleSet(set, checked) {
  if (checked) {
    state.selectedSetIds.add(set.id);
    set.items.forEach((item) => state.selectedItemKeys.add(escapeKey(set.id, item.id)));
  } else {
    state.selectedSetIds.delete(set.id);
    set.items.forEach((item) => state.selectedItemKeys.delete(escapeKey(set.id, item.id)));
  }
  renderWords();
}

function renderWords() {
  const items = combinedItems();
  const list = $("#word-list"); list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p"); empty.className = "empty-copy"; empty.textContent = "Choose one or more sets to see their words."; list.append(empty);
  } else {
    items.forEach((item) => {
      const label = document.createElement("label"); label.className = "word-choice";
      const input = document.createElement("input"); input.type = "checkbox"; input.checked = state.selectedItemKeys.has(item.drawKey);
      input.addEventListener("change", () => { input.checked ? state.selectedItemKeys.add(item.drawKey) : state.selectedItemKeys.delete(item.drawKey); updateSelectedCount(); });
      const chinese = document.createElement("strong"); chinese.lang = "zh-Hans"; chinese.textContent = item.chinese;
      const text = document.createElement("span"); text.textContent = `${item.pinyin || "No pinyin"} · ${item.english || "No English"}`;
      const setName = document.createElement("small"); setName.textContent = item.setTitle;
      label.append(input, chinese, text, setName); list.append(label);
    });
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = selectedItems().length;
  $("#selected-count").textContent = `${count} selected`;
  $("#start").disabled = count === 0;
}

function displayItem(item, { preview = false } = {}) {
  $("#waiting-copy").hidden = true;
  const image = $("#result-image");
  const showImage = state.display.has("image") && Boolean(item.image);
  image.hidden = !showImage;
  if (showImage) { image.src = item.image; image.alt = item.english ? `${item.english} illustration` : "Vocabulary illustration"; }
  const fields = [["#result-chinese", "chinese"], ["#result-pinyin", "pinyin"], ["#result-english", "english"]];
  fields.forEach(([selector, key]) => { const node = $(selector); node.hidden = !state.display.has(key); node.textContent = item[key] || ""; });
  const visibleCount = Number(showImage) + fields.filter(([, key]) => state.display.has(key)).length;
  $("#result-card").className = `result-card content-${Math.max(1, visibleCount)}${showImage ? " has-image" : ""}${preview ? " previewing" : ""}`;
  scheduleSingleLineFit($("#result-chinese"));
  if (visibleCount === 1 && !showImage) {
    scheduleSingleLineFit($("#result-pinyin"), { minimumSize: 18 });
    scheduleSingleLineFit($("#result-english"), { minimumSize: 18 });
  }
  $("#voice-actions").hidden = preview;
  $("#audio-status").textContent = "";
}

function historyLabel(item) { return item.chinese || item.pinyin || item.english || "Word"; }
function renderHistory() {
  const history = isLive() ? activeLiveGroup()?.historyItems || [] : state.engine.history;
  const list = $("#history-list"); list.replaceChildren();
  if (!history.length) { const empty = document.createElement("li"); empty.className = "history-empty"; empty.textContent = "No words drawn yet"; list.append(empty); }
  else history.forEach((item) => {
    const li = document.createElement("li");
    const coin = document.createElement("button"); coin.type = "button"; coin.className = "history-coin"; coin.setAttribute("aria-pressed", "false");
    const backLabel = item.image ? "picture" : "English"; coin.setAttribute("aria-label", `${historyLabel(item)}. Tap to show ${backLabel}.`);
    const inner = document.createElement("span"); inner.className = "history-coin-inner";
    const front = document.createElement("span"); front.className = "history-coin-face history-coin-front"; front.lang = "zh-Hans"; front.textContent = historyLabel(item);
    const back = document.createElement("span"); back.className = "history-coin-face history-coin-back";
    if (item.image) {
      const image = document.createElement("img"); image.src = item.image; image.alt = item.english || "";
      image.addEventListener("error", () => { back.replaceChildren(); back.textContent = item.english || historyLabel(item); }); back.append(image);
    } else back.textContent = item.english || historyLabel(item);
    inner.append(front, back); coin.append(inner); scheduleSingleLineFit(front, { minimumSize: 8 });
    coin.addEventListener("click", () => { const flipped = coin.classList.toggle("is-flipped"); coin.setAttribute("aria-pressed", String(flipped)); coin.setAttribute("aria-label", flipped ? `${historyLabel(item)}. Tap to show Hanzi.` : `${historyLabel(item)}. Tap to show ${backLabel}.`); });
    const pinyin = document.createElement("small"); pinyin.className = "history-pinyin"; pinyin.textContent = item.pinyin || "";
    li.append(coin, pinyin); list.append(li);
  });
  $("#history-count").textContent = `${history.length} ${history.length === 1 ? "draw" : "draws"}`;
}

window.addEventListener("resize", () => {
  fitSingleLineText($("#result-chinese"));
  if ($("#result-card").classList.contains("content-1")) {
    fitSingleLineText($("#result-pinyin"), { minimumSize: 18 });
    fitSingleLineText($("#result-english"), { minimumSize: 18 });
  }
});

function updatePoolStatus() {
  if (isLive()) {
    const group = activeLiveGroup(); if (!group) { $("#pool-status").textContent = "Waiting for live state…"; return; }
    $("#pool-status").textContent = group.drawMode === DRAW_MODES.NO_REPEAT ? `${group.remainingCount} of ${state.liveSnapshot.pool.length} words remaining` : `${state.liveSnapshot.pool.length} words · repeats allowed`;
  } else if (state.engine.mode === DRAW_MODES.NO_REPEAT) $("#pool-status").textContent = `${state.engine.remainingCount} of ${state.engine.size} words remaining`;
  else $("#pool-status").textContent = `${state.engine.size} words · repeats allowed`;
}

async function loadTeacherVoice(item, request) {
  state.teacherVoiceUrl = "";
  state.teacherVoiceRevision = null;
  if (isLive()) {
    state.teacherVoiceUrl = item.teacherAudioUrl || "";
    state.teacherVoiceRevision = item.teacherVoiceRevision ?? null;
    $("#play-teacher").hidden = !state.teacherVoiceUrl;
    return;
  }
  $("#play-teacher").hidden = true;
  try {
    const metadata = await getTeacherVoice(item.setId, item.id);
    if (request !== state.audioRequest) return;
    state.teacherVoiceUrl = cacheSafeAudioUrl(metadata);
    state.teacherVoiceRevision = metadata?.revision ?? null;
    $("#play-teacher").hidden = !state.teacherVoiceUrl;
  } catch (error) { console.warn("[Word Randomiser Teacher Voice]", error); }
}

function teacherVoice(onFailure) {
  if (!state.teacherVoiceUrl) { onFailure?.("Teacher Voice is not available for this word."); return; }
  playTeacherVoice(state.teacherVoiceUrl, {
    onStart: () => { $("#audio-status").textContent = "Playing Teacher Voice…"; },
    onEnd: () => { $("#audio-status").textContent = ""; },
    onError: () => onFailure?.("Teacher Voice could not be played.")
  });
}

function aiVoice({ fallback = false } = {}) {
  const attempt = ++state.voiceAttempt;
  let started = false; let finished = false;
  const fail = () => {
    if (finished || attempt !== state.voiceAttempt) return;
    finished = true;
    if (fallback && state.teacherVoiceUrl) { window.speechSynthesis?.cancel(); teacherVoice((message) => { $("#audio-status").textContent = message; }); }
    else $("#audio-status").textContent = state.teacherVoiceUrl ? "AI Voice is unavailable. Try Teacher Voice." : "AI Voice is unavailable on this device.";
  };
  if (!canUseAiVoice()) { fail(); return; }
  const startTimeout = window.setTimeout(() => { if (!started) fail(); }, 1800);
  speakMandarin(state.current.chinese, {
    onStart: () => { if (finished) return; started = true; window.clearTimeout(startTimeout); $("#audio-status").textContent = "Playing AI Voice…"; },
    onEnd: () => { if (attempt === state.voiceAttempt && !finished) { finished = true; $("#audio-status").textContent = ""; } },
    onUnavailable: fail, onError: fail
  });
}

async function playPreferredVoice() {
  if (!state.current) return;
  await state.teacherVoicePromise;
  $("#audio-status").textContent = "";
  const mode = $("#voice-mode").value;
  if (mode === "teacher") teacherVoice((message) => { $("#audio-status").textContent = message; });
  else aiVoice({ fallback: mode === "auto" });
}

function finishDraw(item) {
  state.current = item; state.animating = false;
  displayItem(item); renderHistory(); updatePoolStatus();
  $("#draw").disabled = state.engine.isComplete;
  $("#complete-dialog").hidden = !state.engine.isComplete;
  const request = ++state.audioRequest; state.teacherVoicePromise = loadTeacherVoice(item, request);
}

function animateUntil(action, finalise) {
  state.animating = true; $("#draw").disabled = true; $("#gift-box").classList.add("drawing");
  const candidates = isLive() ? state.liveSnapshot.pool : selectedItems(); let timer = null;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) timer = window.setInterval(() => displayItem(candidates[Math.floor(Math.random() * candidates.length)], { preview: true }), 75);
  const minimum = matchMedia("(prefers-reduced-motion: reduce)").matches ? Promise.resolve() : new Promise((resolve) => window.setTimeout(resolve, 450));
  return Promise.all([action(), minimum]).then(([result]) => finalise(result)).finally(() => { if (timer) window.clearInterval(timer); $("#gift-box").classList.remove("drawing"); state.animating = false; if (isLive()) renderLiveControls(); });
}

function draw() {
  if (state.animating) return;
  if (isLive()) {
    const group = activeLiveGroup(); if (!group || group.isComplete || group.controller.type !== "teacher") return;
    animateUntil(() => state.liveClient.draw(state.liveGroupId, { expectedVersion: group.version, controlEpoch: group.controller.epoch }), (result) => showLiveItem(result.item)).catch(showLiveError);
    return;
  }
  if (state.engine.isComplete) return;
  const item = state.engine.draw(); if (!item) return;
  animateUntil(() => Promise.resolve(item), finishDraw);
}

function clearCard() {
  state.current = null; state.audioRequest += 1; state.voiceAttempt += 1; state.teacherVoiceUrl = ""; state.teacherVoiceRevision = null; state.teacherVoicePromise = Promise.resolve();
  $("#result-card").className = "result-card waiting"; $("#waiting-copy").hidden = false;
  ["#result-image", "#result-chinese", "#result-pinyin", "#result-english", "#voice-actions"].forEach((selector) => { $(selector).hidden = true; });
  $("#audio-status").textContent = "";
}

function resetPlayState() {
  state.engine.reset(); state.current = null; state.audioRequest += 1; state.voiceAttempt += 1; state.teacherVoiceUrl = ""; state.teacherVoiceRevision = null; state.teacherVoicePromise = Promise.resolve();
  clearCard(); $("#complete-dialog").hidden = true; $("#draw").disabled = false;
  renderHistory(); updatePoolStatus();
}

function showLiveItem(item) {
  if (!item) return; state.current = item; displayItem(item); const request = ++state.audioRequest; state.teacherVoicePromise = loadTeacherVoice(item, request);
}

function showLiveError(error) {
  console.error("[Word Randomiser Live]", error); const code = error?.code?.replace?.("functions/", "") || error?.code;
  $("#live-message").textContent = code === "aborted" || code === "stale-request" ? "The game changed before that tap arrived. The latest classroom state has been restored." : error?.message || "The live action could not be completed.";
  renderLiveControls();
}

function renderGroupOverview() {
  const groups = Object.values(state.liveSnapshot?.groups || {}); const root = $("#group-overview"); root.hidden = groups.length < 2; root.replaceChildren(...groups.map((group) => {
    const button = document.createElement("button"); button.type = "button"; button.className = group.id === state.liveGroupId ? "active" : "";
    const strong = document.createElement("strong"); strong.textContent = group.name;
    const small = document.createElement("small"); small.textContent = group.currentItem ? `${group.currentItem.chinese || group.currentItem.english} · ${group.drawNumber} draws` : "Waiting for first draw";
    button.append(strong, small); button.addEventListener("click", () => { state.liveGroupId = group.id; applyLiveSnapshot(state.liveSnapshot); }); return button;
  }));
}

function renderLiveControls() {
  const snapshot = state.liveSnapshot; if (!snapshot) return; const group = activeLiveGroup();
  $("#live-connection").textContent = snapshot.status === "active" ? "Live · connected" : "Session ended";
  $("#live-connection").classList.toggle("offline", snapshot.status !== "active"); $("#live-join-code").textContent = snapshot.joinCode; updateJoinQr(snapshot.joinCode);
  $("#connected-count").textContent = snapshot.connectedDeviceCount ?? snapshot.devices?.filter((device) => device.connected !== false).length ?? 0;
  $("#toggle-joining").textContent = snapshot.joiningLocked ? "Unlock joining" : "Lock joining"; $("#toggle-joining").disabled = snapshot.status !== "active";
  $("#end-session").disabled = snapshot.status !== "active";
  const groupSelect = $("#live-group-select"); const groups = Object.values(snapshot.groups || {});
  groupSelect.replaceChildren(...groups.map((entry) => { const option = document.createElement("option"); option.value = entry.id; option.textContent = entry.name; option.selected = entry.id === state.liveGroupId; return option; }));
  const allStudents = (snapshot.devices || []).filter((device) => device.role === "student" && device.connected !== false); const students = allStudents.filter((device) => device.groupId === state.liveGroupId);
  const deviceSelect = $("#live-device-select"); const selectedDevice = deviceSelect.value; deviceSelect.replaceChildren(new Option("Choose a connected iPad…", ""), ...students.map((device) => new Option(device.name || "Student iPad", device.id))); if (students.some((device) => device.id === selectedDevice)) deviceSelect.value = selectedDevice;
  if (snapshot.mode === LIVE_MODES.GROUPS) { deviceSelect.replaceChildren(new Option("Choose a connected iPad…", ""), ...allStudents.map((device) => new Option(`${device.name || "Student iPad"} · ${snapshot.groups[device.groupId]?.name || "Unassigned"}`, device.id))); if (allStudents.some((device) => device.id === selectedDevice)) deviceSelect.value = selectedDevice; }
  const chosen = allStudents.find((device) => device.id === deviceSelect.value); $("#assign-group").hidden = snapshot.mode !== LIVE_MODES.GROUPS; $("#assign-group").disabled = !chosen || chosen.groupId === state.liveGroupId || snapshot.status !== "active";
  $("#delegate-control").disabled = !chosen || chosen.groupId !== state.liveGroupId || snapshot.status !== "active"; $("#revoke-control").disabled = !group || group.controller.type !== "student" || snapshot.status !== "active";
  const teacherCanDraw = Boolean(group && snapshot.status === "active" && group.controller.type === "teacher" && !group.isComplete && !state.animating);
  $("#draw").disabled = !teacherCanDraw;
  $("#live-message").textContent = snapshot.status !== "active" ? "This session has ended. Connected displays remain on the final card." : group?.controller.type === "student" ? `${students.find((device) => device.id === group.controller.deviceId)?.name || "The selected student"} has control for the next draw.` : "Teacher has draw control.";
  renderGroupOverview();
}

function applyLiveSnapshot(snapshot) {
  state.liveSnapshot = snapshot; if (!state.liveGroupId || !snapshot.groups?.[state.liveGroupId]) state.liveGroupId = Object.keys(snapshot.groups || {})[0] || null;
  const group = activeLiveGroup(); if (!group) return;
  state.display = new Set(snapshot.display || state.display); $("#voice-mode").value = snapshot.voiceMode || "auto";
  $("#draw-mode-chip").textContent = group.drawMode === DRAW_MODES.NO_REPEAT ? "No Repeat" : "Allow Repeats";
  if (group.currentItem) showLiveItem(group.currentItem); else clearCard();
  renderHistory(); updatePoolStatus(); $("#complete-dialog").hidden = !group.isComplete; renderLiveControls();
}

async function startLive(items, operatingMode, drawMode) {
  const groupNames = $("#group-names").value.split(",").map((name) => name.trim()).filter(Boolean).slice(0, 8);
  const transport = new FirebaseLiveSessionTransport();
  state.liveClient = await transport.createSession({ items, drawMode, display: [...state.display], voiceMode: $("#voice-mode").value, mode: operatingMode === "live-groups" ? LIVE_MODES.GROUPS : LIVE_MODES.CLASS, groupNames });
  state.liveGroupId = operatingMode === "live-groups" ? "group-1" : "class"; state.engine = null;
  $("#live-session-bar").hidden = false; $("#mode-label").textContent = operatingMode === "live-groups" ? "Live Group Mode" : "Teacher-led Class Mode";
  state.liveUnsubscribe = state.liveClient.watch(applyLiveSnapshot, showLiveError);
  state.liveHeartbeat = window.setInterval(() => { if (document.visibilityState === "visible") state.liveClient.heartbeat().catch(() => {}); }, 120000);
}

async function start() {
  const items = selectedItems();
  state.display = new Set([...document.querySelectorAll('input[name="display"]:checked')].map((input) => input.value));
  if (!items.length) { $("#setup-error").textContent = "Select at least one word to start."; return; }
  if (!state.display.size) { $("#setup-error").textContent = "Choose at least one card display field."; return; }
  $("#setup-error").textContent = ""; const button = $("#start"); button.disabled = true;
  const mode = document.querySelector('input[name="draw-mode"]:checked').value; const operatingMode = $("#classroom-mode").value;
  $("#draw-mode-chip").textContent = mode === DRAW_MODES.NO_REPEAT ? "No Repeat" : "Allow Repeats";
  const displayLabels = { image: "Image", chinese: "Hanzi", pinyin: "Pinyin", english: "English" };
  $("#display-chip").textContent = [...state.display].map((key) => displayLabels[key]).join(" + ");
  $("#play-title").textContent = selectedSets().map((set) => set.title).join(" + ");
  try {
    if (operatingMode.startsWith("live-")) await startLive(items, operatingMode, mode);
    else { state.liveClient = null; state.liveSnapshot = null; $("#live-session-bar").hidden = true; state.engine = new RandomSelectionEngine(items, { mode }); $("#mode-label").textContent = operatingMode === "local-teacher" ? "Local Teacher Mode" : "Local / Group Mode"; resetPlayState(); }
    $("#setup-screen").hidden = true; $("#play-screen").hidden = false; window.scrollTo(0, 0);
  } catch (error) {
    console.error("[Word Randomiser Live Start]", error); const missing = error?.code === "functions/not-found" || /not found/i.test(error?.message || "");
    $("#setup-error").textContent = missing ? "The reviewed Live Session backend has not been deployed yet. Local Mode is still available." : error?.message || "The live session could not be created."; state.liveClient = null;
  } finally { updateSelectedCount(); }
}

function backToSettings() { if (isLive() && state.liveSnapshot?.status === "active") { $("#live-message").textContent = "End the live session before changing its vocabulary or settings."; return; } $("#play-screen").hidden = true; $("#setup-screen").hidden = false; window.scrollTo(0, 0); }

async function resetCurrentPlayState() { if (!isLive()) { resetPlayState(); return; } const group = activeLiveGroup(); if (!group) return; try { await state.liveClient.reset(state.liveGroupId, group.drawMode); } catch (error) { showLiveError(error); } }

$("#select-all").addEventListener("click", () => { combinedItems().forEach((item) => state.selectedItemKeys.add(item.drawKey)); renderWords(); });
$("#deselect-all").addEventListener("click", () => { combinedItems().forEach((item) => state.selectedItemKeys.delete(item.drawKey)); renderWords(); });
$("#start").addEventListener("click", start); $("#draw").addEventListener("click", draw);
$("#reset").addEventListener("click", resetCurrentPlayState); $("#settings").addEventListener("click", backToSettings);
$("#shuffle-again").addEventListener("click", resetCurrentPlayState); $("#play-preferred").addEventListener("click", playPreferredVoice);
$("#play-teacher").addEventListener("click", () => teacherVoice((message) => { $("#audio-status").textContent = message; }));
$("#classroom-mode").addEventListener("change", () => { const mode = $("#classroom-mode").value; $("#live-auth-tools").hidden = !mode.startsWith("live-"); $("#group-names-wrap").hidden = mode !== "live-groups"; });
$("#live-group-select").addEventListener("change", () => { state.liveGroupId = $("#live-group-select").value; applyLiveSnapshot(state.liveSnapshot); });
$("#live-device-select").addEventListener("change", renderLiveControls);
$("#assign-group").addEventListener("click", async () => { try { await state.liveClient.assignGroup($("#live-device-select").value, state.liveGroupId); } catch (error) { showLiveError(error); } });
$("#delegate-control").addEventListener("click", async () => { try { await state.liveClient.delegate(state.liveGroupId, $("#live-device-select").value, { draws: 1 }); } catch (error) { showLiveError(error); } });
$("#revoke-control").addEventListener("click", async () => { try { await state.liveClient.revoke(state.liveGroupId); } catch (error) { showLiveError(error); } });
$("#toggle-joining").addEventListener("click", async () => { try { await state.liveClient.setJoiningLocked(!state.liveSnapshot.joiningLocked); } catch (error) { showLiveError(error); } });
$("#copy-join-link").addEventListener("click", async () => { const link = joinLink(); try { await navigator.clipboard.writeText(link.href); $("#live-message").textContent = "Join link copied."; } catch { $("#live-message").textContent = link.href; } });
$("#show-join-code").addEventListener("click", (event) => openJoinDisplay("code", event.currentTarget));
$("#show-join-qr").addEventListener("click", (event) => openJoinDisplay("qr", event.currentTarget));
$("#close-join-display").addEventListener("click", closeJoinDisplay);
$("#join-display-modal").addEventListener("click", (event) => { if (event.target === $("#join-display-modal")) closeJoinDisplay(); });
$("#join-display-code").addEventListener("click", async () => { const code = state.liveSnapshot?.joinCode || ""; try { await navigator.clipboard.writeText(code); $("#join-display-code").setAttribute("data-copied", "true"); window.setTimeout(() => $("#join-display-code").removeAttribute("data-copied"), 1200); } catch {} });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#join-display-modal").hidden) closeJoinDisplay(); });
$("#end-session").addEventListener("click", async () => { if (!confirm("End this live classroom session? Connected student displays will become read-only.")) return; try { await state.liveClient.end(); window.clearInterval(state.liveHeartbeat); } catch (error) { showLiveError(error); } });

async function initialiseLiveAuth() {
  if (state.liveAuthReady) return; state.liveAuthReady = true;
  try {
    const services = await getFirebaseServices();
    $("#live-sign-in").addEventListener("click", async () => {
      try {
        const provider = new services.authSdk.GoogleAuthProvider();
        const stagingPages = services.app.options.projectId === "the-mandarin-room-staging" && location.hostname === "themandarinroom.github.io";
        if (stagingPages) await services.authSdk.signInWithRedirect(services.auth, provider);
        else await services.authSdk.signInWithPopup(services.auth, provider);
      } catch (error) { $("#live-auth-status").textContent = error.message; }
    });
    services.authSdk.onAuthStateChanged(services.auth, async (user) => {
      let authorised = false; if (user) { try { const snapshot = await services.firestoreSdk.getDoc(services.firestoreSdk.doc(services.db, "authorizedTeachers", user.uid)); authorised = snapshot.exists() && snapshot.data().active === true; } catch (error) { console.error(error); } }
      $("#live-sign-in").hidden = Boolean(user); $("#live-auth-status").textContent = !user ? "Sign in is required to create a live session." : authorised ? `Ready as ${user.email || user.displayName || "teacher"}.` : "This account is not authorised to create classroom sessions.";
    });
  } catch (error) { $("#live-auth-status").textContent = "Firebase sign-in is unavailable."; console.error(error); }
}
$("#classroom-mode").addEventListener("focus", initialiseLiveAuth, { once: true });

try {
  const requested = params.get("set");
  const sets = await getSets();
  if (requested) {
    const selectedSet = await getSet(requested);
    const existingIndex = sets.findIndex((entry) => entry.id === requested);
    if (selectedSet && existingIndex >= 0) sets[existingIndex] = selectedSet;
    else if (selectedSet) sets.push(selectedSet);
    else if (existingIndex >= 0) sets.splice(existingIndex, 1);
  }
  state.sets = sets.sort((a, b) => Number(a.yearLevel) - Number(b.yearLevel) || a.title.localeCompare(b.title));
  $("#library-status").textContent = `${state.sets.length} live sets`;
  if (requested) { const set = state.sets.find((entry) => entry.id === requested); if (set) toggleSet(set, true); }
  renderSets(); renderWords();
} catch (error) {
  console.error("[Word Randomiser Vocabulary]", error); $("#library-status").textContent = "Library unavailable";
  $("#set-list").innerHTML = '<p class="empty-copy">Vocabulary could not be loaded. Check your connection and try again.</p>';
}
