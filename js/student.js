import { getSet, watchSet } from "./vocabulary-store.js";
import { canUseAiVoice, speakMandarin, playTeacherVoice } from "./audio.js";
import { cacheSafeAudioUrl, watchTeacherVoice } from "./teacher-voice-cloud.js";

const params = new URLSearchParams(location.search);
let set = await getSet(params.get("set"));
let currentIndex = Math.max(0, parseInt(params.get("item") || "1", 10) - 1);
let showPinyin = localStorage.getItem("mandarin-room-show-pinyin") !== "false";
let revealed = false;
let teacherVoiceUrl = "";
let unsubscribeTeacherVoice = null;
let unsubscribeSet = null;
let voiceRequest = 0;
let audioStatusVersion = 0;
const $ = (selector) => document.querySelector(selector);

if (!set) {
  $("#student-app").innerHTML = `<section class="student-card empty-state"><p class="eyebrow">Set not found</p><h1>Choose a vocabulary set first.</h1></section>`;
} else {
  currentIndex = Math.min(currentIndex, set.items.length - 1);
  $("#set-label").textContent = `${set.title} · ${set.chineseTitle}`;
  document.title = `${set.title} · Student Vocabulary`;
  function setTeacherVoiceAvailability(url) {
    teacherVoiceUrl = typeof url === "string" ? url.trim() : "";
    const button = $("#teacher-voice");
    const available = Boolean(teacherVoiceUrl);
    button.hidden = !available;
    button.disabled = !available;
    button.setAttribute("aria-disabled", String(!available));
  }
  function renderLanguage(item) {
    const content = $("#student-content");
    content.replaceChildren();
    content.className = "student-content student-simple-line";
    const pinyin = document.createElement("span");
    pinyin.className = "student-pinyin";
    pinyin.textContent = item.pinyin;
    pinyin.hidden = !showPinyin;
    const chinese = document.createElement("span");
    chinese.className = "student-chinese";
    chinese.lang = "zh-Hans";
    chinese.textContent = item.chinese;
    content.append(pinyin, chinese);
  }
  function render() {
    const item = set.items[currentIndex];
    renderLanguage(item);
    $("#student-english").textContent = item.english || "Meaning not added yet";
    const image = $("#student-image"); image.hidden = !item.image; if (item.image) { image.src = item.image; image.alt = item.english || "Vocabulary illustration"; }
    $("#position").textContent = `${currentIndex + 1} / ${set.items.length}`;
    $("#previous").disabled = currentIndex === 0; $("#next").disabled = currentIndex === set.items.length - 1;
    $("#ai-voice").hidden = !item.audio.aiEnabled; $("#ai-voice").disabled = !canUseAiVoice();
    setTeacherVoiceAvailability(item.audio.teacherAudioUrl || "");
    const request = ++voiceRequest;
    if (unsubscribeTeacherVoice) { unsubscribeTeacherVoice(); unsubscribeTeacherVoice = null; }
    watchTeacherVoice(set.id, item.id, (metadata) => { if (request !== voiceRequest) return; setTeacherVoiceAvailability(cacheSafeAudioUrl(metadata)); }, (error) => { console.error("[Vocabulary Teacher Voice]", error); }).then((unsubscribe) => { if (request === voiceRequest) unsubscribeTeacherVoice = unsubscribe; else unsubscribe(); }).catch((error) => console.error("[Vocabulary Teacher Voice]", error));
    $("#show-pinyin").classList.toggle("active", showPinyin); $("#hide-pinyin").classList.toggle("active", !showPinyin);
    revealed = false; $("#flashcard").classList.remove("revealed"); $("#flashcard").setAttribute("aria-pressed", "false");
    audioStatusVersion += 1;
    $("#audio-status").textContent = "";
    history.replaceState(null, "", `?set=${encodeURIComponent(set.id)}&item=${currentIndex + 1}`);
  }
  function navigate(change) { const next = currentIndex + change; if (next >= 0 && next < set.items.length) { currentIndex = next; render(); } }
  $("#flashcard").onclick = () => { revealed = !revealed; $("#flashcard").classList.toggle("revealed", revealed); $("#flashcard").setAttribute("aria-pressed", String(revealed)); $("#flashcard").setAttribute("aria-label", revealed ? "Return to Chinese" : "Reveal English meaning"); };
  $("#show-pinyin").onclick = () => { showPinyin = true; localStorage.setItem("mandarin-room-show-pinyin", "true"); render(); };
  $("#hide-pinyin").onclick = () => { showPinyin = false; localStorage.setItem("mandarin-room-show-pinyin", "false"); render(); };
  $("#previous").onclick = () => navigate(-1); $("#next").onclick = () => navigate(1);
  $("#ai-voice").onclick = () => {
    const version = ++audioStatusVersion;
    $("#audio-status").textContent = "";
    speakMandarin(set.items[currentIndex].chinese, {
      onStart: () => { if (version === audioStatusVersion) $("#audio-status").textContent = "Playing AI Voice..."; },
      onEnd: () => { if (version === audioStatusVersion) $("#audio-status").textContent = ""; },
      onUnavailable: () => { if (version === audioStatusVersion) $("#audio-status").textContent = "AI Voice is not supported on this device."; },
      onError: () => { if (version === audioStatusVersion) $("#audio-status").textContent = "AI Voice could not play."; }
    });
  };
  $("#teacher-voice").onclick = () => {
    const version = ++audioStatusVersion;
    $("#audio-status").textContent = "";
    playTeacherVoice(teacherVoiceUrl, {
      onStart: () => { if (version === audioStatusVersion) $("#audio-status").textContent = "Playing Teacher Voice..."; },
      onEnd: () => { if (version === audioStatusVersion) $("#audio-status").textContent = ""; },
      onError: () => { if (version === audioStatusVersion) $("#audio-status").textContent = "Teacher Voice could not be loaded."; }
    });
  };
  document.addEventListener("keydown", (event) => { if (event.key === "ArrowLeft") navigate(-1); if (event.key === "ArrowRight") navigate(1); if (event.key === " " || event.key === "Enter") { if (event.target === document.body) { event.preventDefault(); $("#flashcard").click(); } } });
  render();
  watchSet(set.id, (cloudSet) => { if (!cloudSet) { location.href = "./"; return; } set = cloudSet; currentIndex = Math.min(currentIndex, set.items.length - 1); $("#set-label").textContent = `${set.title} · ${set.chineseTitle}`; render(); }, (error) => console.error("[Vocabulary Cloud Sync]", error)).then((unsubscribe) => { unsubscribeSet = unsubscribe; }).catch((error) => console.error("[Vocabulary Cloud Sync]", error));
  window.addEventListener("beforeunload", () => { unsubscribeTeacherVoice?.(); unsubscribeSet?.(); });
}
