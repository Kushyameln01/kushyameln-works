import {SentencePieceProcessor} from './vendor/sentencepiece.mjs';
import {UMT5_TOKENIZER_SHA256 as EXPECTED} from './text-encoder.mjs';
export async function tokenizePlainText(text,modelBytes,{minimumLength=512,maximumLength=512}={}){
 if(typeof text!=='string'||!Number.isInteger(minimumLength)||!Number.isInteger(maximumLength)||minimumLength<1||maximumLength<minimumLength)throw TypeError('Invalid text tokenizer input');
 const bytes=modelBytes instanceof Uint8Array?modelBytes:new Uint8Array(modelBytes);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==EXPECTED)throw Error('Tokenizer model hash does not match the saved UMT5');
 const spp=new SentencePieceProcessor();
 try{
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  await spp.loadFromB64StringModel(btoa(binary));
  // No lowercasing/cleanText, hidden task prefix, emphasis parser or silent truncation.
  const ids=[...spp.encodeIds(text),1];if(ids.length>maximumLength)throw RangeError('Text exceeds supported token length; shorten it explicitly');
  const length=ids.length,outputLength=Math.max(minimumLength,length),tokenIds=new Int32Array(outputLength);tokenIds.set(ids);
  const attentionMask=new Uint8Array(outputLength);attentionMask.fill(1,0,length);
  return{tokenIds,attentionMask,effectiveTokens:length,tokenizerSha256:hash,semantics:'Plain SentencePiece text, EOS1, PAD0; no ComfyUI weighted-prompt interpretation'};
 }finally{spp.processor?.delete?.();spp.processor=null;spp.sentencepiece=null;}
}
