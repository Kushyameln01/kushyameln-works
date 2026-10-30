import {createDiffusionModels,attachDiffusionPort,PROTOCOL_VERSION} from '../index.mjs';
const assert=(x,m)=>{if(!x)throw Error(m);};
export async function runL1APICases(){
 const api=createDiffusionModels(),cases=[];let seq=0;
 const ask=(op,input={},revision=1)=>api.request({protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'l1-'+(++seq),inputRevision:revision,op,input});
 const data=()=>{const weight=new Float32Array(81920),x=new Float32Array(5120),bias=new Float32Array(16);weight[0]=2;x[0]=3;bias[0]=.5;return {weight,x,bias};};
 try{
  const cap=await ask('capabilities');assert(cap.result?.linearProjectionF32===true,'Missing F32 runtime-weight API capability');assert(cap.result.modelInference===false&&cap.result.loraApplied===false&&cap.result.maxTensorElements===1048576,'Partial scope/cap changed');
  const d=data(),p=ask('linearProjectionF32',d);d.weight.fill(777);d.bias.fill(777);d.x.fill(777);
  const r=await p;assert(r.status==='ok'&&r.result.output[0]===6.5,'Direct F32 feed result/input snapshot failed');assert(d.weight[0]===777&&d.weight.byteLength===327680,'Caller input detached');cases.push({name:'direct F32 API, caller snapshot and explicit partial capability',passed:true,evidence:r.result.evidence});
  const invalid=await ask('linearProjectionF32',{...data(),weight:new Float32Array(1)});assert(invalid.error?.code==='INVALID_TENSOR','Wrong F32 weight shape accepted');
  const nan=data();nan.bias[0]=NaN;assert((await ask('linearProjectionF32',nan)).error?.code==='INVALID_TENSOR','Nonfinite F32 bias accepted');const backing=new Float32Array(81921);assert((await ask('linearProjectionF32',{...data(),weight:backing.subarray(0,81920)})).error?.code==='INVALID_TENSOR','Noncompact backing accepted');
  const detached=data();structuredClone(detached.weight,{transfer:[detached.weight.buffer]});assert((await ask('linearProjectionF32',detached)).error?.code==='INVALID_TENSOR','Detached buffer accepted');
  cases.push({name:'shape/nonfinite/noncompact/detached rejection before dispatch',passed:true});
  const channel=new MessageChannel(),detach=attachDiffusionPort(channel.port1,api);channel.port2.start();
  try{const q={protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'port-l1',inputRevision:1,op:'linearProjectionF32',input:data()};const portReply=new Promise(resolve=>channel.port2.addEventListener('message',e=>resolve(e.data),{once:true}));channel.port2.postMessage(q);const reply=await portReply;assert(reply.jobId===q.jobId&&reply.result?.output[0]===6.5,'Port F32 output failed');assert(q.input.weight.byteLength===327680,'Port caller input detached');cases.push({name:'MessagePort explicit F32 feed and retained caller input',passed:true});}finally{detach();channel.port2.close();}
  const q={protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'cancel-l1',inputRevision:2,op:'linearProjectionF32',input:data()};
  const pending=api.request(q),cancelled=api.cancel(q);assert(cancelled.result?.workerTerminated===true,'Owned worker not terminated');assert((await pending).error?.code==='CANCELLED','Cancelled work did not terminate');
  assert((await ask('linearProjectionF32',data(),3)).result?.output[0]===6.5,'Cancelled Worker was not safely recreated');
  for(const op of ['predict','sample'])assert((await ask(op,{},3)).error?.code==='NOT_READY','Model inference incorrectly enabled');
  cases.push({name:'owned Worker cancellation, subsequent rerun, NOT_READY preserved',passed:true});
  return {passed:true,nativeBuildId:cap.result.buildId,scope:'actual Worker/MessagePort Hike-ORT-Hike F32 partial feed, not LoRA matrix multiplication or Bernini generation',cases};
 }finally{api.dispose();}
}
