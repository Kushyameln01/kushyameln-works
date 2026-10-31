// Browser ES-module runner. Serve the repository and immutable peer2bba907 files.
// Private sources/references are passed explicitly; no original payload download.
import {createLoraV2DiagnosticAdapter} from '../../docs/shared/diffusion-models/lora/v2-adapter.mjs';
export const PEER_COMMIT='2bba90785292e42a0c7c8756685b0d8b128b2dcf';
export const PEER_SHA256=Object.freeze({
  "sdk-v2.mjs": "c425519eb282f798f4296bc97fd1506664afd850dee9addb17af77dd41e39fa0",
  "planner-v2.mjs": "303340db3a6a58b288fbfbf38cb2b53605a6c7cc3f6d00903f881aa825ef92c5",
  "loader-policy.mjs": "f18f9c8dd4168e26f25cd1c77124b1f14a2ffca99424bfa9d4a9a294cbb2dedd",
  "planner.mjs": "a4b2be0d8b90cd339bb0a17d072db4fd572ac122e3cc51a2c97b20ac06af1d02",
  "safetensors.mjs": "4ee3713b356ab4a85a2911d3547350146953bc250465f8ef2c88fe9f36c4e45c",
  "kernel/host.mjs": "ee8c3c5abc6fcbf082d3557d792536024d0109f56a9aac4c959e98315a933d54",
  "kernel/registry.mjs": "c739e9b19b1b66dcaa5b47d9d7d35528c1b8a2f6d6f1e7fd13a5dfe1837e3c64",
  "kernel/lora.wasm": "da6d56fca5d9bc91173681c22b91cd9337f53ea067d84455b9d659ee7ee52984"
});
const SOURCE_HASHES={
 'light/HIGH':'9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945',
 'light/LOW':'86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b',
 'detail/HIGH':'34e2144d3cd65360f97d09ccbe03e1c39a096df6c9234af5fe3899d1b63cda39',
 'detail/LOW':'d6b783742f4d5fd63a0223ae1d5bf64fc995a6b408480ac2a00528ae0d4146db'
};
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
function f32(a,n){if(!(a instanceof Float32Array)||a.length!==n||!(a.buffer instanceof ArrayBuffer)||a.byteOffset!==0||a.byteLength!==a.buffer.byteLength||!a.every(Number.isFinite))throw Error('Compact finite F32 reference required');return new Float32Array(a);}
function tolerance(t){if(!t||!['absolute','relative'].every(k=>typeof t[k]==='number'&&Number.isFinite(t[k])&&t[k]>=0))throw Error('Explicit finite comparison tolerance required');return {absolute:t.absolute,relative:t.relative};}
function reference(r){return {x:f32(r.x,5120),expected:f32(r.expected,16),tolerance:tolerance(r.tolerance)};}
function compare(a,b,t){let maximum=0,failed=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);maximum=Math.max(maximum,d);if(!Number.isFinite(d)||d>t.absolute+t.relative*Math.abs(b[i]))failed++;}return {passed:failed===0,elements:a.length,failed,maxAbsoluteError:maximum,tolerance:t};}
let running=false;
export async function runLoraDiffusionDiagnostic({peerRootUrl,base,loraSource,selection,strength,reference:patchRef,baseReference,expectedWeight,expectedBias,expectedBaseWeight,expectedBaseBias,weightTolerance,expectedSourceSha256,evidenceScope,isCurrent}={}){
 if(running)throw Error('E1 runner busy');
 if(!['real-original-joint','synthetic-contract','real-base-synthetic-lora'].includes(evidenceScope)||typeof isCurrent!=='function'||!['light','detail'].includes(selection?.pairId)||!['high','low'].includes(selection?.noise)||!Number.isFinite(strength))throw Error('Explicit source selection, scope, current callback and strength required');
 // Own all independent expected bytes before any fetch/initialization await.
 const ref=reference(patchRef),baseRef=reference(baseReference),expected={patched:{weight:f32(expectedWeight,81920),bias:f32(expectedBias,16)},base:{weight:f32(expectedBaseWeight,81920),bias:f32(expectedBaseBias,16)}},tol=tolerance(weightTolerance),picked=structuredClone(selection),side=picked.noise.toUpperCase();
 if(!/^[a-f0-9]{64}$/.test(expectedSourceSha256)||evidenceScope==='real-original-joint'&&SOURCE_HASHES[picked.pairId+'/'+side]!==expectedSourceSha256)throw Error('Original identity is outside the declared E1 pair/side');
 if(typeof loraSource?.read!=='function'||typeof loraSource?.hash!=='function'||!Number.isSafeInteger(loraSource.size))throw Error('Owner-held size/read/hash source required');
 const source=Object.freeze({size:loraSource.size,read:loraSource.read.bind(loraSource),hash:loraSource.hash.bind(loraSource)}),root=new URL(peerRootUrl,import.meta.url);if(!root.pathname.endsWith('/'))throw Error('Peer module root must end with /');
 if(base.describe().side!==side)throw Error('Selected base side differs from source side');
 running=true;let sdk,kernel,adapter,stage,prepared,error,outcome,phase='patched';const observations=[];
 try{
  const fetched=await Promise.all(Object.entries(PEER_SHA256).map(async([name,digest])=>{const response=await fetch(new URL(name,root));if(!response.ok)throw Error('Peer source unavailable: '+name);const bytes=await response.arrayBuffer();if(await sha(bytes)!==digest)throw Error('Peer source hash mismatch: '+name);return [name,bytes];}));
  if(isCurrent()!==true)throw Error('Application superseded during peer reception');const assets=new Map(fetched);
  const [{createLoraV2},{createKernel},{createOrtProjectionStage}]=await Promise.all([import(new URL('sdk-v2.mjs',root).href),import(new URL('kernel/host.mjs',root).href),import('../../docs/shared/diffusion-models/ort-bridge/stage.mjs')]);
  kernel=await createKernel({wasmBytes:assets.get('kernel/lora.wasm')});sdk=await createLoraV2({sourceFactory:()=>source,kernel});stage=await createOrtProjectionStage();
  const measured={async runF32(input){
   const ownedWeight=f32(input.weight,81920),ownedBias=f32(input.bias,16),bound=expected[phase],weight=compare(ownedWeight,bound.weight,tol),bias=compare(ownedBias,bound.bias,tol);
   if(!weight.passed||!bias.passed)throw Error('Independent selected weight/bias comparison failed');
   const value=await stage.runF32(input);observations.push({phase,weight,bias,weightSHA256:await sha(ownedWeight),biasSHA256:await sha(ownedBias),outputSHA256:await sha(value.output),evidence:structuredClone(value.evidence)});return value;
  }};
  adapter=await createLoraV2DiagnosticAdapter({base,stage:measured,reference:ref,includeBias:picked.pairId==='light',isCurrent});
  const plan=await sdk.plan({selection:picked,strength,registry:adapter.registry,diagnostic:adapter.diagnostic,loaderPolicyId:adapter.registry.loaderPolicyId});
  if(plan.sourceSha256!==expectedSourceSha256)throw Error('Source owner receipt differs from selected original');
  prepared=await sdk.prepare(plan,{baseProvider:adapter.baseProvider,sink:adapter.createSink()});
  const applied=await sdk.stage(prepared,adapter.target,{isCurrent});
  await sdk.release(prepared);await adapter.releaseHistory();
  const active=await adapter.run({x:ref.x}),output=compare(active.output,ref.expected,ref.tolerance);if(!output.passed)throw Error('Active consumer output mismatch after prepared release');
  phase='base';const restoration=await adapter.restoreBase({reference:baseRef,isCurrent});
  outcome={schemaVersion:'diffusion-e1-joint-result/1',passed:true,scope:'PARTIAL',completeAdapter:false,modelInference:false,generationReady:false,realOriginalJoint:evidenceScope==='real-original-joint',evidenceScope,peerCommit:PEER_COMMIT,peerSourceHashes:PEER_SHA256,selection:picked,strength,sourceSha256:plan.sourceSha256,base:base.describe(),sdkPlan:{planId:plan.planId,registryHash:plan.registryHash,scope:plan.scope,coverage:plan.coverage,includedPatches:plan.includedPatches,excludedTargets:plan.excludedTargets,excludedRegions:plan.excludedRegions},nativeRegistryHash:base.describe().registryHash,applied,activeOutput:output,observations,restoration};
 }catch(e){error=e;}
 // Never discard bytes under an unresolved rollback/abort. The local owner
 // can retry failure.recover(); no callback is sent through a MessagePort.
 const cleanup=async()=>{await adapter?.recover();await sdk?.recover(prepared);await sdk?.dispose();await adapter?.dispose();await stage?.dispose();kernel?.dispose();};
 try{await cleanup();}catch(cleanupError){
  const failure=new AggregateError([...(error?[error]:[]),cleanupError],'E1 cleanup retained; call recover() before reusing the runner');
  failure.e1Progress={scope:'PARTIAL',evidenceScope,realOriginalJoint:false,observations,cleanupRetained:true};
  failure.recover=async()=>{await cleanup();running=false;failure.e1Progress.cleanupRetained=false;};throw failure;
 }
 running=false;
 if(error){error.e1Progress={scope:'PARTIAL',evidenceScope,realOriginalJoint:false,observations,cleanupRetained:false};throw error;}
 return outcome;
}
