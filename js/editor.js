import { getSet, saveSet, deleteSet } from "./vocabulary-store.js?v=cloud-sync-1";
import { bindTeacherVoiceControls, initialiseTeacherVoiceAuth } from "./teacher-voice-ui.js?v=cloud-sync-1";

const suggestions = {
  "中国": ["zhong guo", "China"], "美国": ["mei guo", "United States"], "英国": ["ying guo", "United Kingdom"], "日本": ["ri ben", "Japan"], "加拿大": ["jia na da", "Canada"], "澳大利亚": ["ao da li ya", "Australia"],
  "你好吗？": ["ni hao ma", "How are you?"], "我很好。": ["wo hen hao", "I am very well."], "我不好。": ["wo bu hao", "I am not well."], "很棒！": ["hen bang", "Great!"]
};
const params = new URLSearchParams(location.search);
const originalId = params.get("set");
const existing = originalId ? await getSet(originalId) : null;
let items = existing ? JSON.parse(JSON.stringify(existing.items)) : [];
const preservedDescription = existing?.description || "";
const $ = (selector) => document.querySelector(selector);
const slug = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `item-${Date.now()}`;
const newItem = (chinese = "", pinyin = "", english = "") => ({ id: `${slug(english || pinyin || "item")}-${Date.now().toString(36)}`, chinese, pinyin, english, image: null, notes: "", type: "word", audio: { aiEnabled: true, teacherAudioUrl: null }, handwriting: { enabled: false, characters: Array.from(chinese.replace(/[\s？。！?!.]/g, "")) } });
const generatedSetId = () => `${Number($("#year-level").value) === 0 ? "prep" : `year${$("#year-level").value}`}-${slug($("#title").value)}`.replace(/-+$/, "");
if (existing) { $("#editor-title").textContent = `Edit ${existing.title}`; $("#year-level").value = existing.yearLevel; $("#set-id").value = existing.id; $("#set-id").readOnly = true; $("#title").value = existing.title; $("#chinese-title").value = existing.chineseTitle; $("#delete-set").hidden = false; }
else { $("#year-level").value = 1; items.push(newItem()); $("#set-id").value = generatedSetId(); $("#year-level").addEventListener("change", () => { $("#set-id").value = generatedSetId(); }); $("#title").addEventListener("input", () => { $("#set-id").value = generatedSetId(); }); }

