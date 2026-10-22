import {KNOWLEDGE_KERNEL} from './registry.mjs';
export const MAX_RECORDS=65536,MAX_INPUT_BYTES=1048576,MAX_OUTPUT_BYTES=2097152;
const I32=2147483647;
const integer=(v,max=I32)=>Number.isInteger(v)&&v>=0&&v<=max;
export const compareRecord=(a,b)=>a[1]-b[1]||a[0]-b[0]||a[2]-b[2];
export function validateStep(p){
 if(!p||!Array.isArray(p.records)||p.records.length>MAX_RECORDS||!Number.isSafeInteger(p.cursor)||p.cursor<0||typeof p.final!=='boolean')throw TypeError('Invalid step shape');
 if(!Number.isSafeInteger(p.cursor+p.records.length))throw RangeError('Cursor overflow');
 const cap=p.outputCapacity??MAX_RECORDS;if(!Number.isInteger(cap)||cap<1||cap>MAX_RECORDS)throw RangeError('Output capacity');
 let previous=null,count=0;
 if(p.state!==null&&p.state!==undefined){const s=p.state;if(![s.termId,s.docId,s.fieldId].every(v=>integer(v))||!integer(s.count)||s.count===0||s.count>p.cursor)throw TypeError('Invalid continuation state');previous=[s.termId,s.docId,s.fieldId];count=s.count;}
 for(const record of p.records){if(!Array.isArray(record)||record.length!==3||!record.every(v=>integer(v)))throw TypeError('Invalid token record');const order=previous?compareRecord(previous,record):-1;if(order>0)throw RangeError('Unsorted token records');count=order===0?count+1:1;if(count>I32)throw RangeError('Posting count overflow');previous=record;}
 return {...p,state:p.state??null,outputCapacity:cap};
}
export async function prepareKnowledgeKernel({signal,fetchImpl=fetch,onCompile=()=>{},onResponse=()=>{}}={}){
 const response=await fetchImpl(KNOWLEDGE_KERNEL.url,{signal});if(!response.ok)throw Error('Knowledge WASM HTTP '+response.status);onResponse(response.headers.get('content-type'));
 const bytes=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==KNOWLEDGE_KERNEL.sha256)throw Error('Knowledge WASM hash mismatch');if(signal?.aborted)throw Error('Knowledge WASM preparation aborted');
 onCompile();return WebAssembly.compile(bytes);
}
export function instantiateKnowledgeKernel(module){
 if(!(module instanceof WebAssembly.Module))throw TypeError('Expected compiled WASM');
 if(WebAssembly.Module.imports(module).length)throw Error('Unexpected WASM imports');
 let instance=new WebAssembly.Instance(module,{}),memory=instance.exports.memory;
 if(!(memory instanceof WebAssembly.Memory)||typeof instance.exports.KiStep!=='function')throw Error('Invalid knowledge ABI');
 // Reserve above initial compiler stack/heap, grow once; never expose arena views.
 const start=memory.buffer.byteLength,arenaBytes=(MAX_RECORDS*3+5+MAX_RECORDS*4+4)*4;
 memory.grow(Math.ceil(arenaBytes/65536));let disposed=false;
 const statePtr=start+MAX_RECORDS*12,outputPtr=statePtr+20,metaPtr=outputPtr+MAX_RECORDS*16;
 return {instanceId:crypto.randomUUID(),memory,resourceStats:()=>({arenaBytes,disposed}),step(payload){
  if(disposed)throw Error('Kernel disposed');const p=validateStep(payload),view=new Int32Array(memory.buffer);
  try{
   for(let i=0;i<p.records.length;i++)view.set(p.records[i],start/4+i*3);
   view.set(p.state?[1,p.state.termId,p.state.docId,p.state.fieldId,p.state.count]:[0,0,0,0,0],statePtr/4);
   const status=instance.exports.KiStep(start,p.records.length,statePtr,p.final?1:0,outputPtr,p.outputCapacity,metaPtr);
   if(status!==0)throw Error('Knowledge WASM rejected input: '+status);
   const [consumed,emitted,done,outputFull]=view.slice(metaPtr/4,metaPtr/4+4);
   if(consumed<0||consumed>p.records.length||emitted<0||emitted>p.outputCapacity||![0,1].includes(done)||![0,1].includes(outputFull))throw Error('Invalid WASM metadata');
   const s=view.slice(statePtr/4,statePtr/4+5);const state=s[0]===1?{termId:s[1],docId:s[2],fieldId:s[3],count:s[4]}:null;
   // Copy each result directly into an owned JS tuple; no per-posting temporary view.
   const postings=[];for(let i=0;i<emitted;i++){const at=outputPtr/4+i*4;postings.push([view[at],view[at+1],view[at+2],view[at+3]]);}
   return {consumed,nextCursor:p.cursor+consumed,state,postings,done:done===1,outputFull:outputFull===1};
  }finally{view.fill(0,start/4,(start+arenaBytes)/4);}
 },dispose(){disposed=true;instance=null;memory=null;this.memory=null;}};
}
