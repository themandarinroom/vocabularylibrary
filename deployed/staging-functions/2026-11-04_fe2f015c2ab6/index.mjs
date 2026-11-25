import { createAnswerInstrumentation, mark, end } from './core/performance.mjs';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getFunctions} from 'firebase-admin/functions';
import {onCall,onRequest,HttpsError} from 'firebase-functions/v2/https';
import {onTaskDispatched} from 'firebase-functions/v2/tasks';
import {defineSecret} from 'firebase-functions/params';
import {PROJECT,REGION,INVOKER,API_ACCOUNT,WORKER_ACCOUNT,requireProject} from './core/config.mjs';
import {teacherActor} from './core/security.mjs';
import {createBingoService} from './core/service.mjs';
import {FirestoreDatabase} from './adapters/firestore.mjs';
import {CloudTasks} from './adapters/tasks.mjs';
// Fail closed for both runtime and Firebase manifest discovery. No production fallback.
requireProject(process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT);
const app=initializeApp({projectId:PROJECT,serviceAccountId:INVOKER});
const firestore=getFirestore(app),db=new FirestoreDatabase(firestore,PROJECT),tasks=new CloudTasks(getFunctions(app),PROJECT);
const secret=defineSecret('LIVE_SESSION_TOKEN_PEPPER');
const source={readSet:async id=>(await firestore.doc(`vocabularySets/${id}`).get()).data(),readVoice:async(set,id)=>(await firestore.doc(`vocabularyTeacherVoices/${set}--${id}`).get()).data()};
async function requireTeacher(actor){teacherActor(actor);const doc=await firestore.doc(`authorizedTeachers/${actor.uid}`).get();if(doc.data()?.active!==true)throw new HttpsError('permission-denied','This teacher account is not authorised.');}
const actor=req=>req.auth?{uid:req.auth.uid,emailVerified:req.auth.token.email_verified===true}:null;
const api=()=>createBingoService({db,tasks,source,requireTeacher,pepper:secret.value(),inlineProcessing:false,fastAckEnabled:process.env.BINGO_FAST_ACK_ENABLED==='1'});
const worker=()=>createBingoService({db,tasks,source,requireTeacher,mode:'worker'});
const options={region:REGION,serviceAccount:API_ACCOUNT,secrets:[secret],timeoutSeconds:60,memory:'256MiB',maxInstances:2,concurrency:40};
const codes=new Set(['invalid-argument','failed-precondition','unauthenticated','permission-denied','not-found','resource-exhausted','already-exists']);
const instrumentAnswer=createAnswerInstrumentation({project:PROJECT,enabled:process.env.BINGO_PERF_ENABLED==='1'});
function callable(fn,instrument=(_req,run)=>run()){return onCall(options,async req=>instrument(req,async()=>{try{const validation=mark('request.validation');try{if(!req.data||typeof req.data!=='object'||Array.isArray(req.data))throw new HttpsError('invalid-argument','A command object is required.');if(Buffer.byteLength(JSON.stringify(req.data))>16000)throw new HttpsError('invalid-argument','Command too large.');}finally{end(validation);}return await fn(api(),req);}catch(error){if(error instanceof HttpsError)throw error;if(codes.has(error.code))throw new HttpsError(error.code,error.message);console.error('Bingo operation failed',error.code||'internal');throw new HttpsError('internal','The room could not update. Please reconnect.');}}));}
export const bingoCreateRoom=callable((service,req)=>service.create(actor(req),req.data));
export const bingoJoinRoom=callable((service,req)=>service.join(req.data,{network:req.rawRequest.ip||'unknown'}));
export const bingoSync=callable((service,req)=>service.sync(req.data,actor(req)));
export const bingoTeacherCommand=callable((service,req)=>service.command(actor(req),req.data));
export const bingoAnswer=callable((service,req)=>service.answer(req.data),instrumentAnswer);
export const bingoRoundTask=onTaskDispatched({region:REGION,serviceAccount:WORKER_ACCOUNT,invoker:[INVOKER],timeoutSeconds:60,memory:'256MiB',maxInstances:1,concurrency:1,retryConfig:{maxAttempts:10,maxRetrySeconds:3600,minBackoffSeconds:1,maxBackoffSeconds:30,maxDoublings:5},rateLimits:{maxConcurrentDispatches:1,maxDispatchesPerSecond:10}},async req=>{const result=await worker().handleTask(req.data);if(result.retryAtMs)throw Error('Task arrived before the authoritative deadline.');});
// IAM-private endpoint. A separately approved Scheduler job must invoke with INVOKER OIDC.
export const bingoRecovery=onRequest({region:REGION,serviceAccount:WORKER_ACCOUNT,invoker:[INVOKER],timeoutSeconds:300,memory:'256MiB',maxInstances:1,concurrency:1},async(req,res)=>{if(req.method!=='POST'){res.status(405).end();return;}try{await worker().recover();res.status(204).end();}catch{res.status(500).send('Recovery needs retry.');}});
