import { getSet, saveSet, deleteSet } from "./vocabulary-store.js?v=set-cover-1";
import { bindTeacherVoiceControls, initialiseTeacherVoiceAuth } from "./teacher-voice-ui.js?v=cloud-sync-1";
import { deleteGeneratedVocabularyImage, generateVocabularyImage, generateVocabularySetCover, uploadApprovedVocabularyImage } from "./vocabulary-image-cloud.js?v=set-cover-1";

const suggestions = {
  "中国": ["zhong guo", "China"], "美国": ["mei guo", "United States"], "英国": ["ying guo", "United Kingdom"], "日本": ["ri ben", "Japan"], "加拿大": ["jia na da", "Canada"], "澳大利亚": ["ao da li ya", "Australia"],
  "你好吗？": ["ni hao ma", "How are you?"], "我很好。": ["wo hen hao", "I am very well."], "我不好。": ["wo bu hao", "I am not well."], "很棒！": ["hen bang", "Great!"]
};
const params = new URLSearchParams(location.search);
const originalId = params.get("set");
const existing = originalId ? await getSet(originalId) : null;
let items = existing ? JSON.parse(JSON.stringify(existing.items)) : [];
const imageCandidates = new Map();
const imageGenerationInFlight = new Set();
let imageAuthorised = false;
let batchGenerating = false;
let coverImage = existing?.coverImage || null;
let coverImageStoragePath = existing?.coverImageStoragePath || null;
let coverImageGenerated = existing?.coverImageGenerated === true;
let coverCandidate = null;
let coverGenerating = false;
const preservedDescription = existing?.description || "";
const $ = (selector) => document.querySelector(selector);
const slug = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `item-${Date.now()}`;
const newItem = (chinese = "", pinyin = "", english = "") => ({ id: `${slug(english || pinyin || "item")}-${Date.now().toString(36)}`, chinese, pinyin, english, image: null, notes: "", type: "word", audio: { aiEnabled: true, teacherAudioUrl: null }, handwriting: { enabled: false, characters: Array.from(chinese.replace(/[\s？。！?!.]/g, "")) } });
const generatedSetId = () => `${Number($("#year-level").value) === 0 ? "prep" : `year${$("#year-level").value}`}-${slug($("#title").value)}`.replace(/-+$/, "");
if (existing) { $("#editor-title").textContent = `Edit ${existing.title}`; $("#year-level").value = existing.yearLevel; $("#set-id").value = existing.id; $("#set-id").readOnly = true; $("#title").value = existing.title; $("#chinese-title").value = existing.chineseTitle; $("#delete-set").hidden = false; }
else { $("#year-level").value = 1; items.push(newItem()); $("#set-id").value = generatedSetId(); $("#year-level").addEventListener("change", () => { $("#set-id").value = generatedSetId(); }); $("#title").addEventListener("input", () => { $("#set-id").value = generatedSetId(); }); }
$("#set-cover-url").value = coverImage || "";

