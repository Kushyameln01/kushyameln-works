// Live Diffusion Rect boundary; numerical math stays in owner Hike, not manager.
import {createDiffusionModels,attachDiffusionPort,PROTOCOL_VERSION,BUILD_ID} from '/owner/shared/diffusion-models/api/index.mjs';
import {requireWanRawLatentRect,requireWanRawLatent} from '/owner/shared/diffusion-models/tensor-interop.mjs';
import {encodeTensor,decodeTensor} from '/peer-vae/tensor.mjs';
import {createDiffusionAdapter} from '/peer-manager/adapters/diffusion.mjs';
import {captureNativeTensor,restoreNativeTensor,releaseArtifactHandle,createOwnedArtifactStore} from '/peer-manager/adapters/artifacts.mjs';
import {createInvocationQueue} from '/peer-manager/queue.mjs';
import {writeArtifactPackage,readArtifactPackage,PACKAGE_VERSION} from '/peer-manager/package.mjs';
import {canonicalBytes} from '/peer-manager/canonical.mjs';
const assert=(x,m)=>{if(!x)throw Error(m);};
const eq=(a,b)=>a===undefined||b===undefined?a===b:new TextDecoder().decode(canonicalBytes(a))===new TextDecoder().decode(canonicalBytes(b));
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const payload=t=>new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);
const base64=b=>btoa(String.fromCharCode(...b));
const metadata=t=>{const {data,...m}=t;return structuredClone(m);};
const responseIdentity=r=>r?.native?Object.fromEntries(Object.entries(r.native).filter(([key])=>key!=='rawReply')):null;
const deny=fn=>{let rejected=false;try{fn();}catch{rejected=true;}assert(rejected,'Expected strict profile rejection');};

