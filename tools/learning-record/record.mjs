// Evidence of Learning: a shared, game-agnostic completion record (Phase A: data contract only).
// Any game (Tarsia Puzzle, Bingo Solo, Build the Great Wall…) builds one of these after a successful finish;
// a later shared renderer turns it into a printable PNG. Built and kept on the device: never uploaded,
// never sent to Firebase or analytics. It shows that an activity was completed, not independent mastery.

export const RECORD_SCHEMA_VERSION = 1;
// Shown on every record: it documents successful completion, not independent mastery.
export const STATEMENT = 'This record shows that the activity was completed successfully.'; // D1: owner removed the second sentence
export const EXPORT_FORMAT = Object.freeze({ type: 'image/png', width: 1748, height: 1240, paper: 'A6 landscape', dpi: 300, background: '#ffffff' });

const text = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const localDate = date => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error('A completion date is required.');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * @param {object} input
 * @param {{id:string,name:string,category:string}} input.activity
 * @param {Date|string} input.completedAt          local completion time
 * @param {{firstName?:string,className?:string}} [input.student]   optional, typed by the student, local only
 * @param {{id:string,title:string,chineseTitle?:string}[]} input.vocabularySets
 * @param {{id:string,label:string}} input.difficulty
 * @param {{id:string,label:string}} input.matchingMode
 * @param {number} input.matchesCompleted
 * @param {string} input.learningIntention        what the activity practises (derived from the game's mode)
 * @param {string} input.successCriteria          how completion is judged, e.g. 'I can complete a Tarsia puzzle by correctly matching all 18 vocabulary pairs.'
 * @param {object} input.content                   game-specific snapshot of the finished activity (e.g. the solved puzzle)
 */
export function buildCompletionRecord(input) {
  const required = ['activity', 'completedAt', 'vocabularySets', 'difficulty', 'matchingMode', 'learningIntention', 'successCriteria', 'content'];
  for (const key of required) if (input?.[key] === undefined || input?.[key] === null) throw new Error(`Completion record needs ${key}.`);
  for (const key of ['learningIntention', 'successCriteria']) if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error(`Completion record needs ${key}.`);
  if (!Number.isInteger(input.matchesCompleted) || input.matchesCompleted < 1) throw new Error('Completion record needs a positive number of matches.');
  const student = {};
  const firstName = text(input.student?.firstName, 40), className = text(input.student?.className, 20);
  if (firstName) student.firstName = firstName;
  if (className) student.className = className;
  return Object.freeze({
    schemaVersion: RECORD_SCHEMA_VERSION,
    brand: 'The Mandarin Room',
    activity: Object.freeze({ id: input.activity.id, name: input.activity.name, category: input.activity.category }),
    completedAt: localDate(input.completedAt),
    student: Object.freeze(student),
    vocabularySets: Object.freeze(input.vocabularySets.map(s => Object.freeze({ id: s.id, title: s.title, chineseTitle: s.chineseTitle || '' }))),
    difficulty: Object.freeze({ ...input.difficulty }),
    matchingMode: Object.freeze({ ...input.matchingMode }),
    matchesCompleted: input.matchesCompleted,
    learningIntention: input.learningIntention,
    successCriteria: input.successCriteria,
    completionStatus: 'completed',
    statement: STATEMENT,
    content: input.content
  });
}

/**
 * Proposed export interface (Phase B; not implemented in Phase A).
 *
 * renderLearningRecord(record, { format = EXPORT_FORMAT, drawContent }) → Promise<Blob>
 *   Draws on a local <canvas> (1748 × 1240, white, print-friendly): branding, activity, optional name/class, date,
 *   sets, difficulty, mode, matches, learning intention, success criteria, statement, the game's own content via `drawContent(ctx, box, record.content)`.
 *   No game controls or navigation. Remote vocabulary pictures need CORS-readable sources, or the export falls back to text.
 *
 * shareOrSaveRecord(blob, filename) → Promise<'shared' | 'shown' | 'downloaded'>
 *   1. navigator.canShare?.({ files: [file] }) → navigator.share({ files: [file] })  (iPad share sheet: Save Image, AirDrop…)
 *   2. Otherwise show the PNG in an <img> (object URL) with "Press and hold the picture to save it" and a download link.
 *   Safari is never assumed to save to Photos without the student's own action.
 */
export const PHASE_B_EXPORT_INTERFACE = Object.freeze(['renderLearningRecord', 'shareOrSaveRecord']);
