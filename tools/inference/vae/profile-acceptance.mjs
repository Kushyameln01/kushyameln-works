import {createInferenceAPI,encodeTensor,decodeTensor} from '/shared/inference/api.mjs';

async function bundle(){
 const selected=[...document.querySelector('#bundle').files],files=new Map(selected.map(f=>[f.name,f]));
 const manifest=JSON.parse(await files.get('manifest.json').text());return{manifest,files};
}
async function f32(name){return new Float32Array(await(await fetch('/references/'+name)).arrayBuffer());}
function compare(a,b,g){
 let maxAbs=0,squared=0,passed=a.length===b.length;
 for(let i=0;i<b.length;i++){const e=Math.abs(a[i]-b[i]);maxAbs=Math.max(maxAbs,e);squared+=e*e;if(!Number.isFinite(a[i])||e>g.atol+g.rtol*Math.abs(b[i]))passed=false;}
 return{passed:passed&&maxAbs<=g.maxAbs,count:b.length,maxAbs,rmse:Math.sqrt(squared/b.length)};
}
export async function runApiProbe(){
 const plan=await(await fetch('/plan.json')).json(),config=await bundle();
 const input={dtype:'float32',layout:'NCTHW',shape:plan.videoShape,meaning:'rgb-unit',data:await f32('png-unit.f32'),
  context:{schemaVersion:1,contextId:'v1-still-0',inputId:'existing-diagnostic-png',inputSha256:plan.input.sha256,
   slotId:'diagnostic-still',sourceFrameIndices:[0],sourceFrameTimesSeconds:[0]}};
 const original=input.data.slice();let cancelIssued=false,cancelReturned=false,stageSeen=false;
 const states=[];
 const api=createInferenceAPI({onState:state=>{
  states.push({status:state.status,operation:state.operation,phase:state.progress?.phase??null,inputRevision:state.inputRevision});
  if(!cancelIssued&&state.progress?.phase==='running'){
   stageSeen=true;cancelIssued=true;cancelReturned=api.vae.cancel();
  }
 }});
 try{
  api.vae.configure(config);
  const running=api.vae.encode(input);
  let busyRejected=false;
  try{await api.vae.encode(input);}catch(error){busyRejected=/busy/.test(String(error));}
  let cancelled=false;
  try{await running;}catch(error){cancelled=/cancelled/.test(String(error));}
  if(!busyRejected||!cancelled||!stageSeen||!cancelReturned)throw Error('Real API busy/cancellation failed');
  const recovered=await api.vae.encode(input),numeric=compare(recovered.tensor.data,await f32('png-mean.f32'),plan.comparisonGate);
  const inputPreserved=input.data.every((v,i)=>Object.is(v,original[i]));
  const serialized=await encodeTensor(recovered.tensor),readback=await decodeTensor(serialized);
  const readbackExact=readback.data.every((v,i)=>Object.is(v,recovered.tensor.data[i]))&&JSON.stringify(readback.context)===JSON.stringify(input.context);
  if(!numeric.passed||!inputPreserved||!readbackExact||!recovered.evidence.hikeContributed||recovered.evidence.hikeCalls!==1)throw Error('Real API recovery/save/metadata failed');
  api.dispose();let disposedRejected=false;
  try{await api.vae.encode(input);}catch(error){disposedRejected=/disposed/.test(String(error));}
  if(!disposedRejected)throw Error('Disposed API accepted encode');
  const url=URL.createObjectURL(new Blob([serialized],{type:'application/octet-stream'})),a=document.createElement('a');
  a.href=url;a.download='api-recovery.wktensor';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  return{passed:true,busyRejected,cancelled,cancelAtActualRunProgress:stageSeen,cancelReturned,inputPreserved,readbackExact,
   disposedRejected,numeric,evidence:recovered.evidence,context:readback.context,states};
 }finally{api.dispose();}
}
export async function runSessionProbe({baseline=false}={}){
 const {manifest,files}=await bundle(),plan=await(await fetch('/plan.json')).json();
 const gate=baseline?manifest.comparisonGate:plan.comparisonGate;
 if(!gate)throw Error('Predeclared numeric gate missing');
 const worker=new Worker('/harness/profile-probe.mjs',{type:'module'});
 return new Promise((resolve,reject)=>{
  worker.onmessage=({data})=>{worker.terminate();data.passed?resolve(data):reject(Error(JSON.stringify(data)));};
  worker.onerror=event=>{worker.terminate();reject(Error(event.message));};
  worker.postMessage({manifest,files,gate});
 });
}