function renderItems() {
  $("#items").innerHTML = items.map((item, index) => `<article class="item-editor compact-item-row" data-index="${index}">
    <div class="compact-item-index"><span>${index + 1}</span><div class="compact-reorder"><button class="icon-button move-up" type="button" ${index === 0 ? "disabled" : ""} aria-label="Move item up">↑</button><button class="icon-button move-down" type="button" ${index === items.length - 1 ? "disabled" : ""} aria-label="Move item down">↓</button></div></div>
    <label class="compact-field compact-field-chinese"><span>Chinese</span><input data-field="chinese" value="${escapeHtml(item.chinese)}" lang="zh-Hans" placeholder="Chinese"></label>
    <label class="compact-field compact-field-pinyin"><span>Pinyin</span><input data-field="pinyin" value="${escapeHtml(item.pinyin)}" placeholder="pinyin"></label>
    <label class="compact-field compact-field-english"><span>English</span><input data-field="english" value="${escapeHtml(item.english)}" placeholder="English"></label>
    <section class="teacher-voice-editor compact-teacher-voice" data-teacher-voice="${escapeHtml(item.id)}"></section>
    <details class="compact-more"><summary>⋯ More</summary><div class="compact-more-panel"><button class="mini-button suggest" type="button">Generate Pinyin &amp; English</button><label>Type<select data-field="type"><option value="word" ${item.type === "word" ? "selected" : ""}>Word</option><option value="phrase" ${item.type === "phrase" ? "selected" : ""}>Phrase</option><option value="sentence" ${item.type === "sentence" ? "selected" : ""}>Sentence</option></select></label><label class="checkbox-label"><input data-field="aiEnabled" type="checkbox" ${item.audio.aiEnabled ? "checked" : ""}> AI Voice available</label><div class="image-field"><label>Image URL<input data-field="image" type="url" value="${escapeHtml(item.image || "")}" placeholder="Optional image URL"></label>${item.image ? `<img class="image-field-preview" src="${escapeHtml(item.image)}" alt="Current image for ${escapeHtml(item.english || item.chinese)}">` : ""}<button class="mini-button find-image" type="button" ${imageAuthorised && !imageGenerationInFlight.has(item.id) ? "" : "disabled"}>${item.image ? "Find replacement image" : "Find / Generate Image"}</button><small>${item.image ? "Your current image stays in place unless you explicitly accept and save a replacement." : "Generates a review candidate; it is not saved automatically."}</small></div><label>Notes<textarea data-field="notes" rows="2">${escapeHtml(item.notes || "")}</textarea></label><button class="mini-button remove-item danger" type="button">Delete item</button></div></details>
  </article>`).join("");
  $("#items").querySelectorAll(".item-editor").forEach((row) => wireItem(row));
  bindTeacherVoiceControls();
  updateImageActions();
}
function escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function updateFromRow(row) { const item = items[Number(row.dataset.index)]; row.querySelectorAll("[data-field]").forEach((input) => { const field = input.dataset.field; const value = input.type === "checkbox" ? input.checked : input.value; if (field === "teacherAudioUrl") item.audio.teacherAudioUrl = value || null; else if (field === "aiEnabled") item.audio.aiEnabled = value; else if (field === "image") { const nextImage = value || null; if (nextImage !== item.image) { delete item.imageStoragePath; delete item.imageGenerated; } item.image = nextImage; } else item[field] = value; }); item.pinyin = item.pinyin.toLowerCase(); item.handwriting.characters = Array.from(item.chinese.replace(/[\s？。！?!.]/g, "")); }
function wireItem(row) { row.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("input", () => updateFromRow(row))); row.querySelector(".remove-item").onclick = () => { const item = items[Number(row.dataset.index)]; discardCandidate(item.id); items.splice(Number(row.dataset.index), 1); renderItems(); renderImageReview(); }; row.querySelector(".move-up").onclick = () => move(Number(row.dataset.index), -1); row.querySelector(".move-down").onclick = () => move(Number(row.dataset.index), 1); row.querySelector(".suggest").onclick = () => { updateFromRow(row); const item = items[Number(row.dataset.index)]; const match = suggestions[item.chinese.trim()]; if (match) { if (!item.pinyin) item.pinyin = match[0]; if (!item.english) item.english = match[1]; $("#form-status").textContent = "Suggestions added. Review and edit before saving."; renderItems(); } else $("#form-status").textContent = "No local suggestion found. Enter Pinyin and English manually."; }; row.querySelector(".find-image").onclick = () => { updateFromRow(row); const item = items[Number(row.dataset.index)]; requestImageCandidate(item, Boolean(item.image)); }; }
function move(index, change) { const target = index + change; if (target < 0 || target >= items.length) return; [items[index], items[target]] = [items[target], items[index]]; renderItems(); }
function updateAllRows() { document.querySelectorAll(".item-editor").forEach(updateFromRow); }
function buildSet() { return { id: $("#set-id").value.trim(), yearLevel: Number($("#year-level").value), title: $("#title").value.trim(), chineseTitle: $("#chinese-title").value.trim(), description: preservedDescription, coverImage, coverImageStoragePath, coverImageGenerated, items }; }
function candidateFor(itemId) { return imageCandidates.get(itemId) || null; }
function discardCandidate(itemId) { const candidate = candidateFor(itemId); if (candidate?.previewUrl) URL.revokeObjectURL(candidate.previewUrl); imageCandidates.delete(itemId); }
function readableImageError(error) {
  const message = error?.message || "Image generation could not complete.";
  if (/resource-exhausted/i.test(error?.code || "")) return message.replace(/^FirebaseError:\s*/i, "");
  if (/unauthenticated|permission-denied/i.test(error?.code || "")) return "Sign in with an authorised teacher account before generating images.";
  if (/not-found|failed-precondition/i.test(error?.code || "")) return message.replace(/^FirebaseError:\s*/i, "");
  console.error("[Vocabulary Images]", error);
  return "Image generation could not complete. No vocabulary data was changed.";
}
function discardCoverCandidate() {
  if (coverCandidate?.previewUrl) URL.revokeObjectURL(coverCandidate.previewUrl);
  coverCandidate = null;
}
function renderSetCover() {
  const current = $("#set-cover-current");
  current.innerHTML = coverImage ? `<img src="${escapeHtml(coverImage)}" alt="Current Vocabulary Set cover"><span>Current saved cover</span>` : "";
  const generateButton = $("#generate-set-cover");
  generateButton.textContent = coverImage ? "Find replacement cover" : "Generate Set Cover";
  generateButton.disabled = !imageAuthorised || !existing || coverGenerating || Boolean(coverCandidate);
  generateButton.title = !existing ? "Save this vocabulary set before generating a cover." : !imageAuthorised ? "Sign in with an authorised teacher account." : coverCandidate ? "Review or skip the current suggestion first." : "";
  const review = $("#set-cover-review");
  review.hidden = !coverCandidate;
  if (coverCandidate) {
    $("#set-cover-candidate").src = coverCandidate.previewUrl;
    $("#set-cover-candidate-status").textContent = coverCandidate.replaceExisting ? "Replacement candidate — the current cover remains unchanged until you accept and save." : "Nothing is saved until you accept it.";
  } else $("#set-cover-candidate").removeAttribute("src");
  $("#accept-set-cover").disabled = coverGenerating || !coverCandidate;
  $("#replace-set-cover").disabled = coverGenerating || !coverCandidate;
  $("#skip-set-cover").disabled = coverGenerating || !coverCandidate;
}
async function requestSetCover(replaceCandidate = false) {
  if (!existing) { $("#set-cover-status").textContent = "Save this vocabulary set before generating a cover."; return; }
  if (!imageAuthorised) { $("#set-cover-status").textContent = "Sign in with an authorised teacher account before generating a cover."; return; }
  if (coverGenerating) return;
  const replacingSavedCover = Boolean(coverImage);
  if (coverCandidate && !replaceCandidate) { renderSetCover(); return; }
  const message = replacingSavedCover || replaceCandidate
    ? "Generate a new paid Set Cover suggestion? The current saved cover remains unchanged until you explicitly accept and save the replacement."
    : "Generate one paid Set Cover suggestion from the saved set title and vocabulary items? Allow about US$0.01 at current GPT Image rates. Nothing will be saved until you accept it.";
  if (!confirm(message)) return;
  coverGenerating = true;
  $("#set-cover-status").textContent = "Generating a representative Set Cover from the saved vocabulary items…";
  renderSetCover();
  try {
    const result = await generateVocabularySetCover(existing.id, { replaceExisting: replacingSavedCover });
    discardCoverCandidate();
    coverCandidate = { ...result, previewUrl: URL.createObjectURL(result.blob), replaceExisting: replacingSavedCover };
    $("#set-cover-status").textContent = "Cover suggestion ready. Accept, replace or skip it.";
  } catch (error) { $("#set-cover-status").textContent = readableImageError(error); }
  finally { coverGenerating = false; renderSetCover(); }
}
async function acceptSetCover() {
  if (!coverCandidate || coverGenerating) return;
  if (coverImage && !coverCandidate.replaceExisting) { $("#set-cover-status").textContent = "The set now has a cover. Choose Replace explicitly before generating another."; return; }
  updateAllRows();
  const previous = { coverImage, coverImageStoragePath, coverImageGenerated };
  let uploaded = null;
  coverGenerating = true;
  renderSetCover();
  try {
    $("#set-cover-status").textContent = "Uploading approved Set Cover…";
    uploaded = await uploadApprovedVocabularyImage(existing.id, "cover", coverCandidate.blob, (percent) => { $("#set-cover-status").textContent = `Uploading approved Set Cover… ${percent}%`; });
    coverImage = uploaded.imageUrl;
    coverImageStoragePath = uploaded.imageStoragePath;
    coverImageGenerated = true;
    $("#set-cover-url").value = coverImage;
    $("#set-cover-status").textContent = "Saving the approved Set Cover to the vocabulary set…";
    await saveSet(buildSet(), originalId);
    if (previous.coverImageGenerated && previous.coverImageStoragePath) await deleteGeneratedVocabularyImage(previous.coverImageStoragePath).catch((error) => console.error("[Set cover cleanup]", error));
    discardCoverCandidate();
    location.href = `./?set=${encodeURIComponent(existing.id)}`;
  } catch (error) {
    coverImage = previous.coverImage;
    coverImageStoragePath = previous.coverImageStoragePath;
    coverImageGenerated = previous.coverImageGenerated;
    $("#set-cover-url").value = coverImage || "";
    if (uploaded?.imageStoragePath) await deleteGeneratedVocabularyImage(uploaded.imageStoragePath).catch((cleanupError) => console.error("[Set cover rollback]", cleanupError));
    $("#set-cover-status").textContent = error.message || "The approved Set Cover could not be saved. The existing cover was preserved.";
  } finally { coverGenerating = false; renderSetCover(); }
}
function updateImageActions() {
  const canGenerate = Boolean(imageAuthorised && existing && !batchGenerating);
  const button = $("#auto-add-images");
  button.disabled = !canGenerate;
  button.title = !existing ? "Save this vocabulary set before generating images." : !imageAuthorised ? "Sign in with an authorised teacher account." : "";
  document.querySelectorAll(".find-image").forEach((itemButton) => { const row = itemButton.closest(".item-editor"); const item = items[Number(row.dataset.index)]; itemButton.disabled = !canGenerate || imageGenerationInFlight.has(item.id); });
  const acceptedCount = [...imageCandidates.values()].filter((candidate) => candidate.decision === "accepted").length;
  $("#save-approved-images").disabled = !imageAuthorised || acceptedCount === 0 || batchGenerating;
  $("#save-approved-images").textContent = acceptedCount ? `Save ${acceptedCount} approved image${acceptedCount === 1 ? "" : "s"}` : "Save approved images";
}
async function requestImageCandidate(item, replaceExisting = false, alreadyConfirmed = false) {
  if (!existing) { $("#form-status").textContent = "Save this vocabulary set before generating images."; return false; }
  if (!imageAuthorised) { $("#form-status").textContent = "Sign in with an authorised teacher account before generating images."; return false; }
  if (imageGenerationInFlight.has(item.id)) return false;
  if (candidateFor(item.id) && !replaceExisting) { $("#image-review").hidden = false; renderImageReview(); return true; }
  const replacingSavedImage = Boolean(item.image);
  const replacement = replaceExisting || replacingSavedImage || Boolean(candidateFor(item.id));
  if (!alreadyConfirmed) {
    const message = replacement ? `Generate a paid replacement suggestion for “${item.english || item.chinese}”? The existing image and current candidate remain unchanged until you accept and save the replacement.` : `Generate one paid image suggestion for “${item.english || item.chinese}”? Allow about US$0.01 at current GPT Image rates. Nothing will be saved until you accept it.`;
    if (!confirm(message)) return false;
  }
  imageGenerationInFlight.add(item.id); updateImageActions();
  $("#form-status").textContent = `Generating an image suggestion for ${item.english || item.chinese}…`;
  try {
    const result = await generateVocabularyImage(existing.id, item.id, { replaceExisting: replacingSavedImage, english: item.english, chinese: item.chinese });
    const previous = candidateFor(item.id);
    const next = { ...result, itemId: item.id, previewUrl: URL.createObjectURL(result.blob), decision: "review", replaceExisting: replacingSavedImage };
    imageCandidates.set(item.id, next);
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    $("#form-status").textContent = "Suggestion ready. Accept, replace or skip it before saving.";
    renderImageReview();
    return true;
  } catch (error) { $("#form-status").textContent = readableImageError(error); return false; }
  finally { imageGenerationInFlight.delete(item.id); updateImageActions(); }
}
function renderImageReview() {
  const review = $("#image-review"); const grid = $("#image-review-grid");
  const candidates = [...imageCandidates.values()].filter((candidate) => items.some((item) => item.id === candidate.itemId));
  review.hidden = candidates.length === 0;
  grid.innerHTML = candidates.map((candidate) => { const item = items.find((entry) => entry.id === candidate.itemId); return `<article class="image-review-card decision-${candidate.decision}" data-image-item="${escapeHtml(item.id)}"><img src="${escapeHtml(candidate.previewUrl)}" alt="Suggested image for ${escapeHtml(item.english || item.chinese)}"><div><strong lang="zh-Hans">${escapeHtml(item.chinese)}</strong><span>${escapeHtml(item.english || candidate.concept)}</span><small>${candidate.decision === "accepted" ? "Accepted — ready to save" : candidate.decision === "skipped" ? "Skipped — item remains unchanged" : candidate.replaceExisting ? "Replacement candidate — current image is still preserved" : "Review this suggestion"}</small></div><div class="image-review-actions"><button class="mini-button accept-image" type="button">Accept</button><button class="mini-button replace-image" type="button" ${imageGenerationInFlight.has(item.id) ? "disabled" : ""}>Replace</button><button class="mini-button skip-image" type="button">Skip</button></div></article>`; }).join("");
  grid.querySelectorAll("[data-image-item]").forEach((card) => { const itemId = card.dataset.imageItem; const candidate = candidateFor(itemId); const item = items.find((entry) => entry.id === itemId); card.querySelector(".accept-image").onclick = () => { candidate.decision = "accepted"; renderImageReview(); }; card.querySelector(".skip-image").onclick = () => { candidate.decision = "skipped"; renderImageReview(); }; card.querySelector(".replace-image").onclick = () => requestImageCandidate(item, true); });
  updateImageActions();
}
async function autoAddMissingImages() {
  updateAllRows();
  const allMissing = items.filter((item) => !item.image && !candidateFor(item.id));
  const missing = allMissing.slice(0, 20);
  if (!missing.length) { $("#form-status").textContent = imageCandidates.size ? "All missing items already have suggestions ready for review." : "This set has no missing images."; renderImageReview(); return; }
  const estimate = (missing.length * 0.01).toFixed(2);
  if (!confirm(`Generate ${missing.length} paid image suggestion${missing.length === 1 ? "" : "s"} for items with no image${allMissing.length > 20 ? " (the first 20 in this batch)" : ""}? Estimated GPT Image output cost: about US$${estimate}. Existing images will be skipped.`)) return;
  batchGenerating = true; updateImageActions();
  let completed = 0; let failed = 0;
  for (const item of missing) { $("#form-status").textContent = `Generating image ${completed + failed + 1} of ${missing.length}: ${item.english || item.chinese}…`; if (await requestImageCandidate(item, false, true)) completed += 1; else failed += 1; }
  batchGenerating = false; updateImageActions(); renderImageReview();
  $("#form-status").textContent = `${completed} suggestion${completed === 1 ? "" : "s"} ready for review${failed ? `; ${failed} could not be generated` : ""}. Nothing has been saved yet.`;
}
async function saveApprovedImages() {
  updateAllRows();
  const approved = [...imageCandidates.values()].filter((candidate) => candidate.decision === "accepted");
  if (!approved.length) return;
  const uploaded = [];
  $("#save-approved-images").disabled = true; batchGenerating = true; updateImageActions();
  try {
    for (let index = 0; index < approved.length; index += 1) {
      const candidate = approved[index]; const item = items.find((entry) => entry.id === candidate.itemId);
      if (!item) continue;
      if (item.image && !candidate.replaceExisting) throw new Error(`“${item.english || item.chinese}” now has an image, so it was not overwritten.`);
      const previous = { image: item.image || null, imageStoragePath: item.imageStoragePath || null, imageGenerated: item.imageGenerated === true };
      $("#form-status").textContent = `Uploading approved image ${index + 1} of ${approved.length}: ${item.english || item.chinese}…`;
      const saved = await uploadApprovedVocabularyImage(existing.id, item.id, candidate.blob, (percent) => { $("#form-status").textContent = `Uploading ${item.english || item.chinese}… ${percent}%`; });
      item.image = saved.imageUrl; item.imageStoragePath = saved.imageStoragePath; item.imageGenerated = true;
      uploaded.push({ item, previous, newStoragePath: saved.imageStoragePath });
    }
    $("#form-status").textContent = "Saving approved images to the vocabulary set…";
    await saveSet(buildSet(), originalId);
    await Promise.allSettled(uploaded.filter((entry) => entry.previous.imageGenerated && entry.previous.imageStoragePath).map((entry) => deleteGeneratedVocabularyImage(entry.previous.imageStoragePath)));
    uploaded.forEach((entry) => discardCandidate(entry.item.id));
    location.href = `./?set=${encodeURIComponent(existing.id)}`;
  } catch (error) {
    for (const entry of uploaded) { entry.item.image = entry.previous.image; if (entry.previous.imageStoragePath) entry.item.imageStoragePath = entry.previous.imageStoragePath; else delete entry.item.imageStoragePath; if (entry.previous.imageGenerated) entry.item.imageGenerated = true; else delete entry.item.imageGenerated; await deleteGeneratedVocabularyImage(entry.newStoragePath).catch((cleanupError) => console.error("[Vocabulary image rollback]", cleanupError)); }
    $("#form-status").textContent = error.message || "Approved images could not be saved. Existing images were preserved.";
  } finally { batchGenerating = false; renderItems(); renderImageReview(); updateImageActions(); }
}
$("#add-item").onclick = () => { items.push(newItem()); renderItems(); };
$("#import-items").onclick = () => { const lines = $("#bulk-input").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); lines.forEach((line) => { const parts = line.split("|").map((part) => part.trim()); const chinese = parts[0] || ""; const local = suggestions[chinese] || ["", ""]; const pinyin = parts.length >= 3 ? parts[1] : local[0]; const english = parts.length >= 3 ? parts.slice(2).join(" | ") : parts.length === 2 ? parts[1] : local[1]; items.push(newItem(chinese, pinyin.toLowerCase(), english)); }); $("#bulk-input").value = ""; renderItems(); $("#form-status").textContent = `${lines.length} item${lines.length === 1 ? "" : "s"} created. Review and save when ready.`; };
$("#auto-add-images").onclick = autoAddMissingImages;
$("#save-approved-images").onclick = saveApprovedImages;
$("#close-image-review").onclick = () => { $("#image-review").hidden = true; };
$("#set-cover-url").addEventListener("input", (event) => {
  const nextCover = event.target.value.trim() || null;
  if (nextCover !== coverImage) { coverImage = nextCover; coverImageStoragePath = null; coverImageGenerated = false; }
  renderSetCover();
});
$("#generate-set-cover").onclick = () => requestSetCover(false);
$("#replace-set-cover").onclick = () => requestSetCover(true);
$("#skip-set-cover").onclick = () => { discardCoverCandidate(); $("#set-cover-status").textContent = "Suggestion skipped. The current cover was not changed."; renderSetCover(); };
$("#accept-set-cover").onclick = acceptSetCover;
$("#set-form").onsubmit = async (event) => { event.preventDefault(); updateAllRows(); if (!existing && !$("#set-id").value.trim()) $("#set-id").value = generatedSetId(); const set = buildSet(); const saveButton = $("#set-form button[type=submit]"); saveButton.disabled = true; $("#form-status").textContent = "Saving to cloud…"; try { await saveSet(set, originalId); location.href = `./?set=${encodeURIComponent(set.id)}`; } catch (error) { $("#form-status").textContent = error.message; saveButton.disabled = false; } };
$("#delete-set").onclick = async () => { if (confirm(`Delete “${existing.title}” from every device?`)) { try { await deleteSet(originalId); location.href = "./"; } catch (error) { $("#form-status").textContent = error.message; } } };
initialiseTeacherVoiceAuth(() => $("#set-id").value.trim(), ({ authorised }) => { imageAuthorised = authorised === true; renderItems(); renderImageReview(); renderSetCover(); });
window.addEventListener("beforeunload", () => { imageCandidates.forEach((candidate) => { if (candidate.previewUrl) URL.revokeObjectURL(candidate.previewUrl); }); discardCoverCandidate(); });
renderItems();
renderSetCover();
