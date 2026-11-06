/** Ordinary canonical-Text P4 service. The legacy30e owner remains unchanged;
 * this adoption binds its generic management lifecycle to the current native
 * capability and execution namespace. Numerical work stays with the owner. */
import {createNormalP4Owner,createNormalP4RequestDescriptor} from './normal-p4-owner.mjs';
import {createNormalOperationAdapter} from './normal-operation.mjs';
import {normalP4CurrentNative,ADOPTED_NORMAL_P4_CURRENT_SOURCE,inspectNormalP4CurrentAdoption} from './p4-current/native.mjs';
export {createNormalP4RequestDescriptor};
export {ADOPTED_NORMAL_P4_CURRENT_SOURCE,inspectNormalP4CurrentAdoption,NORMAL_P4_CURRENT_ROOT_URL,verifyNormalP4CurrentSources} from './p4-current/native.mjs';
const fail=(code,message)=>Object.assign(Error(message),{code});
function configuration({modelFile,side,inputPayloadBudgetBytes,bridgeBytes,mathBytes,attentionBytes}={}){
 if(!(modelFile instanceof Blob))throw fail('NORMAL_P4_MODEL_FILE_REQUIRED','Explicit immutable local modelFile Blob required');
 if(!['HIGH','LOW'].includes(side))throw fail('NORMAL_P4_MODEL_SIDE_REQUIRED','Explicit HIGH or LOW P4 model side required');
 return {file:modelFile,side,inputPayloadBudgetBytes,bridgeBytes,mathBytes,attentionBytes};
}
export async function createNormalP4CurrentOwner({nativeModule=normalP4CurrentNative,onNativeRequest,onProgress,...options}={}){
 const config=configuration(options);
 if(nativeModule.BUILD_ID!==inspectNormalP4CurrentAdoption().buildId)throw fail('NORMAL_P4_CURRENT_BUILD_MISMATCH','Current ordinary P4 requires its independently adopted native build');
 const owner=await createNormalP4Owner({...config,nativeModule,sourceRef:ADOPTED_NORMAL_P4_CURRENT_SOURCE,onNativeRequest,onProgress});
 return Object.freeze({...owner,configure:next=>owner.configure(configuration(next))});
}
export async function createNormalP4CurrentOperation({artifactStore,managerSessionId,...options}={}){
 const owner=await createNormalP4CurrentOwner(options);
 return createNormalOperationAdapter({owner,artifactStore,managerSessionId});
}

/** Standard operational envelope around the same queue/holder transaction.
 * Extra native request fields remain explicit descriptor parameters, so the
 * owner rejects them instead of the service silently discarding them. */
export async function createP4Management(options={}){
 const host=await createNormalP4CurrentOperation(options);
 function descriptor({operation,input}={}){
  const value=createNormalP4RequestDescriptor(input);
  value.operationId=operation;
  value.parameters=structuredClone(Object.fromEntries(Object.entries(input).filter(([key])=>key!=='inputs')));
  return value;
 }
 async function query(request){const reply=await host.querySupport(descriptor(request));return {...reply,support:{...reply.nativeSupport,supported:reply.dispatchSupported===true,reasons:reply.reasons}};}
 async function execute({operation,input,...execution}={}){
  const reply=await host.execute({...execution,descriptor:descriptor({operation,input}),input:input?.inputs});
  return {...reply,tensor:reply.output?.tensor,result:reply.output};
 }
 function inspect(){const state=host.inspect();return {...state,kind:'p4',configured:state.ownerObservation.loadedState.fileConfigured,sourceRef:state.ownerObservation.sourceRef,recoveryRequired:state.ownerObservation.cleanupPending,adoption:inspectNormalP4CurrentAdoption()};}
 return Object.freeze({query,execute,cancel:host.cancel,recover:host.recover,configure:host.configure,dispose:host.dispose,inspect});
}
