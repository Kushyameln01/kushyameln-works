import * as ort from './vendor/ort.wasm.min.mjs';
import {createHike} from './hike.mjs';
import {runVae} from './vae.mjs';
import {loadTextEncoder} from './text-encoder.mjs';
import {tokenizePlainText} from './tokenizer.mjs';
ort.env.wasm.wasmPaths=new URL('./vendor/',import.meta.url).href;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
const HIKE_HASH='9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8';
self.onmessage=async({data:job})=>{
 const identity={buildId:job.buildId,sessionId:job.sessionId,jobId:job.jobId,inputRevision:job.inputRevision};
 const progress=value=>self.postMessage({...identity,type:'progress',progress:value});
 let hike,textModel,result,error;
 try{
  if(job.buildId!=='works-inference-v1')throw Error('Inference build mismatch');
  const response=await fetch(new URL('./kernel/tensor.wasm',import.meta.url));if(!response.ok)throw Error('Hike runtime could not load');
  const bytes=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==HIKE_HASH)throw Error('Hike runtime hash mismatch');
  hike=await createHike(bytes);const files=job.files instanceof Map?job.files:new Map(job.files);
  if(job.module==='vae')result=await runVae({operation:job.operation,tensor:job.input,manifest:job.manifest,files,ort,hike,onProgress:progress});
  else if(job.module==='text_encoder'){
   let tokenIds=job.input.tokenIds,attentionMask=job.input.attentionMask,tokenizerEvidence;
   if(job.input.text!==undefined){
    const descriptor=job.manifest.tokenizer;if(!descriptor)throw Error('Bundle has no tokenizer');
    const file=files.get(descriptor.path??descriptor.file);if(!file)throw Error('Select the original embedded tokenizer file');
    const model=file instanceof Uint8Array?file:new Uint8Array(await file.arrayBuffer());
    tokenizerEvidence=await tokenizePlainText(job.input.text,model);tokenIds=tokenizerEvidence.tokenIds;attentionMask=tokenizerEvidence.attentionMask;
   }
   textModel=await loadTextEncoder({manifest:job.manifest,files,ort,hike,onProgress:progress});
   const output=await textModel.run({tokenIds,attentionMask,onProgress:progress});
   result={tensor:{dtype:'float32',shape:output.shape,layout:'BLC',meaning:'text_hidden_states',data:output.hiddenStates,modelSha256:job.manifest.modelSha256,attentionMask:output.attentionMask},attentionMask:output.attentionMask,evidence:{...output.provenance,hikeStats:hike.stats(),tokenizer:tokenizerEvidence?{sha256:tokenizerEvidence.tokenizerSha256,effectiveTokens:tokenizerEvidence.effectiveTokens,semantics:tokenizerEvidence.semantics}:null}};
  }else throw Error('Unsupported inference module');
  if(result?.tensor)result.tensor.modelSha256=job.manifest.modelSha256??job.manifest.model?.sha256;
 }catch(e){error=String(e.message??e);}
 finally{try{await textModel?.dispose();}catch(e){error=String(e.message??e);}hike?.dispose();}
 if(error)self.postMessage({...identity,type:'failure',error});
 else{const transfers=[result.tensor.data.buffer];if(result.attentionMask)transfers.push(result.attentionMask.buffer);self.postMessage({...identity,type:'success',result},transfers);}
};
