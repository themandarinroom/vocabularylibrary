export const PROJECT = 'the-mandarin-room-staging';
export const REGION = 'australia-southeast1';
export const QUEUE = 'bingoRoundTask';
export const INVOKER = `bingo-tasks-invoker-staging@${PROJECT}.iam.gserviceaccount.com`;
export const API_ACCOUNT = `bingo-api-staging@${PROJECT}.iam.gserviceaccount.com`;
export const WORKER_ACCOUNT = `bingo-worker-staging@${PROJECT}.iam.gserviceaccount.com`;
export const ROUND_MS = 30_000, ROOM_MS = 12*60*60*1000, END_RETENTION_MS = 60*60*1000;
export const MAX_PLAYERS = 30, MAX_POOL = 200, MAX_ATTEMPTS = 40;
export function requireProject(project) { if(project!==PROJECT) throw new Error('Bingo is restricted to the exact staging project.'); }
export function fail(code,message) { throw Object.assign(new Error(message),{code}); }
export function segment(value,label='identifier') { if(typeof value!=='string'||!value||value.length>120||/[\/\u0000-\u001f]/.test(value)||value==='.'||value==='..') fail('invalid-argument',`Invalid ${label}.`); return value; }
export const roomPath = id => `bingoRooms/${segment(id)}`;
export const receiptPath = (room,id) => `${roomPath(room)}/bingoReceipts/${segment(id)}`;
export function writablePath(path) { return /^(bingoRooms|bingoJoinCodes|bingoJoinLimits|bingoCleanup)\/[A-Za-z0-9_-]+(?:\/(bingoPublic|bingoTeacher|bingoPlayerViews|bingoReceipts)\/[A-Za-z0-9_-]+)?$/.test(path); }