function renderItems() {
  $("#items").innerHTML = items.map((item, index) => `<article class="item-editor compact-item-row" data-index="${index}">
    <div class="compact-item-index"><span>${index + 1}</span><div class="compact-reorder"><button class="icon-button move-up" type="button" ${index === 0 ? "disabled" : ""} aria-label="Move item up">↑</button><button class="icon-button move-down" type="button" ${index === items.length - 1 ? "disabled" : ""} aria-label="Move item down">↓</button></div></div>
    <label class="compact-field compact-field-chinese"><span>Chinese</span><input data-field="chinese" value="${escapeHtml(item.chinese)}" lang="zh-Hans" placeholder="Chinese"></label>
    <label class="compact-field compact-field-pinyin"><span>Pinyin</span><input data-field="pinyin" value="${escapeHtml(item.pinyin)}" placeholder="pinyin"></label>
    <label class="compact-field compact-field-english"><span>English</span><input data-field="english" value="${escapeHtml(item.english)}" placeholder="English"></label>
    <section class="teacher-voice-editor compact-teacher-voice" data-teacher-voice="${escapeHtml(item.id)}"></section>
    <details class="compact-more"><summary>⋯ More</summary><div class="compact-more-panel"><button class="mini-button suggest" type="button">Generate Pinyin &amp; English</button><label>Type<select data-field="type"><option value="word" ${item.type === "word" ? "selected" : ""}>Word</option><option value="phrase" ${item.type === "phrase" ? "selected" : ""}>Phrase</option><option value="sentence" ${item.type === "sentence" ? "selected" : ""}>Sentence</option></select></label><label class="checkbox-label"><input data-field="aiEnabled" type="checkbox" ${item.audio.aiEnabled ? "checked" : ""}> AI Voice available</label><label>Image URL<input data-field="image" type="url" value="${escapeHtml(item.image || "")}" placeholder="Optional image URL"></label><label>Notes<textarea data-field="notes" rows="2">${escapeHtml(item.notes || "")}</textarea></label><button class="mini-button remove-item danger" type="button">Delete item</button></div></details>
  </article>`).join("");
  $("#items").querySelectorAll(".item-editor").forEach((row) => wireItem(row));
  bindTeacherVoiceControls();
}
function escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function updateFromRow(row) { const item = items[Number(row.dataset.index)]; row.querySelectorAll("[data-field]").forEach((input) => { const field = input.dataset.field; const value = input.type === "checkbox" ? input.checked : input.value; if (field === "teacherAudioUrl") item.audio.teacherAudioUrl = value || null; else if (field === "aiEnabled") item.audio.aiEnabled = value; else item[field] = field === "image" ? value || null : value; }); item.pinyin = item.pinyin.toLowerCase(); item.handwriting.characters = Array.from(item.chinese.replace(/[\s？。！?!.]/g, "")); }
function wireItem(row) { row.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("input", () => updateFromRow(row))); row.querySelector(".remove-item").onclick = () => { items.splice(Number(row.dataset.index), 1); renderItems(); }; row.querySelector(".move-up").onclick = () => move(Number(row.dataset.index), -1); row.querySelector(".move-down").onclick = () => move(Number(row.dataset.index), 1); row.querySelector(".suggest").onclick = () => { updateFromRow(row); const item = items[Number(row.dataset.index)]; const match = suggestions[item.chinese.trim()]; if (match) { if (!item.pinyin) item.pinyin = match[0]; if (!item.english) item.english = match[1]; $("#form-status").textContent = "Suggestions added. Review and edit before saving."; renderItems(); } else $("#form-status").textContent = "No local suggestion found. Enter Pinyin and English manually."; }; }
function move(index, change) { const target = index + change; if (target < 0 || target >= items.length) return; [items[index], items[target]] = [items[target], items[index]]; renderItems(); }
$("#add-item").onclick = () => { items.push(newItem()); renderItems(); };
$("#import-items").onclick = () => { const lines = $("#bulk-input").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); lines.forEach((line) => { const parts = line.split("|").map((part) => part.trim()); const chinese = parts[0] || ""; const local = suggestions[chinese] || ["", ""]; const pinyin = parts.length >= 3 ? parts[1] : local[0]; const english = parts.length >= 3 ? parts.slice(2).join(" | ") : parts.length === 2 ? parts[1] : local[1]; items.push(newItem(chinese, pinyin.toLowerCase(), english)); }); $("#bulk-input").value = ""; renderItems(); $("#form-status").textContent = `${lines.length} item${lines.length === 1 ? "" : "s"} created. Review and save when ready.`; };
$("#set-form").onsubmit = async (event) => { event.preventDefault(); document.querySelectorAll(".item-editor").forEach(updateFromRow); if (!existing && !$("#set-id").value.trim()) $("#set-id").value = generatedSetId(); const set = { id: $("#set-id").value.trim(), yearLevel: Number($("#year-level").value), title: $("#title").value.trim(), chineseTitle: $("#chinese-title").value.trim(), description: preservedDescription, items }; const saveButton = $("#set-form button[type=submit]"); saveButton.disabled = true; $("#form-status").textContent = "Saving to cloud…"; try { await saveSet(set, originalId); location.href = `./?set=${encodeURIComponent(set.id)}`; } catch (error) { $("#form-status").textContent = error.message; saveButton.disabled = false; } };
$("#delete-set").onclick = async () => { if (confirm(`Delete “${existing.title}” from every device?`)) { try { await deleteSet(originalId); location.href = "./"; } catch (error) { $("#form-status").textContent = error.message; } } };
initialiseTeacherVoiceAuth(() => $("#set-id").value.trim());
renderItems();
