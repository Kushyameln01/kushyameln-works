import {createInferenceClient} from './client.mjs';
import {inspectTextEncoderManifest,TEXT_ENCODER_MODEL_SHA256,UMT5_TOKENIZER_SHA256,TEXT_ENCODER_NORMALIZATION} from './text-encoder.mjs';
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
  capabilities(request){
   let support;
   if(request!==undefined){
    const no=(code,reason,requiredChanges)=>({supported:false,code,reason,requiredChanges});
    if(disposed)support=no('MODULE_DISPOSED','TextEncoder module disposed',['Create and configure a new TextEncoder module']);
    else if(!config)support=no('NOT_CONFIGURED','No configured TextEncoder',['Configure manifest and local files']);
    else if(request?.operation!=='encode')support=no('OPERATION_UNSUPPORTED','TextEncoder supports encode',['Use encode']);
    else try{
     const input=validateTextEncoderInput(request.input),m=config.manifest;
     const required=[...m.blocks,m.finalNorm,m.embedding.rowHashes,{path:m.embedding.sourceFile,bytes:m.embedding.sourceBytes},...(input.text!==undefined?[m.tokenizer]:[])];
     for(const record of required){
      if(!record){support=no('MISSING_TOKENIZER','Plain text requires the configured tokenizer',['Configure its tokenizer descriptor and file']);break;}
      const path=record.path??record.file,file=config.files.get(path),bytes=file instanceof Uint8Array?file.byteLength:file?.size;
      if(!file||bytes!==record.bytes){support=no(!file?'MISSING_ASSET':'ASSET_SIZE_MISMATCH','Missing or mismatched Text asset: '+path,['Provide the configured local graph/weight/tokenizer file']);break;}
     }
     support??={supported:true,code:'SUPPORTED',reason:'Native input syntax and local file sizes match; plain token count is checked by the tokenizer during encode',requiredChanges:[],pendingChecks:['asset bytes SHA-256','plain token overflow if applicable'],scope:'configured contract, not completed inference'};
    }catch(error){support=no('INPUT_UNSUPPORTED',error.message,['Use plain text or explicit token IDs and binary mask of equal length 1..512']);}
   }
   return{apiVersion:'works-ai-1',module:'text_encoder',operations:['encode'],inputs:['plain-text','tokenIds+attentionMask'],inputModes:{'plain-text':{outputShape:[1,512,4096],overflow:'reject'},'token-ids':{outputShape:[1,'L',4096],minimumLength:1,maximumLength:512}},output:{dtype:'float32',layout:'BLC',meaning:'text_hidden_states',shape:[1,'L',4096],attentionMask:true,normalization:TEXT_ENCODER_NORMALIZATION,tokenizerSha256:UMT5_TOKENIZER_SHA256},finalNormalization:{operation:'encoder.final_layer_norm',algorithm:'weighted RMSNorm',epsilon:1e-6,maskedRows:'zero',implementation:'Hike',weightSha256:config?.manifest.finalNorm.sha256??null},modelSha256:TEXT_ENCODER_MODEL_SHA256,tokenizerSha256:UMT5_TOKENIZER_SHA256,maximumTokens:512,arithmetic:'FP32 prepared expansion',configured:!!config,disposed,...(support?{support}:{})};
  },
  configure({manifest,files,diagnostics=false}){if(disposed)throw Error('TextEncoder module disposed');inspectTextEncoderManifest(manifest);if(!(files instanceof Map))throw TypeError('Local files Map required');if(typeof diagnostics!=='boolean')throw TypeError('diagnostics must be boolean');if(client.state.status==='running'&&client.state.module==='text_encoder')client.cancel();config={manifest:structuredClone(manifest),files:new Map(files),diagnostics};return api.capabilities();},
  async encode(input){ready();return client.run({module:'text_encoder',operation:'encode',...config,input:validateTextEncoderInput(input)});},
  cancel(){if(client.state.status==='running'&&client.state.module==='text_encoder'){client.cancel();return true;}return false;},
  dispose(){api.cancel();config=null;disposed=true;if(ownsClient)client.dispose();}
 };return Object.freeze(api);
}
