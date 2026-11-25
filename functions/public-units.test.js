const test = require('node:test'), assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { createPublicUnitHandlers } = require('./public-units');
const PROJECT='demo-learning-journey', host=process.env.FIRESTORE_EMULATOR_HOST;
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host||''))throw Error('Local emulator required; cloud tests prohibited.');
const app=initializeApp({projectId:PROJECT},'public-unit-tests'), db=getFirestore(app);
const handlers=createPublicUnitHandlers({db,projectId:PROJECT});
const teacher={uid:'synthetic-teacher',token:{email_verified:true}}, stranger={uid:'synthetic-stranger',token:{email_verified:true}};
const source={id:'synthetic-unit',yearLevel:4,englishTitle:'Synthetic Animals',chineseTitle:'动物',updatedAt:Timestamp.fromMillis(1700000000000),updatedBy:'private-admin',privatePlanning:'DO NOT EXPOSE',deleted:false,lessons:[
 {id:'lesson-a',title:'Meet the animals',learningIntention:'Name two animals.',notes:'PRIVATE TEACHER NOTES',resources:'https://example.org/private-planning\nhttps://example.org/public-worksheet',vocabularySetId:'synthetic-words',speakingPracticeId:'synthetic-speaking',workedExamples:[{id:'example-a',url:'https://example.org/approved.png',alt:'An animal diagram',storagePath:'private-metadata'}]},
 {id:'lesson-b',title:'Practise',learningIntention:'Practise together.',notes:'ANOTHER PRIVATE NOTE',resources:'',vocabularySetId:'',speakingPracticeId:'',workedExamples:[]}
]};
const selection=(id='lesson-a',overrides={})=>({id,includeLearningIntention:false,content:'Student practice text.',includeVocabulary:false,includeSpeaking:false,resourceUrls:[],workedExampleIds:[],...overrides});
const input=(overrides={})=>({unitId:source.id,expectedRevision:0,sourceVersion:'1700000000:0',approved:true,student:{description:'A student-safe description.',topics:['animals'],lessons:[selection(),selection('lesson-b')]},...overrides});
const publish=(data=input(),auth=teacher)=>handlers.publishPublicUnit({data,auth});
const unpublish=(data={unitId:source.id,expectedRevision:1},auth=teacher)=>handlers.unpublishPublicUnit({data,auth});
const get=async path=>(await db.doc(path).get()).data();
const rejects=(promise,code)=>assert.rejects(promise,error=>error.code===code);
function token(auth){const now=Math.floor(Date.now()/1000);return [{alg:'none',typ:'JWT'},{sub:auth.uid,user_id:auth.uid,email_verified:auth.token.email_verified,aud:PROJECT,iss:`https://securetoken.google.com/${PROJECT}`,iat:now,exp:now+3600,firebase:{sign_in_provider:'google.com',identities:{}}}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.';}
async function rest(path,{auth,method='GET',body}={}){return fetch(`http://${host}/v1/projects/${PROJECT}/databases/(default)/documents${path.startsWith(':')?'':'/'}${path}`,{method,headers:{...(auth?{Authorization:`Bearer ${token(auth)}`}:{ }),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
async function reset(){assert.equal((await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,{method:'DELETE'})).status,200);}
test('student Unit publication — emulator-only synthetic records',async t=>{
 t.beforeEach(async()=>{await reset();await db.doc('authorizedTeachers/'+teacher.uid).set({active:true});await db.doc('authorizedTeachers/synthetic-inactive').set({active:false});await db.doc('units/'+source.id).set(source);await db.doc('vocabularySets/synthetic-words').set({published:true,yearLevel:2});await db.doc('speakingPractices/synthetic-speaking').set({deleted:false,yearLevelId:'year-2'});});
 t.after(async()=>{try{await reset();}finally{await db.terminate();await deleteApp(app);}});
 await t.test('explicit approval publishes only safe fields and preserves lesson order and the original Unit',async()=>{
  const original=await get('units/'+source.id);assert.equal((await publish()).revision,1);const doc=await get('publicUnits/'+source.id);
  assert.deepEqual(doc.lessons.map(l=>l.id),['lesson-a','lesson-b']);assert.equal(doc.yearLevel,4);assert.equal(doc.lessons[0].learningIntention,'');assert.deepEqual(doc.lessons[0].links,[]);assert.equal('workedExamples' in doc.lessons[0],false);
  assert.deepEqual(await get('units/'+source.id),original);
  for(const privateValue of ['PRIVATE','DO NOT EXPOSE','updatedBy','privatePlanning','storagePath','sourceVersion','private-admin','notes','private-planning'])assert(!JSON.stringify(doc).includes(privateValue));
  assert.deepEqual(Object.keys(doc).sort(),['id','schemaVersion','yearLevel','englishTitle','chineseTitle','description','topics','lessons','published','approvedForStudents','revision'].sort());
 });
 await t.test('optional learning fields, resources and worked examples require individual selection',async()=>{
  const data=input();data.student.lessons=[selection('lesson-a',{includeLearningIntention:true,includeVocabulary:true,includeSpeaking:true,resourceUrls:['https://example.org/public-worksheet']})];await publish(data);const lesson=(await get('publicUnits/'+source.id)).lessons[0];assert.equal(lesson.learningIntention,'Name two animals.');assert.equal(lesson.links.length,3);assert.equal('workedExamples' in lesson,false);for(const hidden of ['private-planning','approved.png','example-a','An animal diagram'])assert(!JSON.stringify(lesson).includes(hidden));
 });
 await t.test('anonymous, unverified, inactive and unlisted callers cannot publish or unpublish',async()=>{
  for(const auth of [null,stranger,{...teacher,token:{email_verified:false}},{uid:'synthetic-inactive',token:{email_verified:true}}]){const code=auth?'permission-denied':'unauthenticated';await rejects(publish(input(),auth),code);await rejects(unpublish(undefined,auth),code);}assert.equal(await get('publicUnits/'+source.id),undefined);
 });
 await t.test('approval is explicit and deleted:false is never publication consent',async()=>{
  await rejects(publish(input({approved:false})),'invalid-argument');await rejects(publish({...input(),approved:undefined}),'invalid-argument');assert.equal((await rest('publicUnits/'+source.id)).status,403);
 });
 await t.test('top-level, student and lesson field allowlists reject private metadata',async()=>{
  await rejects(publish({...input(),updatedBy:'spoof'}),'invalid-argument');const a=input();a.student.notes='private';await rejects(publish(a),'invalid-argument');const b=input();b.student.lessons[0].notes='private';await rejects(publish(b),'invalid-argument');await rejects(unpublish({unitId:source.id,expectedRevision:0,published:false}),'invalid-argument');
 });
 await t.test('missing or deleted original Units cannot be published',async()=>{
  await db.doc('units/'+source.id).delete();await rejects(publish(),'failed-precondition');await db.doc('units/'+source.id).set({...source,deleted:true});await rejects(publish(),'failed-precondition');
 });
 await t.test('source changes and stale publication revisions are rejected',async()=>{
  await rejects(publish(input({sourceVersion:'1:0'})),'aborted');await publish();await rejects(publish(),'aborted');await rejects(unpublish({unitId:source.id,expectedRevision:0}),'aborted');await db.doc('units/'+source.id).update({updatedAt:Timestamp.fromMillis(1700000001000)});await rejects(publish(input({expectedRevision:1})),'aborted');
 });
 await t.test('updating and unpublishing remove old public content without touching the source',async()=>{
  await publish();const next=input({expectedRevision:1});next.student.description='Updated approved description.';assert.equal((await publish(next)).revision,2);assert.equal((await unpublish({unitId:source.id,expectedRevision:2})).revision,3);assert.deepEqual(await get('publicUnits/'+source.id),{id:source.id,schemaVersion:1,revision:3,published:false,approvedForStudents:false});assert.deepEqual(await get('units/'+source.id),source);assert.equal((await rest('publicUnits/'+source.id)).status,403);assert.equal((await publish(input({expectedRevision:3}))).revision,4);
 });
 await t.test('invalid IDs, topics, duplicates, ordering, text limits and guessed resource references are rejected',async()=>{
  for(const change of [d=>d.unitId='../bad',d=>d.expectedRevision=-1,d=>d.student.topics=[],d=>d.student.topics=['unknown'],d=>d.student.lessons.reverse(),d=>d.student.lessons.push(selection()),d=>d.student.lessons[0].resourceUrls=['https://example.org/not-in-source'],d=>d.student.lessons[0].workedExampleIds=['missing'],d=>d.student.lessons[0].workedExampleIds=['example-a'],d=>delete d.student.lessons[0].workedExampleIds,d=>d.student.lessons[0].content='x'.repeat(5001)]){const data=input();change(data);await rejects(publish(data),'invalid-argument');}
 });
 await t.test('unsafe resource and worked-example URLs cannot be published even if present in the source',async()=>{
  await db.doc('units/'+source.id).update({'lessons':[{...source.lessons[0],resources:'javascript:alert(1)',workedExamples:[{id:'example-a',url:'http://insecure.example/image.png'}]}]});
  const data=input();data.student.lessons=[selection('lesson-a',{resourceUrls:['javascript:alert(1)']})];await rejects(publish(data),'invalid-argument');data.student.lessons=[selection('lesson-a',{workedExampleIds:['example-a']})];await rejects(publish(data),'invalid-argument');assert.equal(await get('publicUnits/'+source.id),undefined);
 });
 await t.test('concurrent approval requests cannot overwrite one another',async()=>{
  const results=await Promise.allSettled([publish(),publish()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'aborted');
 });
 await t.test('anonymous reads and filtered library queries succeed only for approved published Units',async()=>{
  await publish();assert.equal((await rest('publicUnits/'+source.id)).status,200);
  await db.doc('publicUnits/unapproved').set({schemaVersion:1,published:true,approvedForStudents:false});assert.equal((await rest('publicUnits/unapproved')).status,403);
  assert.equal((await rest('publicUnits')).status,403);
  const query={structuredQuery:{from:[{collectionId:'publicUnits'}],where:{compositeFilter:{op:'AND',filters:[...['published','approvedForStudents'].map(fieldPath=>({fieldFilter:{field:{fieldPath},op:'EQUAL',value:{booleanValue:true}}})),{fieldFilter:{field:{fieldPath:'schemaVersion'},op:'EQUAL',value:{integerValue:'1'}}}]}}}};
  assert.equal((await rest(':runQuery',{method:'POST',body:query})).status,200);
 });
 await t.test('client writes to public projections and anonymous private reads remain denied',async()=>{
  await publish();for(const auth of [null,teacher]){assert.equal((await rest('publicUnits/'+source.id,{auth,method:'PATCH',body:{fields:{published:{booleanValue:false}}}})).status,403);assert.equal((await rest('publicUnits/'+source.id,{auth,method:'DELETE'})).status,403);}
  assert.equal((await rest('units/'+source.id)).status,403);assert.equal((await rest('units/'+source.id,{auth:teacher})).status,200);assert.equal((await rest('units/'+source.id,{auth:teacher,method:'PATCH',body:{fields:{englishTitle:{stringValue:'changed'}}}})).status,403);
 });
 await t.test('public access is independent of Learning Journey status',async()=>{
  await publish();await db.doc('learningJourneys/2026_year-4').set({placements:[{unitId:source.id,status:'upcoming'}]});assert.equal((await rest('publicUnits/'+source.id)).status,200);assert.equal((await rest('learningJourneys/2026_year-4')).status,403);
 });
 await t.test('oversized approved projections are rejected before Firestore writes',async()=>{
  const urls=i=>Array.from({length:10},(_,j)=>`https://example.org/${i}/${j}/${'x'.repeat(1900)}`);
  const lessons=Array.from({length:30},(_,i)=>({...source.lessons[1],id:`lesson-${i}`,learningIntention:'文'.repeat(1000),resources:urls(i).join('\n')}));
  await db.doc('units/'+source.id).set({...source,lessons});
  const data=input();data.student.lessons=lessons.map((lesson,i)=>selection(lesson.id,{includeLearningIntention:true,content:'文'.repeat(5000),resourceUrls:urls(i)}));
  await rejects(publish(data),'invalid-argument');assert.equal(await get('publicUnits/'+source.id),undefined);
 });
 await t.test('worked examples are teacher-only: never selectable, never projected, even when present in the source',async()=>{
  await publish();const doc=await get('publicUnits/'+source.id);const json=JSON.stringify(doc);for(const hidden of ['workedExamples','approved.png','example-a','An animal diagram','private-metadata'])assert(!json.includes(hidden),hidden);
  const data=input({expectedRevision:1});data.student.lessons[0].workedExampleIds=['example-a'];await rejects(publish(data),'invalid-argument');assert.equal((await get('publicUnits/'+source.id)).revision,1);
 });
 await t.test('teacher-only lessons (Speaking Assessment) cannot be published; the rest of the Unit can',async()=>{
  await db.doc('units/'+source.id).update({lessons:[source.lessons[0],{...source.lessons[1],title:'Speaking Assessment',teacherOnly:true}]});
  await rejects(publish(),'failed-precondition');assert.equal(await get('publicUnits/'+source.id),undefined);
  const data=input();data.student.lessons=[selection('lesson-a')];assert.equal((await publish(data)).revision,1);
  const json=JSON.stringify(await get('publicUnits/'+source.id));assert(!json.includes('Assessment'));assert(!json.includes('lesson-b'));
 });
 await t.test('cross-year Vocabulary and Speaking references are allowed when they exist and are student-visible',async()=>{
  const data=input();data.student.lessons=[selection('lesson-a',{includeVocabulary:true,includeSpeaking:true})];
  assert.equal((await publish(data)).revision,1);   // Year 4 Unit, Year 2 set and practice
  for(const [path,value] of [['vocabularySets/synthetic-words',{published:false,yearLevel:2}],['vocabularySets/synthetic-words',{published:true,deleted:true}],['vocabularySets/synthetic-words',null],['speakingPractices/synthetic-speaking',{deleted:true}],['speakingPractices/synthetic-speaking',null]]){
   await db.doc('vocabularySets/synthetic-words').set({published:true,yearLevel:2});await db.doc('speakingPractices/synthetic-speaking').set({deleted:false,yearLevelId:'year-2'});
   if(value===null)await db.doc(path).delete();else await db.doc(path).set(value);
   const again=input({expectedRevision:1});again.student.lessons=[selection('lesson-a',{includeVocabulary:true,includeSpeaking:true})];
   await rejects(publish(again),'failed-precondition');assert.equal((await get('publicUnits/'+source.id)).revision,1,path);
  }
  const plain=input({expectedRevision:1});plain.student.lessons=[selection('lesson-a')];assert.equal((await publish(plain)).revision,2,'unlinked lessons do not depend on availability');
 });
 await t.test('Topics v1.1: the 13 canonical IDs are accepted; retired IDs are stored as their replacement; unknown IDs are refused',async()=>{
  let revision=0;const send=async topics=>{const data=input({expectedRevision:revision});data.student.topics=topics;revision=(await publish(data)).revision;return (await get('publicUnits/'+source.id)).topics;};
  assert.deepEqual(await send(['social-interactions','nature','community']),['social-interactions','nature','community']);
  assert.deepEqual(await send(['numbers','colours','people','animals','social-interactions','food-drinks','school','free-time','countries','time-weather','culture','nature','community']).then(t=>t.length),13);
  assert.deepEqual(await send(['greetings']),['social-interactions'],'Greetings is stored as Social Interactions');
  assert.deepEqual(await send(['family','body-parts','food']),['people','food-drinks'],'retired IDs are converted and merged');
  assert.deepEqual(await send(['weather','time-weather']),['time-weather']);
  for(const topics of [['sports'],['australia'],['Greetings'],['nature','unknown']]){const data=input({expectedRevision:revision});data.student.topics=topics;await rejects(publish(data),'invalid-argument');}
 });
 await t.test('publication backend refuses unknown projects',()=>{for(const projectId of ['the-mandarin-room-prod','','other-staging'])assert.throws(()=>createPublicUnitHandlers({db,projectId}),/staging or production/);});
});
