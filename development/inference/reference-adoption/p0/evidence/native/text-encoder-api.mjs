import {createInferenceClient} from './client.mjs';
import {inspectTextEncoderManifest,TEXT_ENCODER_MODEL_SHA256,UMT5_TOKENIZER_SHA256} from './text-encoder.mjs';
export function validateTextEncoderInput(input){
 if(!input||typeof input!=='object')throw TypeError('TextEncoder input object required');
 if(input.text!==undefined){
  if(typeof input.text!=='string'||input.tokenIds!==undefined||input.attentionMask!==undefined)throw TypeError('Choose plain text or token IDs/mask, without mixing input modes');
  return{text:input.text};
 }
 const vector=x=>Array.isArray(x)||(ArrayBuffer.isView(x)&&typeof x.length==='number');
 if(!vector(input.tokenIds)||!vector(input.attentionMask))throw TypeError('Explicit token IDs and attention mask required');
 const ids=Array.from(input.tokenIds),mask=Array.from(input.attentionMask);
 if(!ids.length||ids.length>512||ids.length!==mask.length||ids.some(x=>!Number.isSafeInteger(x)||x<0||x>=256384)||mask.some(x=>x!==0&&x!==1)||!mask.includes(1))throw TypeError('Invalid text token IDs or attention mask');
 return{tokenIds:Int32Array.from(ids),attentionMask:Uint8Array.from(mask)};
}
export function createTextEncoderModule({client=createInferenceClient(),ownsClient=true}={}){
 let config=null,disposed=false;
 function ready(){if(disposed)throw Error('TextEncoder module disposed');if(!config)throw Error('Configure TextEncoder model files before encoding');}
 const api={
  capabilities(){return{apiVersion:'works-ai-1',module:'text_encoder',operations:['encode'],inputs:['plain-text','tokenIds+attentionMask'],output:{dtype:'float32',layout:'BLC',meaning:'text_hidden_states',shape:[1,'L',4096],attentionMask:true,tokenizerSha256:UMT5_TOKENIZER_SHA256},modelSha256:TEXT_ENCODER_MODEL_SHA256,tokenizerSha256:UMT5_TOKENIZER_SHA256,maximumTokens:512,arithmetic:'FP32 diagnostic expansion',configured:!!config};},
  configure({manifest,files}){if(disposed)throw Error('TextEncoder module disposed');inspectTextEncoderManifest(manifest);if(!(files instanceof Map))throw TypeError('Local files Map required');if(client.state.status==='running'&&client.state.module==='text_encoder')client.cancel();config={manifest:structuredClone(manifest),files:new Map(files)};return api.capabilities();},
  async encode(input){ready();return client.run({module:'text_encoder',operation:'encode',...config,input:validateTextEncoderInput(input)});},
  cancel(){if(client.state.status==='running'&&client.state.module==='text_encoder'){client.cancel();return true;}return false;},
  dispose(){api.cancel();config=null;disposed=true;if(ownsClient)client.dispose();}
 };return Object.freeze(api);
}