export async function runP2Rect(reference){
 const api=createDiffusionModels(),cases=[],store=createOwnedArtifactStore(),handles=[],events=[];let sequence=0,active=0,maxActive=0,dispatch=null;
 const binding={ownerId:'diffusion_models',sessionId:'manager-p2',nativeSessionId:api.sessionId,inputRevision:1,bindingRef:'p2-rect-owner'};
 const descriptor={nativeAPI:{version:PROTOCOL_VERSION,build:BUILD_ID},operations:['normalizeRawMean','restoreRawMean'].map(operationId=>({operationId,implementationState:'implemented',inputPorts:[]}))};
 const client={request(q){const promise=api.request(q);dispatch?.(q);return promise;}};
 const cancelOwner=async target=>{const ack=await api.cancel({sessionId:api.sessionId,jobId:target.requestId,inputRevision:binding.inputRevision});return {stopped:ack?.result?.workerTerminated===true,nativeAck:ack};};
 const owner=createDiffusionAdapter({descriptor,nativeClient:client,binding,sourceVerified:true,artifactStore:store,cancelOwner});
 const queue=createInvocationQueue({resourceBindings:[{bindingId:'p2-owner',ownerId:binding.ownerId,resourceGeneration:'p2-generation-1',
  cancel:target=>owner.cancel({requestId:target.requestId,localRevision:target.revision}),
  afterTerminal:async(_,outcome)=>({reusable:owner.active===null&&outcome.originalTerminal===true}),
  release:async target=>events.push({event:'release',requestId:target.requestId})}]});
 const invoke=async(op,tensor,{cancel=false}={})=>{
  const id='p2-'+(++sequence),invocation={id,requestId:id,ownerId:binding.ownerId,resourceBinding:'p2-owner',resourceGeneration:'p2-generation-1',revision:sequence,activeToken:'token-'+id};
  let reached;const dispatched=new Promise(resolve=>{reached=resolve;});if(cancel)dispatch=()=>reached();
  const promise=queue.enqueue(invocation,async()=>{active++;maxActive=Math.max(maxActive,active);try{return await owner.invoke({requestId:id,localRevision:invocation.revision,operationId:op,input:{tensor}});}finally{active--;}});
  if(cancel){await dispatched;dispatch=null;const target={bindingId:'p2-owner',ownerId:binding.ownerId,resourceGeneration:'p2-generation-1',requestId:id,revision:invocation.revision,activeToken:invocation.activeToken};await queue.cancelInvocation(id,target);let error;try{await promise;}catch(e){error=e;}assert(error?.code==='INVOCATION_CANCELLED','Queue accepted cancelled output');await queue.drain();return {target,records:queue.inspect()};}
  const response=await promise;assert(response.status==='ok','Manager/native operation failed: '+JSON.stringify(response));return response;
 };
 const codec={codecId:'works:wktensor',codecVersion:'WKTSR001/schemaVersion1',sourceRef:{repository:'https://github.com/Kushyameln01/kushyameln-works',commit:'855f435120f08eb9e818e51281fc26f0e2633829',path:'docs/shared/inference/tensor.mjs'}};
 const registry={schemas:[{schemaId:'diagnostic:g1c-native',schemaVersion:'1',g1cMetadata:true},{schemaId:'diagnostic:raw-mean',schemaVersion:'1',nativeMeanings:['raw-posterior-mean']},{schemaId:'diagnostic:normalized-mean',schemaVersion:'1',nativeMeanings:['wan21-normalized-posterior-mean:v1']}],roles:[],codecs:[{...codec,decode:decodeTensor}]};
 const allFiles=[];
 async function save(id,tensor,response,inputArtifact=null){
  const encoded=await encodeTensor(tensor),stored=await decodeTensor(encoded);
  // The codec does not serialize the optional normalization marker. Retain the
  // exact owner's metadata in evidence, without relabelling normalized as raw.
  const traceId='trace-'+id,extension={'p2:future-metadata':{schemaId:'diagnostic:p2-future',schemaVersion:'1',requiredForUse:false,data:{orderedSlots:['source','reference_video','slot-2','slot-2'],opaque:{value:'preserved'}}}};
  const descriptor={contractVersion:'works-module-contract/1.0-draft.1',artifactId:id,kind:'tensor',native:{schemaId:'diagnostic:g1c-native',schemaVersion:'1',payloadRef:'pending',metadata:{}},semantics:{schemaId:tensor.meaning==='raw-posterior-mean'?'diagnostic:raw-mean':'diagnostic:normalized-mean',schemaVersion:'1',spaceId:tensor.meaning==='raw-posterior-mean'?'raw':'normalized'},tensor:{dtype:stored.dtype,shape:stored.shape,axes:['N','C','T','H','W'],nativeMeaning:stored.meaning,dataRef:'pending'},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[traceId]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:'diffusion_models',mode:'copy'},extensions:{}};
  const handle=captureNativeTensor({tensor:stored,response,descriptor,extensions:extension,store,registry});handles.push(handle);
  const snapshot=restoreNativeTensor(handle,store),before=await sha(payload(snapshot));stored.data[0]=123;assert(await sha(payload(restoreNativeTensor(handle,store)))===before,'Capture lost owned bytes');
  const dir='artifacts/'+id,paths={nativePath:dir+'/native.wktensor',descriptorPath:dir+'/descriptor.json',evidencePath:dir+'/evidence.json',tracePath:dir+'/trace.json',snapshotPath:dir+'/snapshot.json',extensionsPath:dir+'/extensions.json'};
  const evidence={schemaVersion:1,artifactId:id,records:[{evidenceId:'numeric-'+id,data:{scope:'P2 Diffusion-owned Rect live boundary',ownerOutputMetadata:metadata(tensor),ownerResponseMetadata:responseIdentity(response),nativeEvidence:response?.result?.evidence??null}}]};
  const trace={schemaVersion:1,artifactId:id,records:[{traceId,data:{chainId:id.startsWith('context-')?'p2-context-metadata-fixture':'p2-real-rect-mean',profileId:reference.profileId,source:reference.source,inputArtifact:inputArtifact?{artifactId:inputArtifact.id,payloadSha256:inputArtifact.payloadSha256}:null,outputArtifact:{artifactId:id,payloadSha256:before},nativeOperation:responseIdentity(response),nativeBuild:BUILD_ID,normalizationOwner:'diffusion_models',generationReady:false}}]};
  const assets=new Map(),manifest={packageVersion:PACKAGE_VERSION,packageId:'p2-'+id,payloadBindings:[{ref:handle.descriptor.native.payloadRef,artifactId:id,nativePath:paths.nativePath,kind:'decoded-tensor-data'}],artifacts:[{artifactId:id,...paths,codec}],files:[],extensions:{}};
  for(const [key,kind,value]of [['nativePath','native',encoded],['descriptorPath','descriptor',canonicalBytes(handle.descriptor)],['evidencePath','evidence',canonicalBytes(evidence)],['tracePath','trace',canonicalBytes(trace)],['snapshotPath','snapshot',canonicalBytes(null)],['extensionsPath','extensions',canonicalBytes(extension)]]){assets.set(paths[key],value);manifest.files.push({path:paths[key],kind,required:true});}
  const disk=new Map();await writeArtifactPackage(manifest,assets,{registry,write:async(path,bytes)=>disk.set(path,new Uint8Array(bytes))});const readback=await readArtifactPackage({read:async path=>disk.get(path)??null},registry);assert(readback.status==='complete','Package not recovered');const artifact=readback.artifacts[0];
  assert(await sha(payload(artifact.restoredNative))===before,'Package changed numerical payload');assert(eq(artifact.restoredExtensions,extension),'Outer arbitrary metadata lost');assert(eq(artifact.restoredNative.context,snapshot.context),'Context mapping lost');assert(eq(artifact.restoredEvidence.records[0].data.ownerOutputMetadata,metadata(tensor)),'Owner metadata lost from outer evidence');
  for(const [path,bytes]of disk)allFiles.push({path:id+'/'+path,base64:base64(bytes)});
  const result={tensor:artifact.restoredNative,summary:{id,packageStatus:readback.status,fileSha256:await sha(encoded),payloadSha256:before,shape:artifact.restoredNative.shape,meaning:artifact.restoredNative.meaning,context:artifact.restoredNative.context??null,ownerOutputMetadata:metadata(tensor),optionalNormalizationMarkerStoredIn:'outer evidence; codec versioned meaning preserves its raw/normalized distinction',snapshotId:null}};
  releaseArtifactHandle(handle,store);handles.splice(handles.indexOf(handle),1);return result;
 }
 try{
  const cap=await api.request({protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'p2-cap',inputRevision:1,op:'capabilities',input:{}});
  assert(cap.result?.rawMeanProfiles?.some(p=>p.id===reference.profileId&&eq(p.shape,[1,16,1,2,4])),'Rect candidate capability unavailable');
  const raw=await decodeTensor(await(await fetch('/fixture/mean.wktensor')).arrayBuffer());raw.profileId=reference.profileId;requireWanRawLatentRect(raw);deny(()=>requireWanRawLatent(raw));
  const input=await save('raw-real',raw,null),norm=await invoke('normalizeRawMean',input.tensor);assert(norm.result.evidence.profileId===reference.profileId,'Wrong profile route');
  const normalized=norm.result.tensor;assert(normalized.meaning==='wan21-normalized-posterior-mean:v1','Normalized mean relabelled raw');normalized.data.forEach((v,i)=>assert(Object.is(v,reference.normalized[i]),'Independent normalize mismatch '+i));
  const savedNorm=await save('normalized-real',normalized,norm,input.summary),restore=await invoke('restoreRawMean',savedNorm.tensor),restored=restore.result.tensor;restored.data.forEach((v,i)=>assert(Object.is(v,reference.restored[i]),'Independent restore mismatch '+i));
  const roundTrip=Math.max(...restored.data.map((v,i)=>Math.abs(v-reference.raw[i])));assert(roundTrip<=reference.roundTripMaxAbs,'Preset roundtrip gate failed');const savedRestored=await save('restored-real',restored,restore,savedNorm.summary);
  cases.push({name:'actual VAE855 Rect mean -> manager capture/package -> live direct owner normalize -> package -> live restore -> package',passed:true,values:128,roundTripMaxAbs:roundTrip,predeclaredGate:reference.roundTripMaxAbs,artifacts:[input.summary,savedNorm.summary,savedRestored.summary],normalizeEvidence:norm.result.evidence,restoreEvidence:restore.result.evidence});
  const c=new MessageChannel(),detach=attachDiffusionPort(c.port1,api);c.port2.start();let pending=new Map();c.port2.addEventListener('message',e=>{const f=pending.get(e.data.jobId);if(f){pending.delete(e.data.jobId);f(e.data);}});
  const portRequest=q=>new Promise(resolve=>{pending.set(q.jobId,resolve);c.port2.postMessage(q);});
  try{
   const q={protocolVersion:PROTOCOL_VERSION,buildId:BUILD_ID,sessionId:api.sessionId,jobId:'p2-port',inputRevision:1,op:'normalizeRawMean',input:{tensor:input.tensor}};const original=input.tensor.data.slice(),reply=await portRequest(q);assert(reply.status==='ok','Rect Port rejected');reply.result.tensor.data.forEach((v,i)=>assert(Object.is(v,reference.normalized[i]),'Port allvalue mismatch'));assert(eq([...input.tensor.data],[...original])&&input.tensor.data.byteLength===512,'Port input was mutated/detached');cases.push({name:'explicit MessagePort Rect all128 normalized values and caller input ownership',passed:true,evidence:reply.result.evidence});
  }finally{detach();c.port1.close();c.port2.close();assert(pending.size===0,'Unsettled Port request');}
  const declared=structuredClone(input.tensor);declared.context={schemaVersion:1,contextId:'p2-declared-order',inputId:'metadata-order-fixture',inputSha256:reference.source.sha256,slotId:'slot-order-test',sourceFrameIndices:[9,2,9],sourceFrameTimesSeconds:[.9,.2,.9]};
  const contextNorm=await invoke('normalizeRawMean',declared),contextStored=await save('context-order-fixture',contextNorm.result.tensor,contextNorm),contextRestored=await invoke('restoreRawMean',contextStored.tensor);assert(eq(contextRestored.result.tensor.context,declared.context),'Ordered duplicate context frames changed');
  cases.push({name:'declared metadata-only fixture preserves frame order/duplicates through Hike and manager package, arbitrary metadata remains outside native',passed:true,context:declared.context,mediaAuthenticityProven:false});
  for(const tensor of [{...raw,profileId:'wan21-raw-f32-5x16x16'},{...raw,shape:[1,16,2,1,4]},{...raw,meaning:'wan21-raw-generated-sample:v1'},{...declared,context:{...declared.context,unknownNativeField:true}}]){
   const r=await api.request({protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'p2-negative-'+(++sequence),inputRevision:1,op:'normalizeRawMean',input:{tensor}});assert(r.status==='error','Wrong mean shape/meaning/profile/unknown native context accepted');
  }
  cases.push({name:'same128 incompatible axes, F5 identity, generated meaning and unsupported native context rejected',passed:true});
  const cancelledInput=structuredClone(input.tensor),cancelled=await invoke('normalizeRawMean',cancelledInput,{cancel:true});assert(cancelledInput.data.byteLength===512,'Cancel detached caller input');const after=await invoke('normalizeRawMean',input.tensor);after.result.tensor.data.forEach((v,i)=>assert(Object.is(v,reference.normalized[i]),'Cancelled worker reuse mismatch'));
  await queue.drain();const queueState=queue.inspect();assert(maxActive===1&&store.size===0,'Owner queue/store retained resources');assert(queueState.groups.every(g=>!g.quarantined&&g.activeInvocationId===null&&g.queued.length===0),'Queue retained an active or quarantined owner');const cancelledRecord=queueState.invocations.find(r=>r.state==='cancelled');assert(cancelledRecord&&!cancelledRecord.resultAccepted&&cancelledRecord.originalTerminal&&cancelledRecord.stopAcknowledged&&cancelledRecord.calculationStopped&&cancelledRecord.resourceReleased&&cancelledRecord.reusable,'Cancel/terminal/release barriers not established');
  for(const op of ['predict','sample']){const r=await api.request({protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'p2-'+op,inputRevision:1,op,input:{}});assert(r.error?.code==='NOT_READY','Mean boundary enabled generation');}
  cases.push({name:'manager queue cancellation observes original terminal/release, worker recreation returns exact values',passed:true,cancelled,queueState,releaseEvents:events});
  const transformEdges=[{chainId:'p2-real-rect-mean',inputArtifactId:input.summary.id,inputPayloadSha256:input.summary.payloadSha256,operation:responseIdentity(norm),numericReceipt:norm.result.evidence,outputArtifactId:savedNorm.summary.id,outputPayloadSha256:savedNorm.summary.payloadSha256},{chainId:'p2-real-rect-mean',inputArtifactId:savedNorm.summary.id,inputPayloadSha256:savedNorm.summary.payloadSha256,operation:responseIdentity(restore),numericReceipt:restore.result.evidence,outputArtifactId:savedRestored.summary.id,outputPayloadSha256:savedRestored.summary.payloadSha256}];
  const disposal=await queue.dispose();assert(disposal.disposed&&disposal.quarantined.length===0,'Owner queue disposal incomplete');await owner.dispose();api.dispose();
  return {passed:true,nativeBuildId:BUILD_ID,cases,transformEdges,sourceInputSha256:reference.source.sha256,profileId:reference.profileId,roundTripMaxAbs:roundTrip,ownerScope:'Diffusion Rect normalization/restoration only',managerCatalogRuntimeAdoption:false,managerUIAccepted:false,vaeFreshDecodeExecuted:false,generatedSampleAccepted:false,pointwiseLimitUnchanged:cap.result.maxTensorElements,cleanup:{queueDisposed:disposal.disposed,queueQuarantined:disposal.quarantined,storeReferences:store.size,ownerAdapterDisposed:true,ownedWorkerDisposed:true,portRequestsSettled:true},packageFiles:allFiles};
 }finally{for(const h of handles)try{releaseArtifactHandle(h,store);}catch{}store.clear();await queue.dispose();await owner.dispose();api.dispose();}
}
