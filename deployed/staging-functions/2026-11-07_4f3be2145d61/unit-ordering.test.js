const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createOrderingHandler,validateOrder}=require('./unit-ordering');
const input={yearLevel:2,unitIds:['b','a','c'],expectedRevision:0};
function fixture({revision=0,active=true,ids=['a','b','c']}={}){
 const writes=[];
 const tx={get:async ref=>ref.path==='authorizedTeachers/admin'?{exists:true,data:()=>({active})}:ref.path==='unitLibraryOrder/2'?{exists:revision>0,data:()=>({revision})}:{docs:ids.map(id=>({id,data:()=>({})}))},set:(ref,data)=>writes.push({path:ref.path,data})};
 const db={doc:path=>({path}),collection:()=>({where:()=>({query:true})}),runTransaction:fn=>fn(tx)};
 return {writes,run:createOrderingHandler(db,()=> 'timestamp')};
}
const request=data=>({auth:{uid:'admin',token:{email_verified:true}},data});
test('ordering writes only metadata, preserving exact IDs',async()=>{const f=fixture();assert.deepEqual(await f.run(request(input)),{revision:1});assert.deepEqual(f.writes,[{path:'unitLibraryOrder/2',data:{yearLevel:2,unitIds:['b','a','c'],revision:1,updatedAt:'timestamp',updatedBy:'admin'}}]);});
test('stale revision rejects without writes',async()=>{const f=fixture({revision:2});await assert.rejects(f.run(request(input)),{code:'aborted'});assert.equal(f.writes.length,0);});
test('cross-year, deleted or newly created units reject without writes',async()=>{for(const ids of [['a','b'],['a','b','c','d'],['a','b','other-year']]){const f=fixture({ids});await assert.rejects(f.run(request(input)),{code:'failed-precondition'});assert.equal(f.writes.length,0);}});
test('non-admin and unverified callers cannot save',async()=>{for(const req of [{data:input},{...request(input),auth:{uid:'admin',token:{email_verified:false}}}])await assert.rejects(fixture().run(req),{code:'permission-denied'});await assert.rejects(fixture({active:false}).run(request(input)),{code:'permission-denied'});});
test('malformed orders rejected',()=>{for(const data of [{...input,unitIds:['a','a']},{...input,yearLevel:7},{...input,expectedRevision:-1},{...input,content:'overwrite'}])assert.throws(()=>validateOrder(data),{code:'invalid-argument'});});
