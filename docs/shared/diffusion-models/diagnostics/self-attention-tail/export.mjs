// Persistence replay only; accepted numerical/resource receipts remain immutable.
import {createSelfAttentionTail} from '../../ort-bridge/self-attention-tail/stage.mjs';
import {sha,demand,executedSources} from './common.mjs';
const names=['o','gateProjection','gate','gated','residual'];
const shapes={o:[2,5120],gateProjection:[5120],gate:[5120],gated:[2,5120],residual:[2,5120]};
export async function exportAcceptedTail(file,payload){
 let owner=null;
 try{
  owner=await createSelfAttentionTail({file,side:payload.side,trustedInputs:payload.trustedInputs});
  const source=owner.describe(),inputs={attention:Float32Array.from(payload.actualAttentionArtifact.attention),patchHidden:Float32Array.from(payload.fullPrefixArtifact.arrays.patchHidden),timeAct1:Float32Array.from(payload.fullPrefixArtifact.arrays.timeAct1)};
  const result=await owner.run(inputs),arrayIdentities={};
  for(const name of names){
   const value=result[name],actualSHA256=await sha(value),accepted=payload.acceptedOutputIdentities[name];
   demand(value instanceof Float32Array&&value.length===accepted.elements&&value.every(Number.isFinite)&&actualSHA256===accepted.sha256,'Replay output bits differ from accepted tail: '+name);
   arrayIdentities[name]={shape:shapes[name],elements:value.length,bytes:value.byteLength,sha256:actualSHA256};
  }
  const actualExecutedSourceSHA256=executedSources(payload);
  await owner.dispose();demand(owner.stats().disposed&&!owner.stats().cleanupPending&&owner.stats().activeORTSessions===0,'Replay native owner cleanup required');owner=null;
  const artifact={schemaVersion:'bernini-self-attention-tail-saved-outputs/0.1',purpose:'accepted output bit persistence replay; not new numerical acceptance or resource measurement',side:payload.side,blockIndex:0,scheduleIndex:payload.side==='HIGH'?1:3,tokens:2,acceptedTailReceiptSHA256:payload.acceptedTailReceiptSHA256,source:{currentBuild:payload.currentBuild,actualExecutedSourceSHA256,exportSourceSHA256:payload.exportSourceSHA256,reusedAdmissionSourceSHA256:payload.reusedAdmissionSourceSHA256,originalModel:source.original},inputBindings:payload.trustedInputs,inputs:Object.fromEntries(Object.entries(inputs).map(([key,value])=>[key,Array.from(value)])),arrays:Object.fromEntries(names.map(name=>[name,Array.from(result[name])])),arrayIdentities,evidence:result.evidence};
  const privateArtifactText=JSON.stringify(artifact)+'\n';
  return {schemaVersion:'bernini-self-attention-tail-output-export/0.1',purpose:artifact.purpose,passed:true,side:payload.side,blockIndex:0,scheduleIndex:artifact.scheduleIndex,tokens:2,acceptedTailReceiptSHA256:payload.acceptedTailReceiptSHA256,acceptedOutputBitMatch:true,arrayIdentities,inputBindings:payload.trustedInputs,actualExecutedSourceSHA256,currentBuild:payload.currentBuild,privateArtifactText,privateArtifactSHA256:await sha(new TextEncoder().encode(privateArtifactText)),privateArtifactUTF8Bytes:new TextEncoder().encode(privateArtifactText).byteLength,outputF32Bytes:names.reduce((n,name)=>n+result[name].byteLength,0),nativeOwnerDisposed:true,numericalAcceptanceRerun:false,resourceBudgetMeasured:false,resourceObserverUsed:false,nativeMemoryMeasurementPerformed:false,privatePayloadPublished:false,load:'NOT_READY',predict:'NOT_READY',sample:'NOT_READY'};
 }finally{await owner?.dispose();}
}
