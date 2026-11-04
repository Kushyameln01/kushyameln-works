/** Small-profile posterior-mean service over the adopted real Diffusion API.
 * The existing normal owner/queue owns lifecycle; native Hike owns all math.
 * Input metadata is retained separately when the native mean contract omits it.
 */
import * as nativeModule from './native.mjs';
import {createNormalDiffusionOwner,createNormalRequestDescriptor} from '../normal-diffusion-owner.mjs';
import {createNormalOperationAdapter} from '../normal-operation.mjs';

const operations=['normalizeRawMean','restoreRawMean'];
const fail=(code,message)=>Object.assign(Error(message),{code});
function request(operation,input){
 if(!operations.includes(operation))throw fail('DIFFUSION_MEAN_OPERATION_UNSUPPORTED','Only native posterior-mean normalization and restoration are supported');
 if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw fail('INVALID_MODEL_INPUT','Native mean input must be a plain {tensor} object');
 const keys=Reflect.ownKeys(input),field=Object.getOwnPropertyDescriptor(input,'tensor');
 if(keys.length!==1||keys[0]!=='tensor'||!field?.enumerable||!Object.hasOwn(field,'value'))throw fail('INVALID_MODEL_INPUT','Native mean input requires exactly the tensor data field');
 const tensor=structuredClone(field.value);
 // structuredClone retains SharedArrayBuffer backing. Capture the numerical
 // payload now, before the service queue can wait behind another request.
 if(ArrayBuffer.isView(tensor.data)&&!(tensor.data instanceof DataView))tensor.data=tensor.data.slice();
 return {descriptor:createNormalRequestDescriptor(operation,tensor),tensor};
}

export async function createDiffusionMeanManagement({managerSessionId='diffusion-mean-manager:'+crypto.randomUUID()}={}){
 const [interop,latentModule]=await Promise.all([
  import(new URL('docs/shared/diffusion-models/tensor-interop.mjs',nativeModule.DIFFUSION_PUBLIC_ROOT_URL)),
  import(new URL('docs/shared/diffusion-models/latent-space/latent-space.mjs',nativeModule.DIFFUSION_PUBLIC_ROOT_URL))
 ]);
 const owner=await createNormalDiffusionOwner({nativeModule,interop,latentModule,sourceRef:nativeModule.ADOPTED_DIFFUSION_PUBLIC_SOURCE});
 const host=createNormalOperationAdapter({owner,managerSessionId});
 // The reused owner releases its private API after every request. Start the
 // next support query only after the preceding host result has been adopted;
 // otherwise its replacement session can make that preceding result stale.
 let tail=Promise.resolve(),closing=false,pendingRequests=0;
 function sequence(action){
  pendingRequests++;
  const work=tail.then(()=>{if(closing)throw fail('DIFFUSION_MEAN_DISPOSED','Mean management is closing or disposed');return action();});
  tail=work.then(()=>{},()=>{});
  return work.finally(()=>{pendingRequests--;});
 }
 return Object.freeze({
  async execute({operation,input,signal,onProgress,requestId}={}){
   const selected=request(operation,input),{data,...inputMetadata}=selected.tensor;
   return sequence(async()=>{
    const reply=await host.execute({descriptor:selected.descriptor,input:selected.tensor,signal,onProgress,requestId});
    if(reply.status!=='EXECUTION_COMPLETED')return {...reply,inputMetadata};
    const diagnostics=owner.readDiagnostics();
    const result={...reply.output,...(diagnostics?.nativeEvidence!==null&&diagnostics?.nativeEvidence!==undefined?{evidence:diagnostics.nativeEvidence}:{})};
    return {...reply,tensor:result.tensor,result,inputMetadata};
   });
  },
  query({operation,input}={}){const selected=request(operation,input);return sequence(()=>host.querySupport(selected.descriptor));},
  cancel:target=>host.cancel(target),async dispose(){closing=true;const result=await host.dispose();await tail;return result;},
  inspect:()=>({...host.inspect(),pendingRequests,sourceRef:nativeModule.ADOPTED_DIFFUSION_PUBLIC_SOURCE,modelWeightsLoaded:false,scope:'Native advertised small posterior-mean profiles only; no generated-sample restoration or full-shape acceptance'})
 });
}
