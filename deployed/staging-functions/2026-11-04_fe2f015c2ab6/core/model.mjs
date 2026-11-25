import { generateBoard, shuffle } from '../shared/board.mjs';
import { winningCells } from '../shared/winning.mjs';
import { validateAnswer } from '../shared/answers.mjs';
import { ROUND_MS, ROOM_MS, END_RETENTION_MS, MAX_PLAYERS, fail } from './config.mjs';
import { digest, cleanName } from './security.mjs';
export function task(s,kind,runAtMs){for(const [key,job]of Object.entries(s.outbox))if(job.payload.kind===kind)delete s.outbox[key];const epoch=s.round?.epoch||0,id=digest(`${s.incarnation}:${kind}:${s.round?.id||'room'}:${epoch}:${runAtMs}:${kind==='drain'?`${s.round?.admitted||0}:${s.round?.processed||0}`:''}`);s.outbox[id]={id,runAtMs,payload:{project:s.project,roomId:s.id,incarnation:s.incarnation,kind,roundId:s.round?.id||null,epoch,runAtMs}};return id;}
export function createState({id,incarnation,project,code,actor,config,pool,now,random}){
 const s={schemaVersion:1,id,incarnation,project,teacherUid:actor.uid,joinCode:code,selection:structuredClone(config.selection),config:{size:Number(config.size),winningMode:config.winningMode,audioMode:'teacher-broadcast',durationMs:ROUND_MS},pool,sequence:shuffle(pool.map(i=>i.key),random),sequenceIndex:-1,players:{},joins:{},roster:[],status:'waiting',round:null,version:0,publicVersion:0,winners:[],reason:null,createdAtMs:now,expiresAtMs:now+ROOM_MS,cleanupAtMs:now+ROOM_MS,outbox:{}};task(s,'cleanup',s.cleanupAtMs);return s;
}
export function joinPlayer(s,{id,viewId,hash,nonce,name,now,random}){
 if(s.status!=='waiting'||Object.keys(s.players).length>=MAX_PLAYERS)fail('failed-precondition','This room is unavailable.');
 const p={id,viewId,tokenHash:hash,joinNonce:nonce,name:cleanName(name,Object.keys(s.players).length),board:generateBoard(s.pool,s.config.size,random,s.config.winningMode),marked:[],stars:5,practice:false,roundCells:{},requestCount:0,feedback:null,lastSeenAtMs:now};s.players[id]=p;s.joins[nonce]=id;return p;
}
export function prepareRound(s,now,newId){
 s.sequenceIndex++;s.status='broadcast-pending';s.round={id:newId,number:s.sequenceIndex+1,epoch:0,startsAtMs:null,deadlineMs:null,remainingMs:ROUND_MS,pending:[],admitted:0,processed:0,sealed:false};
 for(const p of Object.values(s.players)){p.roundCells={};p.requestCount=0;p.feedback=null;}
}
export function start(s,now,id){if(s.status!=='waiting')fail('failed-precondition','The game has already started.');if(Object.keys(s.players).length<2)fail('failed-precondition','At least two students must join.');s.roster=Object.keys(s.players);prepareRound(s,now,id);}
export function broadcastReady(s,roundId,now){if(s.round?.id!==roundId)fail('failed-precondition','That word is no longer current.');if(s.status==='active')return;if(s.status!=='broadcast-pending')fail('failed-precondition','The classroom broadcast is not ready to start.');s.status='active';s.round.epoch++;s.round.startsAtMs=now;s.round.deadlineMs=now+s.round.remainingMs;task(s,'close',s.round.deadlineMs);}
export function pause(s,now){if(!['active','broadcast-pending'].includes(s.status))fail('failed-precondition','There is no active round to pause.');if(s.status==='active'&&now>=s.round.deadlineMs)fail('failed-precondition','The round is closing.');s.pausedFrom=s.status;s.round.remainingMs=s.status==='active'?s.round.deadlineMs-now:ROUND_MS;s.round.deadlineMs=null;s.round.epoch++;s.status='paused';}
export function resume(s,now){if(s.status!=='paused')fail('failed-precondition','The room is not paused.');s.round.epoch++;s.status=s.pausedFrom;delete s.pausedFrom;if(s.status==='active'){s.round.deadlineMs=now+s.round.remainingMs;task(s,'close',s.round.deadlineMs);}}
export function seal(s,now,manual=false){if(manual){if(['ended','deleting'].includes(s.status))return;s.manualEnd=true;}else{if(s.status!=='active'||now<s.round.deadlineMs)return false;}s.status='closing';if(s.round){s.round.sealed=true;s.round.epoch++;}return true;}
export function processReceipt(s,receipt){
 const p=s.players[receipt.playerId];if(!p||receipt.roundId!==s.round?.id)throw Error('Admitted receipt does not belong to the sealed round.');
 let outcome;
 const called=s.sequence[s.sequenceIndex];
 if(p.marked.includes(called))outcome=p.marked.includes(receipt.cellKey)?'locked':'answered';
 else{
 const result=validateAnswer({status:'playing',currentKey:called,round:s.round.number,board:p.board,marked:p.marked,stars:p.stars,practice:p.practice,receipts:[],wrongCells:[]},{cellKey:receipt.cellKey,attemptId:receipt.id,round:s.round.number});
 outcome=result.outcome;p.marked=result.state.marked;p.stars=result.state.stars;p.practice=result.state.practice;
 }
 p.feedback={roundId:receipt.roundId,attemptId:receipt.attemptId,outcome,cellKey:receipt.cellKey};s.round.processed++;
 return {...receipt,status:'processed',outcome};
}
export function finishRound(s,now,newId){
 if(s.status!=='closing'||s.round?.pending.length) return false;
 if(s.round&&s.round.processed!==s.round.admitted)throw Error('Closure cannot finish until every admitted answer is processed.');
 if(!s.manualEnd&&s.round)s.winners=s.roster.filter(id=>{const p=s.players[id];return!p.practice&&winningCells(p.board,p.marked,s.config.size,s.config.winningMode).length>0;});
 if(s.manualEnd||s.winners.length||s.sequenceIndex+1>=s.sequence.length){s.status='ended';s.reason=s.manualEnd?'teacher-ended':s.winners.length?'winners':'all-words-called';s.cleanupAtMs=Math.min(s.expiresAtMs,now+END_RETENTION_MS);task(s,'cleanup',s.cleanupAtMs);return true;}
 prepareRound(s,now,newId);return true;
}
