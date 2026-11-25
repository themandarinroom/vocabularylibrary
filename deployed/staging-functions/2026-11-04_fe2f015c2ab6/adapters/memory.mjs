import { EventEmitter } from 'node:events';
import { writablePath } from '../core/config.mjs';
const clone=value=>value===undefined?undefined:structuredClone(value);
export class MemoryDatabase {
 constructor(){this.docs=new Map();this.events=new EventEmitter();this.lock=Promise.resolve();this.stats={reads:0,writes:0,deletes:0,transactions:0};this.failDeleteAfter=null;}
 seed(path,data){this.docs.set(path,clone(data));}
 async get(path){this.stats.reads++;return clone(this.docs.get(path));}
 async query(collection,{field,op='==',value,limit=100}={}){
  const records=[...this.docs].filter(([path,data])=>path.startsWith(`${collection}/`)&&path.split('/').length===collection.split('/').length+1&&(!field||(op==='=='?data[field]===value:data[field]<=value))).slice(0,limit);
  this.stats.reads+=Math.max(1,records.length);return records.map(([path,data])=>({path,data:clone(data)}));
 }
 async transaction(callback){
  let release;const next=new Promise(r=>{release=r;});const previous=this.lock;this.lock=next;await previous;
  const writes=new Map();this.stats.transactions++;
  const tx={get:async path=>{if(writes.has(path))return clone(writes.get(path));this.stats.reads++;return clone(this.docs.get(path));},set:(path,data)=>{if(!writablePath(path))throw Error('Bingo cannot write outside its namespace.');writes.set(path,clone(data));},delete:path=>{if(!writablePath(path))throw Error('Bingo cannot delete outside its namespace.');writes.set(path,undefined);}};
  try{const result=await callback(tx);for(const [path,data]of writes){if(data===undefined){this.docs.delete(path);this.stats.deletes++;}else{this.docs.set(path,clone(data));this.stats.writes++;}}queueMicrotask(()=>{for(const [path]of writes)this.events.emit(path,clone(this.docs.get(path)));});return result;}finally{release();}
 }
 async recursiveDelete(prefix){if(!/^bingoRooms\/[A-Za-z0-9_-]+$/.test(prefix))throw Error('Cleanup namespace rejected.');let count=0;for(const path of [...this.docs.keys()].filter(p=>p===prefix||p.startsWith(prefix+'/'))){if(this.failDeleteAfter!==null&&count>=this.failDeleteAfter){this.failDeleteAfter=null;throw Error('Injected recursive cleanup failure.');}this.docs.delete(path);this.stats.deletes++;count++;}return count;}
}
export class MockTasks {
 constructor(clock){this.clock=clock;this.jobs=new Map();this.seen=new Set();this.failEnqueue=0;this.stats={enqueueCalls:0,created:0,dispatches:0,retries:0};}
 async enqueue(job){this.stats.enqueueCalls++;if(this.failEnqueue>0){this.failEnqueue--;throw Error('Injected enqueue outage.');}if(this.seen.has(job.id))return;this.seen.add(job.id);this.jobs.set(job.id,clone(job));this.stats.created++;}
 async runDue(service,{limit=1000}={}){let count=0;while(count<limit){const job=[...this.jobs.values()].filter(j=>j.runAtMs<=this.clock.now()).sort((a,b)=>a.runAtMs-b.runAtMs)[0];if(!job)break;this.jobs.delete(job.id);this.stats.dispatches++;try{const result=await service.handleTask(job.payload);if(result?.retryAtMs){job.runAtMs=result.retryAtMs;this.jobs.set(job.id,job);this.stats.retries++;}}catch(error){job.runAtMs=this.clock.now()+1000;this.jobs.set(job.id,job);this.stats.retries++;throw error;}count++;}return count;}
}
