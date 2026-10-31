import {createDirectAdapter} from './core.mjs';
// works-ai-1 exports verified at Text/VAE54bfead; no native implementation imports here.
export function createTextVaeAdapter(options){
 const {descriptor,nativeClient,module}=options;
 if(descriptor.nativeAPI.version!=='works-ai-1'||!['text_encoder','vae'].includes(module))throw TypeError('Exact works-ai-1 module required');
 const methods=module==='vae'?['capabilities','configure','encode','decode']:['capabilities','configure','encode'];
 return createDirectAdapter({...options,allowedMethods:methods,
  nativeEnvelope:q=>({apiVersion:'works-ai-1',module,id:q.requestId,method:q.operationId,build:descriptor.nativeAPI.build}),
  invokeNative:q=>{if(typeof nativeClient[q.operationId]!=='function')throw Error('Acquired native export unavailable');return nativeClient[q.operationId](q.input);},
  cancelNative:()=>nativeClient.cancel()});
}
