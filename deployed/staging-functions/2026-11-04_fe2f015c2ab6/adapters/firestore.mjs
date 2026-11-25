import { mark, end, count } from '../core/performance.mjs';
import { requireProject, writablePath } from '../core/config.mjs';
export class FirestoreDatabase {
 constructor(db,project){requireProject(project);this.db=db;this.pending=Promise.resolve();}
 async get(path){const doc=await this.db.doc(path).get();return doc.exists?doc.data():undefined;}
 async query(collection,{field,op='==',value,limit=100}={}){let query=this.db.collection(collection);if(field)query=query.where(field,op,value);const result=await query.limit(limit).get();return result.docs.map(d=>({path:d.ref.path,data:d.data()}));}
 async transaction(callback,{performanceKind}={}){
 const prefix=performanceKind==='admission'?'admission.transaction':'transaction';
 count(prefix+'.calls');const queued=mark(prefix+'.queue');
 // Avoid a retry storm from concurrent requests in one warm instance. Firestore
 // transactions still provide cross-instance authority; this is only local backpressure.
 let release;const next=new Promise(resolve=>{release=resolve;});const previous=this.pending;this.pending=next;await previous;end(queued);const execution=mark(prefix+'.execute');let attempts=0;
 try{return await this.db.runTransaction(async native=>{attempts++;count(prefix+'.attempts');if(attempts>1)count(prefix+'.retries');const callbackSpan=mark(prefix+'.callback');try{const writes=new Map();const tx={get:async path=>{if(writes.has(path))return writes.get(path);const snapshot=await native.get(this.db.doc(path));return snapshot.exists?snapshot.data():undefined;},set:(path,data)=>{if(!writablePath(path))throw Error('Bingo write namespace rejected.');writes.set(path,data);},delete:path=>{if(!writablePath(path))throw Error('Bingo delete namespace rejected.');writes.set(path,undefined);}};const result=await callback(tx);for(const [path,data]of writes){if(data===undefined)native.delete(this.db.doc(path));else native.set(this.db.doc(path),data);}return result;}finally{end(callbackSpan);}},{maxAttempts:20});}finally{end(execution);release();}}
 async recursiveDelete(prefix){if(!/^bingoRooms\/[A-Za-z0-9_-]+$/.test(prefix))throw Error('Bingo cleanup namespace rejected.');await this.db.recursiveDelete(this.db.doc(prefix));}
}
