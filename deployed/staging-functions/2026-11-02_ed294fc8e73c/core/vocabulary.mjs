import { catalogueFromSets } from '../shared/vocabulary.mjs';
import { validateConfiguration } from '../shared/board.mjs';
import { fail, segment, PROJECT, MAX_POOL } from './config.mjs';
export function validVoiceUrl(url,setId,itemId) {
  if(!url)return false;
  try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='firebasestorage.googleapis.com'&&decodeURIComponent(u.pathname).startsWith(`/v0/b/${PROJECT}.firebasestorage.app/o/vocabulary/${setId}/${itemId}/teacher-voice-`)&&u.searchParams.get('alt')==='media';}catch{return false;}
}
export async function resolveVocabulary(config,{readSet,readVoice}) {
 const mode=config?.selection?.mode;
 if(!['whole','custom'].includes(mode))fail('invalid-argument','Choose a whole set or a custom selection.');
 let refs=[];const sources=new Map();
 if(mode==='whole'){
  const id=segment(config.selection.setId,'set');const set=await readSet(id);sources.set(id,set);
  if(set?.published!==true||set.deleted===true||set.id!==id)fail('failed-precondition','Choose a currently published Vocabulary Library set.');
  refs=(catalogueFromSets([set]).sets[0]?.items||[]).map(item=>({setId:id,id:item.id}));
 }else refs=config.selection.items;
 if(!Array.isArray(refs)||refs.length<1||refs.length>MAX_POOL)fail('invalid-argument',`Choose 1–${MAX_POOL} source entries.`);
 const keys=new Set();const pool=[];
 for(const ref of refs){const setId=segment(ref.setId,'set'),id=segment(ref.id,'item'),identity=JSON.stringify([setId,id]);
  if(keys.has(identity))fail('invalid-argument','Remove repeated source entries.');keys.add(identity);
  if(!sources.has(setId))sources.set(setId,await readSet(setId));const source=sources.get(setId);
  if(source?.published!==true||source.deleted===true||source.id!==setId)fail('failed-precondition','A selected set is no longer published.');
  const entries=catalogueFromSets([source]).sets[0]?.items||[],item=entries.find(item=>item.id===id);
  if(!item)fail('failed-precondition','A selected Library entry is unavailable or ambiguous.');
  if(item.chinese.length>80||item.pinyin.length>160||item.english.length>200)fail('failed-precondition','A selected phrase is too long for Bingo.');
  const voice=await readVoice(setId,id);let teacherAudioUrl='';
  if(voice){if(voice.setId!==setId||voice.itemId!==id)fail('failed-precondition','Teacher Voice identity mismatch.');
   if(voice.teacherAudioUrl&&!validVoiceUrl(voice.teacherAudioUrl,setId,id))fail('failed-precondition','Teacher Voice must be hosted in staging.');
   if(voice.teacherAudioUrl){const path=decodeURIComponent(new URL(voice.teacherAudioUrl).pathname).split('/o/')[1];if(path!==voice.storagePath||path!==`vocabulary/${setId}/${id}/teacher-voice-${voice.revision}`)fail('failed-precondition','Teacher Voice revision mismatch.');}
   teacherAudioUrl=voice.teacherAudioUrl||'';
  }
  if(teacherAudioUrl.length>2200)fail('failed-precondition','Recording reference is too long.');
  pool.push({...item,teacherAudioUrl,voiceRevision:voice?.revision||null});
 }
 try{validateConfiguration(pool,Number(config.size),config.winningMode);}catch(e){fail('failed-precondition',e.message);}
 if(config.audioMode&&config.audioMode!=='teacher-broadcast')fail('invalid-argument','Live Bingo uses Teacher Broadcast.');
 return pool;
}
