// Reusable image upload + preview field for the Vocabulary editor.
// Used by the Vocabulary Set Cover and by every vocabulary item. The editor owns
// the state (saved image and pending change); this module renders and wires it.
import { ACCEPT_ATTRIBUTE, IMAGE_PRESETS, ImagePreparationError, SUPPORTED_FORMATS_LABEL, prepareVocabularyImage } from "./vocabulary-image-processing.js?v=image-upload-1";

const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * @param {object} o
 * @param {"cover"|"item"} o.variant
 * @param {string} o.key           stable key (item id or "cover")
 * @param {string} o.label         accessible description, e.g. "Set cover" or "image for 狗"
 * @param {string|null} o.savedUrl currently saved image URL
 * @param {object|null} o.pending  { kind: "upload", previewUrl, fileName, bytes, width, height } | { kind: "remove" }
 * @param {boolean} o.canUpload    whether the signed-in teacher may change images
 * @param {string} [o.disabledReason]
 * @param {string} [o.extraActions] trusted HTML for source-specific buttons (e.g. Generate)
 * @param {string} [o.status]       initial status text
 */
export function imageFieldMarkup({ variant, key, label, savedUrl = null, pending = null, canUpload = false, disabledReason = "", extraActions = "", status = "" }) {
  const upload = pending?.kind === "upload" ? pending : null;
  const removing = pending?.kind === "remove";
  const previewUrl = upload ? upload.previewUrl : removing ? null : savedUrl;
  const disabled = canUpload ? "" : "disabled";
  const title = canUpload ? "" : ` title="${escapeHtml(disabledReason)}"`;
  const inputId = `image-input-${variant}-${escapeHtml(key)}`;
  const picker = (text) => `<label class="mini-button image-upload-button ${canUpload ? "" : "is-disabled"}" for="${inputId}"${title}>${text}</label>`;
  const detail = upload
    ? `<strong class="image-field-name" title="${escapeHtml(upload.fileName)}">${escapeHtml(upload.fileName)}</strong><small>New image · ${kb(upload.bytes)} WebP · ${upload.width}×${upload.height}px. Published image stays until you choose Save set.</small>`
    : removing ? `<strong>Image will be removed</strong><small>The published image stays until you choose Save set.</small>`
    : savedUrl ? `<strong>Current image</strong><small>${escapeHtml(SUPPORTED_FORMATS_LABEL)}</small>`
    : `<strong>No image selected</strong><small>${escapeHtml(SUPPORTED_FORMATS_LABEL)}</small>`;
  const actions = previewUrl
    ? `${picker("Replace Image")}<button class="mini-button image-remove-button" type="button" ${disabled}${title}>Remove Image</button>`
    : picker("Upload Image");
  const undo = pending ? `<button class="mini-button image-undo-button" type="button">Undo</button>` : "";
  return `<div class="image-source-field image-source-${variant}${pending ? " has-pending" : ""}" data-image-field="${escapeHtml(key)}" data-variant="${variant}">
    <div class="image-field-frame" data-image-drop>${previewUrl ? `<img src="${escapeHtml(previewUrl)}" alt="${upload ? "New" : "Current"} ${escapeHtml(label)}">` : `<span class="image-field-placeholder" aria-hidden="true">🖼</span>`}</div>
    <div class="image-field-body">
      <div class="image-field-detail">${detail}</div>
      <div class="image-field-actions">${actions}${extraActions}${undo}</div>
      <input id="${inputId}" class="visually-hidden-file" type="file" accept="${ACCEPT_ATTRIBUTE}" ${disabled} aria-label="Choose ${escapeHtml(label)} from this device">
      <p class="image-field-status" data-image-status role="status" aria-live="polite">${escapeHtml(status)}</p>
    </div>
  </div>`;
}

export function setImageFieldStatus(root, text, tone = "") {
  const status = root?.querySelector("[data-image-status]");
  if (!status) return;
  status.textContent = text;
  status.dataset.tone = tone;
}

/**
 * Wire picker, drag-and-drop, Remove and Undo. `onPrepared` receives the
 * prepared WebP; stale results (teacher picked another file meanwhile) are dropped.
 */
export function wireImageField(root, { variant, onPrepared, onRemove, onUndo, onBusyChange = () => {} }) {
  if (!root) return;
  const preset = IMAGE_PRESETS[variant] || IMAGE_PRESETS.item;
  const input = root.querySelector("input[type=file]");
  let token = 0;
  const handleFile = async (file) => {
    if (!file || input.disabled) return;
    const mine = ++token;
    root.classList.add("is-busy"); onBusyChange(true);
    setImageFieldStatus(root, "Preparing image…");
    try {
      const prepared = await prepareVocabularyImage(file, preset, (stage) => { if (mine === token) setImageFieldStatus(root, stage === "optimising" ? "Optimising image…" : "Preparing image…"); });
      if (mine !== token || !root.isConnected) return;
      onPrepared(prepared);
    } catch (error) {
      if (mine !== token) return;
      if (!(error instanceof ImagePreparationError)) console.error("[Vocabulary image field]", error);
      setImageFieldStatus(root, error instanceof ImagePreparationError ? error.message : "This image could not be prepared. Try another file.", "error");
    } finally {
      if (mine === token) { root.classList.remove("is-busy"); onBusyChange(false); }
      input.value = "";
    }
  };
  input?.addEventListener("change", () => handleFile(input.files?.[0]));
  const drop = root.querySelector("[data-image-drop]");
  drop?.addEventListener("dragover", (event) => { if (input.disabled) return; event.preventDefault(); drop.classList.add("is-drag-over"); });
  drop?.addEventListener("dragleave", () => drop.classList.remove("is-drag-over"));
  drop?.addEventListener("drop", (event) => { event.preventDefault(); drop.classList.remove("is-drag-over"); if (event.dataTransfer?.files?.length > 1) setImageFieldStatus(root, "Choose one image at a time.", "error"); handleFile(event.dataTransfer?.files?.[0]); });
  root.querySelector(".image-remove-button")?.addEventListener("click", () => { token += 1; onRemove(); });
  root.querySelector(".image-undo-button")?.addEventListener("click", () => { token += 1; onUndo(); });
}
