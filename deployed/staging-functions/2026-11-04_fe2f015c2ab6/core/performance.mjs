import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { PROJECT } from './config.mjs';
const storage=new AsyncLocalStorage();
const stages=new Set(['request.validation','answer.validation','transaction.queue','transaction.execute','transaction.callback','admission.commit','outbox.prepare','outbox.enqueue','outbox.ack','receipt.read','handler','response.finish','admission.transaction.queue','admission.transaction.execute','admission.transaction.callback']);
const counters=new Set(['transaction.calls','transaction.attempts','transaction.retries','outbox.jobs','outbox.enqueueFailures','admission.committed','admission.duplicate','admission.transaction.calls','admission.transaction.attempts','admission.transaction.retries']);
// Fixed schema: callers cannot add input values, IDs, errors or arbitrary labels.
export function mark(name){const c=storage.getStore();return c&&stages.has(name)?{c,name,at:c.clock()}:null;}
export function end(span){if(!span)return;const elapsed=Math.max(0,span.c.clock()-span.at);const v=span.c.durations[span.name]??={count:0,totalMs:0,maxMs:0};v.count++;v.totalMs+=elapsed;v.maxMs=Math.max(v.maxMs,elapsed);}
export async function measure(name,fn){const span=mark(name);try{return await fn();}finally{end(span);}}
export function committed(){const c=storage.getStore();if(c)c.commitAcknowledgedAtMs=Math.max(0,c.clock()-c.started);}
export function count(name,n=1){const c=storage.getStore();if(c&&counters.has(name)&&Number.isFinite(n))c.counts[name]=(c.counts[name]||0)+n;}
export function createAnswerInstrumentation({project,enabled=false,emit=entry=>console.log(JSON.stringify(entry)),clock=()=>performance.now(),id=()=>randomUUID()}={}){
 if(enabled&&project!==PROJECT)throw Error('Bingo performance instrumentation is staging-only.');
 return async function instrument(req,fn){
  if(!enabled)return fn();
  const context={clock,started:clock(),durations:{},counts:{}};
  let logged=false,status='running';
  const finish=completion=>{if(logged)return;logged=true;const elapsed=Math.max(0,clock()-context.started);context.durations[completion==='http_finish'?'response.finish':completion==='http_close'?'response.close':'handler.return']={count:1,totalMs:elapsed,maxMs:elapsed};
   const round=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,{count:x.count,totalMs:+x.totalMs.toFixed(3),maxMs:+x.maxMs.toFixed(3)}]));
   try{emit({event:'bingo_answer_performance_v1',project:PROJECT,trace:id(),status,completion,durations:round(context.durations),counts:{...context.counts},...(context.commitAcknowledgedAtMs===undefined?{}:{admissionCommitAcknowledgedAtMs:+context.commitAcknowledgedAtMs.toFixed(3)})});}catch{/* Observability must not change game results. */}
  };
  // Express finish means bytes handed to the transport, not received by the client.
  const response=req?.rawRequest?.res;
  const observable=response&&typeof response.once==='function'&&typeof response.removeListener==='function';
  const onFinish=()=>{response.removeListener('close',onClose);finish('http_finish');};
  const onClose=()=>{response.removeListener('finish',onFinish);finish('http_close');};
  if(observable){response.once('finish',onFinish);response.once('close',onClose);}
  return storage.run(context,async()=>{const span=mark('handler');try{const result=await fn();status='success';return result;}catch(error){status='error';throw error;}finally{end(span);if(!observable)finish('handler_return_only');}});
 };
}
