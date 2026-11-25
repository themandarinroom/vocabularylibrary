import { randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { fail, segment } from './config.mjs';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const randomId = () => randomBytes(32).toString('hex');
export const randomToken = () => randomBytes(40).toString('base64url');
export const secureRandom = () => randomInt(0x100000000)/0x100000000;
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const roomCode=()=>Array.from({length:5},()=>alphabet[randomInt(alphabet.length)]).join('');
export function tokenHash(pepper,token) { if(typeof token!=='string'||token.length<40||token.length>150)fail('permission-denied','This device cannot access the room.');return createHmac('sha256',pepper).update(`bingo-v1:capability:${token}`).digest('hex'); }
export const networkHash=(pepper,value)=>createHmac('sha256',pepper).update(`bingo-v1:join-rate:${value}`).digest('hex');
export function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
export function teacherActor(actor) { if(!actor?.uid||actor.emailVerified!==true)fail('unauthenticated','Sign in with a verified teacher account.'); }
export function owner(state,actor) {teacherActor(actor);if(actor.uid!==state.teacherUid)fail('permission-denied','Only the room teacher can control this game.');}
export function playerFor(state,input,pepper) {const id=segment(input.playerId,'player');const player=state.players[id];if(!player||!equal(player.tokenHash,tokenHash(pepper,input.token)))fail('permission-denied','This device cannot access the room.');return player;}
export function cleanName(input,count){const value=String(input||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,36);return value||`Learner ${count+1}`;}
