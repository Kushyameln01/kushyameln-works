import {inspectAlignmentPayload,inspectAlignmentGeometry} from './pool-task.mjs';
// This identity fixes the whole feature convention, not just the feature count.
export const LBP_CONVENTION='lbp3x3-ge-nw-n-ne-e-se-s-sw-w-white-alpha-77-150-29-zero-border-display-v1';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(v);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const identity=r=>Object.freeze({id:r.id,inputRevision:r.inputRevision,sceneId:r.sceneId,conventionId:LBP_CONVENTION,sha256:r.sha256,width:r.width,height:r.height,timestamp:r.timestamp});
export async function createAlignmentSession({options,revision,reserve,release,check,submit}){
 if(!options||(options.reference==='first-frame'&&!id(options.referenceId))||!id(options.sceneId)||Object.keys(options).some(k=>!['reference','referenceId','sceneId','roi','searchRadius','policy'].includes(k)))throw TypeError('ALIGNMENT_OPTIONS');
 const config={...options,roi:{...options.roi},policy:{...options.policy}};
 let reference=null,referenceBytes=0,outputBytes=0;
 async function accept(r){
  const n=r?.width*r?.height;
  if(!id(r?.id)||!id(r?.sceneId)||r.sceneId!==config.sceneId||r.conventionId!==LBP_CONVENTION||!Number.isSafeInteger(r.inputRevision)||r.inputRevision<0||!Number.isSafeInteger(r.width)||!Number.isSafeInteger(r.height)||r.width<1||r.height<1||n>1048576||!(r.codes instanceof Uint8Array)||!(r.codes.buffer instanceof ArrayBuffer)||r.codes.buffer.resizable||r.codes.byteLength!==n||!(/^[a-f0-9]{64}$/.test(r.sha256))||(r.timestamp!==null&&!Number.isFinite(r.timestamp)))throw TypeError('ALIGNMENT_REFERENCE');
  const meta=identity(r);reserve(n);referenceBytes=n;
  try{const codes=new Uint8Array(r.codes),actual=await hash(codes);check();if(actual!==meta.sha256)throw Error('REFERENCE_HASH');reference={...meta,codes};}
  catch(e){release(referenceBytes);referenceBytes=0;throw e;}
 }
 function releaseOutput(){if(outputBytes){release(outputBytes);outputBytes=0;}}
 function dispose(){releaseOutput();if(referenceBytes)release(referenceBytes);referenceBytes=0;reference=null;}
 try{if(config.reference!=='first-frame')await accept(config.reference);}catch(e){dispose();throw e;}
 function rejected(frame,reason){return {...frame,aligned:null,alignment:{applied:false,reason,reference:reference?identity(reference):null,decision:null},unapplied:frame.unapplied};}
 async function apply(frame){
  check();releaseOutput();
  if(frame.sceneId!==config.sceneId)return rejected(frame,'scene-mismatch');
  if(!reference){
   if(frame.sequence!==0)return rejected(frame,'reference-unavailable');
   reserve(frame.codes.byteLength);referenceBytes=frame.codes.byteLength;
   try{
    const codes=new Uint8Array(frame.codes),sha256=await hash(codes);check();
    reference={id:config.referenceId,inputRevision:revision,sceneId:config.sceneId,conventionId:LBP_CONVENTION,sha256,width:frame.width,height:frame.height,timestamp:frame.timestamp,codes};
    // Validate the caller's explicit ROI/policy even if there is only one frame.
    inspectAlignmentGeometry({width:frame.width,height:frame.height,roi:config.roi,searchRadius:config.searchRadius,policy:config.policy});
    return rejected(frame,'reference-frame');
   }catch(e){dispose();throw e;}
  }
  if(frame.width!==reference.width||frame.height!==reference.height)return rejected(frame,'dimension-mismatch');
  if(reference.timestamp!==null&&frame.timestamp!==null&&reference.timestamp>frame.timestamp)return rejected(frame,'reference-after-current');
  const n=frame.width*frame.height,needsPack=frame.stride!==frame.width*4,temporary=needsPack?n*4:0;
  reserve(n*5+temporary);outputBytes=n*5+temporary;
  try{
   let data=frame.data;
   if(needsPack){data=new Uint8Array(n*4);for(let y=0;y<frame.height;y++)data.set(frame.data.subarray(y*frame.stride,y*frame.stride+frame.width*4),y*frame.width*4);}
   const payload=inspectAlignmentPayload({referenceCodes:reference.codes,currentCodes:frame.codes,data,width:frame.width,height:frame.height,stride:frame.width*4,roi:config.roi,searchRadius:config.searchRadius,policy:config.policy});
   const job=await submit(payload);check();
   if(temporary){release(temporary);outputBytes-=temporary;}
   const {decision,derivative}=job.result;
   if(!decision.applied)releaseOutput();
   return {...frame,aligned:derivative,alignment:{applied:decision.applied,reason:decision.reason,reference:identity(reference),decision,metrics:job.metrics},unapplied:decision.applied?frame.unapplied.filter(x=>x!=='alignment'):frame.unapplied};
  }catch(e){releaseOutput();throw e;}
 }
 return {apply,releaseOutput,dispose};
}
