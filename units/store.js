import { getFirebaseServices } from "../js/firebase.js";
import { vocabularySets as seedVocabulary } from "../js/vocabulary-data.js";

const STORAGE_KEY = "mandarin-room-units-v0.1";
const COLLECTION = "units";
const clone = value => JSON.parse(JSON.stringify(value));
export const yearLabel = year => Number(year) === 0 ? "Prep" : `Year ${year}`;
export const sampleUnit = { id: "year4-australian-states-territories", yearLevel: 4, englishTitle: "Australian States and Territories", chineseTitle: "澳大利亚各州和直辖区", lessons: [
  { id: "introduction", title: "Introduction to Australian States", learningIntention: "Recognise the names of Australian states in Mandarin.", notes: "", vocabularySetId: "year4-australian-states", speakingActivityId: "", resources: "" },
  { id: "where-have-you-been", title: "Where have you been?", learningIntention: "Ask and answer where someone has been.", notes: "Model the question and response, then practise with a partner.", vocabularySetId: "year4-australian-states", speakingActivityId: "year-4:core", resources: "" },
  { id: "speaking-practice", title: "Speaking practice", learningIntention: "Use state names confidently in a short exchange.", notes: "", vocabularySetId: "", speakingActivityId: "year-4:core", resources: "" },
  { id: "review-assessment", title: "Review and assessment", learningIntention: "Review and demonstrate the unit language.", notes: "", vocabularySetId: "", speakingActivityId: "", resources: "" }
] };

function localUnits() { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(value) ? value : [clone(sampleUnit)]; } catch { return [clone(sampleUnit)]; } }
function cache(units) { localStorage.setItem(STORAGE_KEY, JSON.stringify(units)); }
const withTimeout = (promise, milliseconds) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out")), milliseconds))]);
export async function getUnits() { const local = localUnits(); try { const s = await withTimeout(getFirebaseServices(), 800); const snap = await withTimeout(s.firestoreSdk.getDocs(s.firestoreSdk.collection(s.db, COLLECTION)), 800); const cloud = snap.docs.map(d => d.data()).filter(x => !x.deleted); if (cloud.length) return cloud; } catch (e) { console.info("[Units] Local preview mode.", e); } return local; }
export async function getUnit(id) { return (await getUnits()).find(unit => unit.id === id) || null; }
export async function saveUnit(unit) { const clean = clone(unit); const units = localUnits(); const i = units.findIndex(x => x.id === clean.id); if (i < 0) units.push(clean); else units[i] = clean; cache(units); try { const s = await getFirebaseServices(); if (s.auth.currentUser) await s.firestoreSdk.setDoc(s.firestoreSdk.doc(s.db, COLLECTION, clean.id), { ...clean, updatedAt: s.firestoreSdk.serverTimestamp(), updatedBy: s.auth.currentUser.uid }); } catch (e) { console.info("[Units] Saved locally; cloud save unavailable.", e); } return clean; }
export async function getVocabularySets() { try { const { getSets } = await import("../js/vocabulary-store.js"); return await withTimeout(getSets(), 1200); } catch { return clone(seedVocabulary); } }
export const vocabularyUrl = id => `../index.html?set=${encodeURIComponent(id)}`;
export const speakingUrl = ref => { const [year, practice] = ref.split(":"); return `https://themandarinroom.github.io/speaking/teacher.html?year=${encodeURIComponent(year)}&practice=${encodeURIComponent(practice)}`; };
export const speakingOptions = ["prep","year-1","year-2","year-3","year-4","year-5","year-6"].flatMap(year => ["core","challenge"].map(practice => ({ id: `${year}:${practice}`, title: `${year === "prep" ? "Prep" : `Year ${year.slice(5)}`} · ${practice === "core" ? "Core Practice" : "Challenge Practice"}` })));
export function makeId(value) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || `unit-${Date.now()}`; }
