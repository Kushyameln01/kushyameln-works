// Real-browser integration checks. Caller supplies selected local assets, no model URLs.
import {runVae} from '../../../docs/shared/inference/vae.mjs';
function compare(actual,expected,{atol,rtol,maxAbs}){
 let worst=0,squared=0;let passed=actual.length===expected.length;
 for(let i=0;i<expected.length;i++){const error=Math.abs(actual[i]-expected[i]);worst=Math.max(worst,error);squared+=error*error;if(!Number.isFinite(actual[i])||error>atol+rtol*Math.abs(expected[i]))passed=false;}
 return {passed:passed&&worst<=maxAbs,maxAbs:worst,rmse:Math.sqrt(squared/expected.length),count:actual.length};
}
export async function checkVaeProfile({manifest,files,ort,hike,references}){
 const cases=[];const gate=manifest.comparisonGate;
 for(const operation of ['encode','decode']){
  const ref=references[operation];const shape=manifest.profile[operation==='encode'?'videoShape':'latentShape'];
  const original=new Float32Array(ref.input);
  const result=await runVae({operation,manifest,files,ort,hike,tensor:{dtype:'float32',layout:'NCTHW',shape,data:ref.input,meaning:operation==='encode'?'raw-decoder-rgb':'raw-posterior-mean',modelSha256:manifest.model.sha256}});
  if(result.tensor.modelSha256!==manifest.model.sha256)throw Error('VAE output model provenance missing');
  const numeric=compare(result.tensor.data,ref.output,gate);
  const inputPreserved=original.every((v,i)=>Object.is(v,ref.input[i]));
  cases.push({operation,numeric,inputPreserved,evidence:result.evidence,shape:result.tensor.shape});
  if(!numeric.passed||!inputPreserved)throw Error('Real VAE '+operation+' reference mismatch: '+JSON.stringify(numeric));
 }
 if(references.encodeUnit){
  const ref=references.encodeUnit,input={dtype:'float32',layout:'NCTHW',shape:manifest.profile.videoShape,data:ref.input,meaning:'rgb-unit'};
  const snapshot=new Float32Array(ref.input);const result=await runVae({operation:'encode',tensor:input,manifest,files,ort,hike});
  const numeric=compare(result.tensor.data,ref.output,gate);const inputPreserved=snapshot.every((value,index)=>Object.is(value,ref.input[index]));
  if(!numeric.passed||!inputPreserved||!result.evidence.hikeContributed||result.evidence.hikeCalls!==1)throw Error('Unit-RGB Hike encode reference/contribution mismatch');
  let missingUnitHike=false;try{await runVae({operation:'encode',tensor:input,manifest,files,ort,hike:null});}catch(error){missingUnitHike=/Hike/.test(String(error));}
  if(!missingUnitHike)throw Error('Unit-RGB encode silently bypassed missing Hike');
  cases.push({operation:'encode-unit',numeric,inputPreserved,missingHikeRejected:missingUnitHike,evidence:result.evidence,shape:result.tensor.shape});
 }
 const decodeInput={dtype:'float32',layout:'NCTHW',shape:manifest.profile.latentShape,data:references.decode.input,meaning:'raw-posterior-mean',modelSha256:manifest.model.sha256};
 let missingHike=false;try{await runVae({operation:'decode',tensor:decodeInput,manifest,files,ort,hike:null});}catch(error){missingHike=/Hike/.test(String(error));}
 if(!missingHike)throw Error('Missing Hike did not fail');
 const changed=structuredClone(manifest);changed.assets.conv2Weight.sha256='0'.repeat(64);
 let corruptRejected=false;try{await runVae({operation:'decode',tensor:decodeInput,manifest:changed,files,ort,hike});}catch(error){corruptRejected=/hash/.test(String(error));}
 if(!corruptRejected)throw Error('Corrupted weight manifest did not fail');
 return {passed:true,cases,missingHikeRejected:missingHike,corruptedWeightRejected:corruptRejected,scope:'Product SDK raw FP32 fixed-profile real Hike + ORT WASM; not original BF16 workflow equivalence'};
}
