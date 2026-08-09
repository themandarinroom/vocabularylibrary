import { getFirebaseServices } from "./firebase.js";
import { LocalRecorder } from "./recorder.js";
import { cacheSafeAudioUrl, deleteTeacherVoice, getTeacherVoice, uploadTeacherVoice } from "./teacher-voice-cloud.js";

const states = new Map();
let currentUser = null;
let authorised = false;
let authReady = false;
let getSetId = () => "";

const stateFor = (itemId) => {
  if (!states.has(itemId)) states.set(itemId, { recorder: new LocalRecorder(), blob: null, previewUrl: "", saved: null, loading: true, busy: false });
  return states.get(itemId);
};
const rootFor = (itemId) => [...document.querySelectorAll("[data-teacher-voice]")].find((root) => root.dataset.teacherVoice === itemId) || null;
const safeMessage = (error, fallback) => { console.error("[Vocabulary Teacher Voice]", error); return fallback; };

export async function initialiseTeacherVoiceAuth(setIdGetter) {
  getSetId = setIdGetter;
  const signIn = document.querySelector("#voice-sign-in");
  const signOut = document.querySelector("#voice-sign-out");
  const state = document.querySelector("#voice-auth-state");
  try {
    const services = await getFirebaseServices();
    signIn.addEventListener("click", async () => {
      try { await services.authSdk.signInWithPopup(services.auth, new services.authSdk.GoogleAuthProvider()); }
      catch (error) {
        const code = error?.code || "auth/unknown";
        const message = error?.message || String(error);
        console.error(`[Vocabulary Firebase Auth] ${code}: ${message}`, error);
        state.textContent = `Firebase Auth error — ${code}: ${message}`;
        state.classList.add("developer-error");
      }
    });
    signOut.addEventListener("click", () => services.authSdk.signOut(services.auth));
    services.authSdk.onAuthStateChanged(services.auth, async (user) => {
      currentUser = user; authorised = false;
      if (user) { try { const snapshot = await services.firestoreSdk.getDoc(services.firestoreSdk.doc(services.db, "authorizedTeachers", user.uid)); authorised = snapshot.exists() && snapshot.data().active === true; } catch (error) { console.error(error); } }
      authReady = true;
      state.textContent = !user ? "Sign in to save Teacher Voice recordings." : authorised ? `Signed in as ${user.email || user.displayName}` : "This account is not authorised to publish Teacher Voice.";
      state.classList.remove("developer-error");
      signIn.hidden = Boolean(user); signOut.hidden = !user;
      renderAllVoiceControls();
    });
  } catch (error) { authReady = true; state.textContent = safeMessage(error, "Teacher Voice Cloud could not connect."); }
}

export function bindTeacherVoiceControls() {
  document.querySelectorAll("[data-teacher-voice]").forEach((root) => {
    const itemId = root.dataset.teacherVoice;
    const state = stateFor(itemId);
    renderVoiceControl(root, itemId, state);
    if (state.loading) {
      state.loading = false;
      const setId = getSetId();
      if (setId) getTeacherVoice(setId, itemId).then((metadata) => { state.saved = metadata; renderAllVoiceControls(); }).catch((error) => { state.loadError = true; console.error(error); renderAllVoiceControls(); });
    }
  });
}
function renderAllVoiceControls() { document.querySelectorAll("[data-teacher-voice]").forEach((root) => renderVoiceControl(root, root.dataset.teacherVoice, stateFor(root.dataset.teacherVoice))); }
function renderVoiceControl(root, itemId, state) {
  const savedUrl = cacheSafeAudioUrl(state.saved);
  const ready = Boolean(state.blob && state.previewUrl);
  const recording = state.recorder.mediaRecorder?.state === "recording";
  const label = state.loading ? "Loading…" : state.loadError ? "Could not load recording." : recording ? "● Recording…" : ready ? "Recording ready" : savedUrl ? "Recorded ✓" : "Not recorded";
  root.innerHTML = `<div class="voice-heading"><div><strong>Teacher Voice</strong><span>${label}</span></div></div><div class="voice-buttons"><button class="mini-button voice-record" type="button" ${recording || state.busy ? "disabled" : ""}>${savedUrl || ready ? "Re-record" : "🎙 Record"}</button><button class="mini-button voice-stop" type="button" ${recording ? "" : "disabled"}>Stop</button><button class="mini-button voice-preview" type="button" ${ready || savedUrl ? "" : "disabled"}>▶ ${ready ? "Preview" : "Play"}</button>${ready ? `<button class="mini-button voice-save" type="button" ${authorised && !state.busy ? "" : "disabled"}>Save</button>` : ""}${savedUrl && !ready ? `<button class="mini-button voice-delete" type="button" ${authorised && !state.busy ? "" : "disabled"}>Delete</button>` : ""}</div><p class="voice-status" role="status">${ready && !authorised ? "Sign in with an authorised teacher account to save." : ""}</p><audio hidden></audio>`;
  const status = root.querySelector(".voice-status");
  root.querySelector(".voice-record").onclick = async () => { try { state.blob = null; if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); state.previewUrl = ""; await state.recorder.start(); renderVoiceControl(root, itemId, state); } catch (error) { status.textContent = error.name === "NotAllowedError" ? "Microphone access is required to record Teacher Voice." : error.message === "recordingUnsupported" ? "Recording is not supported on this device." : safeMessage(error, "Recording could not start."); } };
  root.querySelector(".voice-stop").onclick = async () => { const result = await state.recorder.stop(); if (!result) return; state.blob = result.blob; state.previewUrl = result.url; renderVoiceControl(root, itemId, state); };
  root.querySelector(".voice-preview").onclick = async () => { const audio = root.querySelector("audio"); audio.src = state.previewUrl || savedUrl; audio.currentTime = 0; try { await audio.play(); status.textContent = ready ? "Playing preview…" : "Playing Teacher Voice…"; } catch (error) { status.textContent = safeMessage(error, "Teacher Voice could not be loaded."); } };
  const save = root.querySelector(".voice-save"); if (save) save.onclick = async () => { const setId = getSetId(); if (!setId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(setId)) { status.textContent = "Save a valid stable set ID before uploading Teacher Voice."; return; } state.busy = true; renderVoiceControl(root, itemId, state); const activeStatus = rootFor(itemId)?.querySelector(".voice-status"); try { state.saved = await uploadTeacherVoice(setId, itemId, state.blob, (percent) => { if (activeStatus) activeStatus.textContent = `Uploading… ${percent}%`; }); state.blob = null; if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); state.previewUrl = ""; } catch (error) { if (activeStatus) activeStatus.textContent = safeMessage(error, "Upload failed. Your previous recording has been kept."); } finally { state.busy = false; renderAllVoiceControls(); } };
  const remove = root.querySelector(".voice-delete"); if (remove) remove.onclick = async () => { if (!confirm("Permanently delete this Teacher Voice recording?")) return; state.busy = true; renderVoiceControl(root, itemId, state); try { await deleteTeacherVoice(getSetId(), itemId); state.saved = null; } catch (error) { state.deleteError = safeMessage(error, "Teacher Voice could not be deleted."); } finally { state.busy = false; renderAllVoiceControls(); const nextStatus = rootFor(itemId)?.querySelector(".voice-status"); if (state.deleteError && nextStatus) nextStatus.textContent = state.deleteError; } };
}
