import {createDirectAdapter} from './core.mjs';
// v2 method names are declared in the retrieved original contract. Exact source is
// separately required: default sourceVerified=false prevents claiming a real edge.
export function createLoraAdapter(options){
 if(options.descriptor.nativeAPI.version!=='lora-connection/2.0-draft.1')throw TypeError('Explicit LoRA v2 contract required');
 return createDirectAdapter({...options,requiresRevisionBinding:true,supportsConnected:false,allowedMethods:['inspect','plan','prepare','stage','release','recover'],
  nativeEnvelope:q=>({contractVersion:'lora-connection/2.0-draft.1',requestId:q.requestId,localRevisionBinding:q.nativeRevisionBinding??null}),
  invokeNative:async q=>{if(!Array.isArray(q.nativeArguments))throw TypeError('Explicit local positional nativeArguments required; no native signature inferred');if(typeof options.nativeClient[q.operationId]!=='function')throw Error('Native v2 export unavailable');try{return await options.nativeClient[q.operationId](...q.nativeArguments);}catch(e){throw Object.assign(Error(String(e?.message??e)),{nativeCode:typeof e?.code==='string'?e.code:null,cause:e});}},
  cancelNative:target=>{if(typeof options.cancelOwner!=='function')throw Error('LoRA bounded cooperative owner cancellation callback required');return options.cancelOwner(target);}});
}
