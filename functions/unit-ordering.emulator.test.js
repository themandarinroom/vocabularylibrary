const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createOrderingHandler}=require('./unit-ordering');
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(host||''))throw Error('Local emulator required; never run against cloud.');
test('real transactions reject concurrent stale orders and preserve content',async()=>{
 const app=initializeApp({projectId:'demo-ordering-transactions'},'ordering-tests'),db=getFirestore(app);
 try {
  await fetch(`http://${host}/emulator/v1/projects/demo-ordering-transactions/databases/(default)/documents`,{method:'DELETE'});
  await db.doc('authorizedTeachers/admin').set({active:true});
  const originals={};
  for(let year=0;year<7;year++)for(const suffix of ['a','b','c']){const id=`unit-${year}-${suffix}`,value={id,yearLevel:year,englishTitle:id,lessons:[{id:'stable-lesson',notes:'unchanged',vocabularySetId:'stable-vocab'}]};originals[id]=value;await db.doc(`units/${id}`).set(value);}
  await db.doc('learningJourneys/test').set({placements:['unchanged'],status:'current'});
  const save=createOrderingHandler(db,()=>FieldValue.serverTimestamp());
  for(let year=0;year<7;year++){
   const request={auth:{uid:'admin',token:{email_verified:true}},data:{yearLevel:year,unitIds:['c','a','b'].map(s=>`unit-${year}-${s}`),expectedRevision:0}};
   const results=await Promise.allSettled([save(request),save({...request,data:{...request.data,unitIds:[...request.data.unitIds].reverse()}})]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'aborted');
   const saved=(await db.doc(`unitLibraryOrder/${year}`).get()).data();assert.equal(saved.revision,1);assert.deepEqual(saved.unitIds,results[0].status==='fulfilled'?request.data.unitIds:[...request.data.unitIds].reverse());
  }
  for(const [id,value] of Object.entries(originals))assert.deepEqual((await db.doc(`units/${id}`).get()).data(),value);
  assert.deepEqual((await db.doc('learningJourneys/test').get()).data(),{placements:['unchanged'],status:'current'});
 }finally{await deleteApp(app);}
});
