import { getSets, getSet } from "./vocabulary-store.js";
import { canUseAiVoice, speakMandarin, playTeacherVoice } from "./audio.js";
import { cacheSafeAudioUrl, watchTeacherVoice } from "./teacher-voice-cloud.js";
import { initialiseTeacherVoiceAuth } from "./teacher-voice-ui.js?v=auth-diagnostics-2";

const app = document.querySelector("#app");
const grid = document.querySelector("#set-grid");
const vocabularySets = getSets();
let activeYear = "all";

initialiseTeacherVoiceAuth(() => "");

function setIdFromUrl() {
  return new URLSearchParams(window.location.search).get("set");
}

const yearLabel = (year) => Number(year) === 0 ? "Prep" : `Year ${year}`;

function renderDashboard() {
  document.title = "Vocabulary Library · The Mandarin Room";
  document.querySelector("#set-summary").textContent = `${vocabularySets.length} classroom sets`;
  const filters = document.querySelector("#year-filters");
  filters.innerHTML = ["all", 0, 1, 2, 3, 4, 5, 6].map((year) => `<button class="filter-button ${activeYear === year ? "active" : ""}" data-year="${year}" type="button">${year === "all" ? "All" : yearLabel(year)}</button>`).join("");
  const shown = activeYear === "all" ? vocabularySets : vocabularySets.filter((set) => set.yearLevel === activeYear);
  grid.innerHTML = shown.map((set) => `
    <article class="set-card year-${set.yearLevel}">
      <div class="card-topline"><span class="year-badge">${yearLabel(set.yearLevel)}</span><span>${set.items.length} items</span></div>
      <div><p class="card-chinese" lang="zh-Hans">${set.chineseTitle}</p><h3>${set.title}</h3></div>
      <div class="card-actions"><a class="button secondary set-action" href="editor.html?set=${encodeURIComponent(set.id)}">Edit</a><a class="button primary set-action" href="student.html?set=${encodeURIComponent(set.id)}">Student View</a></div>
    </article>`).join("");
  if (!shown.length) grid.innerHTML = `<p class="empty-message">No sets for this year yet.</p>`;
  filters.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { activeYear = button.dataset.year === "all" ? "all" : Number(button.dataset.year); renderDashboard(); }));
}

function itemRow(item, index) {
  const teacherAvailable = Boolean(item.audio.teacherAudioUrl);
  return `<article class="word-row" data-index="${index}">
    <span class="item-number">${String(index + 1).padStart(2, "0")}</span>
    <div class="word-main"><strong lang="zh-Hans">${item.chinese}</strong><span>${item.pinyin}</span></div>
    <p>${item.english}</p>
    <div class="row-actions">
      <button class="icon-button ai-button" type="button" ${item.audio.aiEnabled ? "" : "disabled"} aria-label="Play AI voice for ${item.english}">▶ <span>AI Voice</span></button>
      <button class="icon-button teacher-button" type="button" ${teacherAvailable ? "" : "disabled"} aria-label="${teacherAvailable ? "Play" : "Teacher voice unavailable for"} ${item.english}">▶ <span>Teacher Voice</span></button>
    </div>
  </article>`;
}

function renderSet(set) {
  document.title = `${set.title} · Vocabulary Library`;
  app.innerHTML = `<a class="quiet-link" href="./">← All vocabulary sets</a>
  <section class="detail-header">
    <div class="detail-title"><div><p class="eyebrow">${yearLabel(set.yearLevel)} · ${set.items.length} items</p><h1>${set.title}</h1><p class="detail-chinese-title" lang="zh-Hans">${set.chineseTitle}</p></div>
    <div class="detail-actions"><a class="button primary" href="student.html?set=${encodeURIComponent(set.id)}">Open Student View <span aria-hidden="true">→</span></a><a class="button secondary" href="editor.html?set=${encodeURIComponent(set.id)}">Edit</a></div></div>
  </section>
  <section class="word-list" aria-label="Vocabulary items">${set.items.map(itemRow).join("")}</section>
  <p id="audio-status" class="audio-status" role="status"></p>`;

  const status = document.querySelector("#audio-status");
  document.querySelectorAll(".word-row").forEach((row) => {
    const item = set.items[Number(row.dataset.index)];
    const teacherButton = row.querySelector(".teacher-button");
    let teacherVoiceUrl = item.audio.teacherAudioUrl || "";
    const updateTeacherButton = (url) => {
      teacherVoiceUrl = url || "";
      teacherButton.disabled = !teacherVoiceUrl;
      teacherButton.setAttribute("aria-label", teacherVoiceUrl ? `Play Teacher Voice for ${item.english}` : `Teacher voice unavailable for ${item.english}`);
    };
    updateTeacherButton(teacherVoiceUrl);
    row.querySelector(".ai-button").addEventListener("click", () => speakMandarin(item.chinese, {
      onStart: () => { status.textContent = `Playing AI Voice: ${item.chinese}`; },
      onEnd: () => { status.textContent = ""; },
      onUnavailable: () => { status.textContent = "AI Voice is not supported on this device."; },
      onError: () => { status.textContent = "AI Voice could not play on this device."; }
    }));
    teacherButton.addEventListener("click", () => playTeacherVoice(teacherVoiceUrl, {
      onUnavailable: () => { status.textContent = "Teacher Voice has not been recorded for this item yet."; }
    }));
    watchTeacherVoice(set.id, item.id, (metadata) => updateTeacherButton(cacheSafeAudioUrl(metadata)), (error) => console.error("[Vocabulary Teacher Voice]", error)).then((unsubscribe) => window.addEventListener("beforeunload", unsubscribe, { once: true })).catch((error) => console.error("[Vocabulary Teacher Voice]", error));
  });
  if (!canUseAiVoice()) document.querySelectorAll(".ai-button").forEach((button) => button.disabled = true);
}

const requestedId = setIdFromUrl();
const requestedSet = requestedId ? getSet(requestedId) : null;
if (requestedId && !requestedSet) {
  app.innerHTML = `<section class="empty-state"><p class="eyebrow">Set not found</p><h1>That vocabulary set is not available.</h1><a class="button primary" href="./">Return to the library</a></section>`;
} else if (requestedSet) {
  renderSet(requestedSet);
} else {
  renderDashboard();
}
