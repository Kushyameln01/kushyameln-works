import {createDirectAdapter} from './core.mjs';
// Existing 0.1 wire operations from the fixed public contract. No f522 diagnostics guessed.
const operations=['capabilities','inspect','validateConditioning','validateRawLatent','normalizeRawMean','restoreRawMean','schedule','noiseMix','inverseNoiseScale','flowDenoised','eulerStep','linearProjection','inspectLora','loadLora','listLoras','readLora','readLoraSource','unloadLora'];
export function createDiffusionAdapter(options){
 const {descriptor,nativeClient,binding}=options;
 if(descriptor.nativeAPI.version!=='diffusion-models/0.1'||!binding.nativeSessionId||!Number.isSafeInteger(binding.inputRevision))throw TypeError('Explicit native wire/session/inputRevision required');
 const envelope=q=>({protocolVersion:descriptor.nativeAPI.version,buildId:descriptor.nativeAPI.build,sessionId:binding.nativeSessionId,jobId:q.requestId,inputRevision:binding.inputRevision,op:q.operationId});
 return createDirectAdapter({...options,allowedMethods:operations,nativeEnvelope:envelope,
  invokeNative:async(q,{recordReply})=>{const wire=envelope(q),reply=await nativeClient.request({...wire,input:q.input});recordReply(reply);
   if(!reply||Object.keys(wire).some(k=>reply[k]!==wire[k]))throw Error('Native reply identity/build/revision mismatch');
   if(reply.status!=='ok')throw Object.assign(Error(reply.error?.message??'Native error'),{nativeCode:reply.error?.code??null});
   return reply.result;},
  // Queue owner must call the actual supplied native owner stop; wire cancel is not invented.
  cancelNative:target=>{if(typeof options.cancelOwner!=='function')throw Error('Native owner cancellation callback required');return options.cancelOwner(target);}});
}
