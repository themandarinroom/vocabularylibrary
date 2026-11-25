import { PROJECT, MAX_ATTEMPTS, roomPath, receiptPath, requireProject, segment, fail } from './config.mjs';
import { owner, playerFor, tokenHash, networkHash, randomId, roomCode, secureRandom, digest } from './security.mjs';
import { resolveVocabulary } from './vocabulary.mjs';
import { publicView, playerView, teacherView } from './projections.mjs';
import * as model from './model.mjs';
const clone=value=>structuredClone(value);
function nonce(value){segment(value,'request ID');if(value.length<24)fail('invalid-argument','A fresh request ID is required.');return value;}
export function createBingoService({project=PROJECT,db,tasks,clock={now:()=>Date.now()},pepper,mode='api',inlineProcessing=true,source,requireTeacher,id=randomId,code=roomCode,random=secureRandom,fault=()=>{}}){
 requireProject(project);if(mode==='api'&&(typeof pepper!=='string'||pepper.length<24))throw Error('A configured Bingo capability secret is required.');
 if(typeof requireTeacher!=='function')throw Error('Teacher authorisation must be provided.');
 const now=()=>clock.now();
 const unwrap=doc=>doc?.data;
 function assertRoom(state){if(!state)fail('not-found','This room is unavailable.');if(state.project!==PROJECT)throw Error('Foreign room rejected.');if(state.expiresAtMs<=now()||state.status==='deleting')fail('failed-precondition','This room has expired.');}
 async function load(tx,room){const s=unwrap(await tx.get(roomPath(room)));assertRoom(s);return s;}
 async function write(tx,s,{players=[],all=false,publish=false,teacher=true}={}){
  s.version++;if(publish)s.publicVersion++;
  if(Buffer.byteLength(JSON.stringify(s))>850_000)fail('resource-exhausted','This room is too large. Reduce the vocabulary pool.');
  tx.set(roomPath(s.id),{schemaVersion:1,teacherUid:s.teacherUid,status:s.status,expiresAtMs:s.expiresAtMs,cleanupAtMs:s.cleanupAtMs,needsDispatch:Object.keys(s.outbox).length>0,incarnation:s.incarnation,data:s});
  if(publish)tx.set(`${roomPath(s.id)}/bingoPublic/state`,publicView(s));
  if(teacher)tx.set(`${roomPath(s.id)}/bingoTeacher/state`,teacherView(s));
  for(const playerId of all?Object.keys(s.players):players){const p=s.players[playerId];tx.set(`${roomPath(s.id)}/bingoPlayerViews/${p.viewId}`,playerView(s,playerId));}
  if(s.status==='ended'){const lookup=await tx.get(`bingoJoinCodes/${s.joinCode}`);if(lookup?.roomId===s.id&&lookup.incarnation===s.incarnation)tx.delete(`bingoJoinCodes/${s.joinCode}`);}
 }
 async function flush(room){
  const state=unwrap(await db.get(roomPath(room)));if(!state||state.status==='deleting')return{pending:0};
  for(const job of Object.values(state.outbox)){
   try{await tasks.enqueue(clone(job));}catch(error){return{pending:Object.keys(state.outbox).length};}
   await fault('after-enqueue',job);
   await db.transaction(async tx=>{const live=unwrap(await tx.get(roomPath(room)));if(!live||live.incarnation!==state.incarnation||!live.outbox[job.id])return;delete live.outbox[job.id];await write(tx,live,{teacher:false});});
  }
  return{pending:0};
 }
 async function rateJoin(input,network){const window=Math.floor(now()/600000),ip=networkHash(pepper,network||'unknown'),key=networkHash(pepper,input.code||'invalid');await db.transaction(async tx=>{const paths=[`bingoJoinLimits/ip_${ip}_${window}`,`bingoJoinLimits/code_${key}_${window}`];const counts=await Promise.all(paths.map(path=>tx.get(path)));if((counts[0]?.count||0)>=180||(counts[1]?.count||0)>=90)fail('resource-exhausted','Too many joins. Please wait and try again.');paths.forEach((path,i)=>tx.set(path,{count:(counts[i]?.count||0)+1,expiresAtMs:(window+2)*600000}));});}
 async function create(actor,input){
  if(mode!=='api')fail('permission-denied','API runtime required.');
  await requireTeacher(actor);const requestId=nonce(input.requestId),requestPath=`bingoJoinCodes/_create_${digest(`${actor.uid}:${requestId}`)}`;
  const existing=await db.get(requestPath);if(existing){const state=unwrap(await db.get(roomPath(existing.roomId)));assertRoom(state);owner(state,actor);return{roomId:state.id,joinCode:state.joinCode,serverNowMs:now()};}
  const pool=await resolveVocabulary(input,source);
  for(let attempt=0;attempt<5;attempt++){
   const room=id(),incarnation=id(),joinCode=code();
   const result=await db.transaction(async tx=>{const [receipt,current,lookup,ticket]=await Promise.all([tx.get(requestPath),tx.get(roomPath(room)),tx.get(`bingoJoinCodes/${joinCode}`),tx.get(`bingoCleanup/${room}`)]);if(receipt)return{roomId:receipt.roomId,joinCode:receipt.joinCode};if(current||ticket||lookup)return null;
    const state=model.createState({id:room,incarnation,project,code:joinCode,actor,config:input,pool,now:now(),random});state.createReceiptPath=requestPath;
    await write(tx,state,{publish:true});tx.set(`bingoJoinCodes/${joinCode}`,{roomId:room,incarnation,expiresAtMs:state.expiresAtMs});tx.set(requestPath,{roomId:room,incarnation,joinCode,expiresAtMs:state.expiresAtMs});return{roomId:room,joinCode};});
   if(result){await flush(result.roomId);return{...result,serverNowMs:now()};}
  }fail('resource-exhausted','Could not allocate a room. Please try again.');
 }
 async function join(input,{network='unknown'}={}){
  if(mode!=='api')fail('permission-denied','API runtime required.');
  const joinCode=String(input.code||'').trim().toUpperCase();if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(joinCode))fail('failed-precondition','This room is unavailable.');
  const joinNonce=digest(nonce(input.joinNonce)),hash=tokenHash(pepper,input.token);await rateJoin({code:joinCode},network);
  const result=await db.transaction(async tx=>{const lookup=await tx.get(`bingoJoinCodes/${joinCode}`);if(!lookup||lookup.expiresAtMs<=now())fail('failed-precondition','This room is unavailable.');const state=await load(tx,lookup.roomId);if(lookup.incarnation!==state.incarnation)fail('failed-precondition','This room is unavailable.');
   let player=state.players[state.joins[joinNonce]];
   if(player){if(player.tokenHash!==hash)fail('permission-denied','This device cannot access the room.');}
   else{player=model.joinPlayer(state,{id:id(),viewId:id(),hash,nonce:joinNonce,name:input.name,now:now(),random});await write(tx,state,{players:[player.id],publish:true});}
   return{roomId:state.id,playerId:player.id,viewId:player.viewId,view:playerView(state,player.id),public:publicView(state),serverNowMs:now()};});return result;
 }
 async function sync(input,actor=null){
  if(mode!=='api')fail('permission-denied','API runtime required.');
  if(input.role==='teacher')await requireTeacher(actor);
  return db.transaction(async tx=>{const state=await load(tx,input.roomId);
   if(input.role==='teacher'){owner(state,actor);return{teacher:teacherView(state),serverNowMs:now()};}
   const player=playerFor(state,input,pepper);if(now()-player.lastSeenAtMs>120000){player.lastSeenAtMs=now();await write(tx,state,{teacher:true});}
   return{view:playerView(state,player.id),public:publicView(state),viewId:player.viewId,serverNowMs:now()};
  });
 }
 async function command(actor,input){
  if(mode!=='api')fail('permission-denied','API runtime required.');
  await requireTeacher(actor);segment(input.roomId);nonce(input.requestId);
  // Revalidate publication and frozen references before starting. Never replace waiting boards.
  if(input.action==='start'){
   const snapshot=unwrap(await db.get(roomPath(input.roomId)));assertRoom(snapshot);owner(snapshot,actor);
   if(snapshot.status==='waiting'){const pool=await resolveVocabulary({...snapshot.config,selection:snapshot.selection},source);if(JSON.stringify(pool)!==JSON.stringify(snapshot.pool))fail('failed-precondition','Vocabulary or recordings changed. Create a new room so waiting boards stay accurate.');}
  }
  const receiptId=`cmd_${digest(`${actor.uid}:${input.requestId}`)}`;
  const fingerprint=digest(JSON.stringify([input.action,input.roundId||null]));
  await db.transaction(async tx=>{const state=await load(tx,input.roomId);owner(state,actor);const prior=await tx.get(receiptPath(state.id,receiptId));if(prior){if(prior.fingerprint!==fingerprint)fail('invalid-argument','A request ID was reused for another action.');return;}
   switch(input.action){case'start':model.start(state,now(),id());break;case'broadcast-ready':model.broadcastReady(state,input.roundId,now());break;case'pause':model.pause(state,now());break;case'resume':model.resume(state,now());break;case'end':model.seal(state,now(),true);model.task(state,'drain',now());break;default:fail('invalid-argument','Unknown teacher action.');}
   tx.set(receiptPath(state.id,receiptId),{kind:'teacher-command',fingerprint,status:'processed',expiresAtMs:state.expiresAtMs});await write(tx,state,{all:true,publish:true});
  });
  if(input.action==='end')await drain(input.roomId,50);await flush(input.roomId);return sync({roomId:input.roomId,role:'teacher'},actor);
 }
 async function answer(input){
  if(mode!=='api')fail('permission-denied','API runtime required.');
  nonce(input.attemptId);segment(input.roundId,'round');const canonical=digest(JSON.stringify([input.playerId,input.roundId,input.attemptId]));const fingerprint=digest(JSON.stringify([input.roundId,input.cellKey]));
  const admission=await db.transaction(async tx=>{const state=await load(tx,input.roomId);const player=playerFor(state,input,pepper);const path=receiptPath(state.id,canonical),prior=await tx.get(path);
   if(prior){if(prior.fingerprint!==fingerprint)fail('invalid-argument','An attempt ID was reused for a different cell.');return{receipt:prior,id:canonical,duplicate:true};}
   if(state.status!=='active'||state.round?.id!==input.roundId||now()>=state.round.deadlineMs)fail('failed-precondition','This round is not accepting answers.');
   if(!player.board.includes(input.cellKey))fail('invalid-argument','Choose a cell on your own board.');
   if(player.requestCount>=MAX_ATTEMPTS)fail('resource-exhausted','Take a moment to listen before tapping again.');player.requestCount++;
   const previousId=player.roundCells[input.cellKey];
   if(previousId){const original=await tx.get(receiptPath(state.id,previousId));const alias={...original,id:canonical,attemptId:input.attemptId,fingerprint,aliasTo:previousId};tx.set(path,alias);await write(tx,state,{teacher:false});return{receipt:alias,id:canonical,duplicate:true};}
   const receipt={id:canonical,playerId:player.id,roundId:state.round.id,attemptId:input.attemptId,cellKey:input.cellKey,fingerprint,status:'pending',ordinal:++state.round.admitted,admittedAtMs:now(),expiresAtMs:state.expiresAtMs};
   player.roundCells[input.cellKey]=canonical;player.feedback={roundId:input.roundId,attemptId:input.attemptId,outcome:'pending',cellKey:input.cellKey};state.round.pending.push(canonical);tx.set(path,receipt);model.task(state,'drain',now());await write(tx,state,{players:[player.id],teacher:false});return{receipt,id:canonical,duplicate:false};
  });
  await fault('after-admission',admission);
  if(inlineProcessing)await drain(input.roomId,8);await flush(input.roomId);
  let receipt=await db.get(receiptPath(input.roomId,admission.id));if(receipt?.aliasTo)receipt=await db.get(receiptPath(input.roomId,receipt.aliasTo));
  return{status:receipt?.status||'pending',outcome:receipt?.outcome||null,duplicate:admission.duplicate,serverNowMs:now()};
 }
 async function drain(room,limit=50){
  for(let count=0;count<limit;count++){
   const result=await db.transaction(async tx=>{const state=await load(tx,room);const receiptId=state.round?.pending[0];
    if(!receiptId){const changed=model.finishRound(state,now(),id());if(changed)await write(tx,state,{all:true,publish:true});return{done:true};}
    const path=receiptPath(room,receiptId),receipt=await tx.get(path);if(!receipt)throw Error('An admitted answer receipt is missing; closure is blocked.');
    state.round.pending.shift();if(receipt.status!=='processed'){const processed=model.processReceipt(state,receipt);tx.set(path,processed);}
    if(!state.round.pending.length){for(const [key,job]of Object.entries(state.outbox))if(job.payload.kind==='drain')delete state.outbox[key];}
    else model.task(state,'drain',now());
    const finished=model.finishRound(state,now(),id());
    await write(tx,state,finished?{all:true,publish:true}:{players:[receipt.playerId]});return{done:finished};
   });
   await fault('after-processing',result);if(result.done)return;
  }
 }
 async function cleanup(room,incarnation){
  const ticketPath=`bingoCleanup/${segment(room)}`;
  const ready=await db.transaction(async tx=>{const raw=await tx.get(roomPath(room)),ticket=await tx.get(ticketPath),state=unwrap(raw);
   if(state&&state.incarnation!==incarnation)return false;if(ticket&&ticket.incarnation!==incarnation)return false;
   if(!state&&!ticket)return false;if(state&&now()<Math.min(state.expiresAtMs,state.cleanupAtMs))return false;
   if(state){state.status='deleting';await write(tx,state,{all:true,publish:true});const lookup=await tx.get(`bingoJoinCodes/${state.joinCode}`);if(lookup?.roomId===room&&lookup.incarnation===incarnation)tx.delete(`bingoJoinCodes/${state.joinCode}`);if(state.createReceiptPath)tx.delete(state.createReceiptPath);tx.set(ticketPath,{roomId:room,incarnation,cleanupAtMs:now()});}return true;
  });
  if(!ready)return{ignored:true};await db.recursiveDelete(roomPath(room));await fault('after-recursive-delete',{room});await db.transaction(async tx=>{const t=await tx.get(ticketPath);if(t?.incarnation===incarnation)tx.delete(ticketPath);});return{deleted:true};
 }
 async function handleTask(payload){
  requireProject(payload.project);segment(payload.roomId);segment(payload.incarnation);
  if(payload.kind==='cleanup')return cleanup(payload.roomId,payload.incarnation);
  const ready=await db.transaction(async tx=>{const state=unwrap(await tx.get(roomPath(payload.roomId)));if(!state||state.incarnation!==payload.incarnation||state.expiresAtMs<=now())return{ignored:true};
   if(state.round?.id!==payload.roundId)return{ignored:true};
   if(payload.kind==='close'){
    if(state.status==='active'&&state.round.epoch===payload.epoch){if(now()<state.round.deadlineMs)return{retryAtMs:state.round.deadlineMs};model.seal(state,now());await write(tx,state,{all:true,publish:true});return{drain:true};}
    return state.status==='closing'?{drain:true}:{ignored:true};
   }
   if(payload.kind==='drain')return{drain:true};fail('invalid-argument','Unknown task kind.');
  });
  if(ready.drain){await fault('after-seal',payload);await drain(payload.roomId,100);await flush(payload.roomId);}return ready;
 }
 async function recover(){
  const tickets=await db.query('bingoCleanup',{field:'cleanupAtMs',op:'<=',value:now(),limit:100});for(const t of tickets)await cleanup(t.data.roomId,t.data.incarnation);
  const expired=await db.query('bingoRooms',{field:'cleanupAtMs',op:'<=',value:now(),limit:100});for(const r of expired)await cleanup(r.data.data.id,r.data.incarnation);
  const pending=await db.query('bingoRooms',{field:'needsDispatch',value:true,limit:100});for(const r of pending){await flush(r.data.data.id);if(r.data.data.status==='closing')await drain(r.data.data.id,100);}
  const limits=await db.query('bingoJoinLimits',{field:'expiresAtMs',op:'<=',value:now(),limit:300});for(const r of limits)await db.transaction(async tx=>{const current=await tx.get(r.path);if(current?.expiresAtMs<=now())tx.delete(r.path);});
  return{tickets:tickets.length,expired:expired.length,pending:pending.length};
 }
 return{create,join,sync,command,answer,drain,flush,handleTask,recover,cleanup};
}
