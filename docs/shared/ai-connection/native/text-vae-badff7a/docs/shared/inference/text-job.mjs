/** Shared native Text job. The caller owns its executor and Hike lifetime. */
import {validateTextEncoderInput} from './text-encoder-api.mjs';
import {tokenizePlainText} from './tokenizer.mjs';
import {loadTextEncoder} from './text-encoder.mjs';

export async function runTextEncoderJob({input,manifest,files,ort,hike,signal,onProgress,diagnostics=false}={}){
 let textModel;
 try{
  const selected=validateTextEncoderInput(input);
  let tokenIds=selected.tokenIds,attentionMask=selected.attentionMask,tokenizerEvidence;
  if(selected.text!==undefined){
   const descriptor=manifest.tokenizer;if(!descriptor)throw Error('Bundle has no tokenizer');
   const file=files.get(descriptor.path??descriptor.file);if(!file)throw Error('Select the original embedded tokenizer file');
   const model=file instanceof Uint8Array?file:new Uint8Array(await file.arrayBuffer());
   tokenizerEvidence=await tokenizePlainText(selected.text,model);tokenIds=tokenizerEvidence.tokenIds;attentionMask=tokenizerEvidence.attentionMask;
  }
  textModel=await loadTextEncoder({manifest,files,ort,hike,signal,onProgress});
  const output=await textModel.run({tokenIds,attentionMask,signal,onProgress});
  const result={tensor:{dtype:'float32',shape:output.shape,layout:'BLC',meaning:'text_hidden_states',data:output.hiddenStates,modelSha256:manifest.modelSha256,tokenizerSha256:output.provenance.tokenizerSha256,normalization:output.normalization,attentionMask:output.attentionMask},attentionMask:output.attentionMask,inputMode:tokenizerEvidence?'plain-text':'token-ids'};
  if(diagnostics===true)result.evidence={...output.provenance,hikeStats:hike.stats(),inputMode:result.inputMode,tokenizer:tokenizerEvidence?{sha256:tokenizerEvidence.tokenizerSha256,effectiveTokens:tokenizerEvidence.effectiveTokens,semantics:tokenizerEvidence.semantics}:null};
  return result;
 }finally{await textModel?.dispose();}
}
