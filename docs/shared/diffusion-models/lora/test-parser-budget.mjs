import assert from 'node:assert/strict';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';

if(!isMainThread){
 const {inspectSafetensors}=await import('../api/safetensors.mjs');
 const shape=Array(200000).fill(Number.MAX_SAFE_INTEGER);
 if(workerData.zero)shape.push(0);
 const header=new TextEncoder().encode(JSON.stringify({x:{dtype:'F32',shape,data_offsets:[0,workerData.zero?0:4]}}));
 const prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,BigInt(header.length),true);
 try{
  const result=await inspectSafetensors(new Blob([prefix,header,new Uint8Array(workerData.zero?0:4)]));
  parentPort.postMessage({ok:true,tensorCount:result.tensorCount,bytes:result.payloadBytes});
 }catch(error){parentPort.postMessage({ok:false,code:error.code,message:error.message});}
}else{
 async function bounded(zero){
  const worker=new Worker(new URL(import.meta.url),{workerData:{zero}});
  try{return await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Impossible shape validation exceeded 2 seconds')),2000);
   worker.once('message',value=>{clearTimeout(timer);resolve(value);});
   worker.once('error',error=>{clearTimeout(timer);reject(error);});
  });}finally{await worker.terminate();}
 }
 const invalid=await bounded(false);
 assert.equal(invalid.ok,false);assert.equal(invalid.code,'INVALID_SAFETENSORS');
 const empty=await bounded(true);
 assert.equal(empty.ok,true);assert.equal(empty.tensorCount,1);assert.equal(empty.bytes,0);
 console.log(JSON.stringify({passed:true,cases:2,scope:'Bound impossible dimension products; preserve valid empty tensors with a later zero dimension'}));
}
