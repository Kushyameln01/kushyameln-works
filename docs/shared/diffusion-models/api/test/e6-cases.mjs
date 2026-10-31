import {createDiffusionModels,attachDiffusionPort,PROTOCOL_VERSION} from '../index.mjs';
const assert=(v,m)=>{if(!v)throw Error(m);};
export async function runE6API(){
 const api=createDiffusionModels(),cases=[];let seq=0;
 const ask=(op,input={})=>api.request({protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'e6-'+(++seq),inputRevision:1,op,input});
 const raw=()=>({dtype:'float32',layout:'NCTHW',meaning:'raw-posterior-mean',shape:[1,16,1,2,2],modelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',data:Float32Array.from({length:64},(_,i)=>(i-32)/16)});
 try{
  const cap=await ask('capabilities');assert(cap.result.rawMeanProfiles?.some(p=>p.id==='wan21-raw-f32-1x16x16'&&p.elements===64),'Missing explicit F1 mean profile');assert(cap.result.rawMeanProfiles.some(p=>p.elements===128)&&cap.result.maxTensorElements===1048576&&!cap.result.modelInference,'Legacy capacity/readiness changed');
  assert(cap.result.rawMeanProfiles.some(p=>p.id==='wan21-raw-f32-1x16x32'&&p.elements===128&&p.shape.join()==='1,16,1,2,4'),'Missing explicit rect profile');
  const tensor=raw(),valid=await ask('validateRawLatent',{tensor});assert(valid.result?.profileId==='wan21-raw-f32-1x16x16'&&valid.result.byteLength===256,'F1 raw boundary not accepted');
  const norm=await ask('normalizeRawMean',{tensor});assert(norm.status==='ok'&&norm.result.tensor.data.length===64&&norm.result.tensor.shape.join()==='1,16,1,2,2','F1 normalization padded or failed');assert(norm.result.evidence.profileId==='wan21-raw-f32-1x16x16','Wrong profile evidence');
  const restored=await ask('restoreRawMean',{tensor:norm.result.tensor});assert(restored.result?.tensor.meaning==='raw-posterior-mean','F1 restore meaning');for(let i=0;i<64;i++)assert(Math.abs(restored.result.tensor.data[i]-tensor.data[i])<=2e-6,'F1 API roundtrip value');assert(tensor.data.length===64&&tensor.data[0]===-2,'Caller mutated');cases.push({name:'strict64 profile direct validation and realHike normalize/restore without padding',passed:true,evidence:norm.result.evidence});
  const wrongShape={...raw(),shape:[1,16,2,1,2]};assert((await ask('validateRawLatent',{tensor:wrongShape})).error?.code==='INVALID_TENSOR','Same64 incompatible shape accepted');
  assert((await ask('normalizeRawMean',{tensor:{...raw(),profileId:'wan21-raw-f32-5x16x16'}})).error?.code==='INVALID_TENSOR','Wrong F1 profileId accepted');
  assert((await ask('normalizeRawMean',{tensor:{...raw(),meaning:'wan21-raw-generated-sample:v1'}})).error?.code==='INVALID_TENSOR','Generated sample relabeled mean');cases.push({name:'wrong axes/profile/generated meaning rejected independently of element count',passed:true});
  const c=new MessageChannel(),detach=attachDiffusionPort(c.port1,api);c.port2.start();try{const q={protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'e6-port',inputRevision:1,op:'normalizeRawMean',input:{tensor:raw()}};const promise=new Promise(resolve=>c.port2.addEventListener('message',e=>resolve(e.data),{once:true}));c.port2.postMessage(q);const r=await promise;assert(r.jobId===q.jobId&&r.result?.tensor.data.length===64,'Port F1 reply');assert(q.input.tensor.data.byteLength===256,'Port input detached');cases.push({name:'MessagePort64 profile owned binary boundary',passed:true});}finally{detach();c.port2.close();}
  const rect={...raw(),shape:[1,16,1,2,4],profileId:'wan21-raw-f32-1x16x32',data:Float32Array.from({length:128},(_,i)=>(i-64)/32)};
  const rectValid=await ask('validateRawLatent',{tensor:rect});assert(rectValid.result?.profileId==='wan21-raw-f32-1x16x32','Rect strict profile boundary');
  const rectNorm=await ask('normalizeRawMean',{tensor:rect});assert(rectNorm.result?.tensor.data.length===128&&rectNorm.result.evidence.profileId==='wan21-raw-f32-1x16x32','Rect routed to a different128shape');
  const rectRestored=await ask('restoreRawMean',{tensor:rectNorm.result.tensor});assert(rectRestored.result?.tensor.shape.join()==='1,16,1,2,4','Rect inverse axes changed');for(let i=0;i<128;i++)assert(Math.abs(rectRestored.result.tensor.data[i]-rect.data[i])<=2e-6,'Rect inverse value');
  assert((await ask('validateRawLatent',{tensor:{...rect,shape:[1,16,2,1,4]}})).error?.code==='INVALID_TENSOR','Arbitrary same128shape accepted');
  assert((await ask('validateRawLatent',{tensor:{...rect,profileId:'wan21-raw-f32-5x16x16'}})).error?.code==='INVALID_TENSOR','Rect mismatched explicit profile accepted');
  cases.push({name:'rect128shape has dedicated profile/ABI and samecount does not authorize different axes',passed:true,evidence:rectNorm.result.evidence});
  for(const op of ['predict','sample'])assert((await ask(op)).error?.code==='NOT_READY','Model inference enabled by mean profile');
  return {passed:true,nativeBuildId:cap.result.buildId,scope:'Diffusion strict64/128/rect mean boundary fixtures and actualHike only; no VAE graph or joint producer rerun',cases};
 }finally{api.dispose();}
}
