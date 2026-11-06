/** Proposed standalone management workspace API. Uses the existing E4 package
 * verifier, canonical hashes, native codecs and attachment bindings. No owner
 * session, File grant, capability token or numerical PASS is restored. */
import {zipSync,unzipSync} from '../ft/vendor/fflate.mjs';
import {canonicalBytes,sha256Bytes} from './canonical.mjs';
import {PACKAGE_VERSION,writeArtifactPackage,readArtifactPackage} from './package.mjs';
import {createOwnedArtifactStore,captureNativeTensor,exportBinaryAssets} from './adapters/artifacts.mjs';
import {createWorkspaceCodec} from './codecs/workspace-wktensor.mjs';

export const MANAGEMENT_WORKSPACE_VERSION='works-management-workspace/1';
const key='works:management-workspace',schemaId='works:management-workspace';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const clone=structuredClone;
function same(a,b){if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){if(a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.every((v,i)=>v===y[i]);}const x=Object.keys(a).sort(),y=Object.keys(b).sort();return x.length===y.length&&x.every((k,i)=>k===y[i]&&same(a[k],b[k]));}
function checkDeclaration(record){const {descriptor:d,tensor:t}=record;if(!same(d.tensor?.shape,t.shape)||d.tensor.dtype!==t.dtype||d.tensor.axes?.join('')!==t.layout||d.tensor.nativeMeaning!==t.meaning)fail('WORKSPACE_DESCRIPTOR_MISMATCH','Explicit common shape/dtype/axes/meaning differs from durable tensor');for(const [k,v] of Object.entries(d.native?.metadata??{}))if(Object.hasOwn(t,k)&&!same(v,t[k]))fail('WORKSPACE_DESCRIPTOR_MISMATCH','Explicit native metadata contradicts actual tensor: '+k);}
function checkSnapshot(descriptor,snapshot,management){
 if(!management||management.kind==='explicit-bypass')return;
 const target=management.target,terminal=management.terminal;
 if(!snapshot||!target||!terminal||management.snapshotId!==descriptor.snapshotId||snapshot.snapshotId!==descriptor.snapshotId||snapshot.managerSessionId!==target.managerSessionId||snapshot.managerRevision!==target.managerRevision||!snapshot.stepBindings?.some(s=>s.operationId===management.operationId&&s.moduleId===target.resourceBinding?.ownerId&&s.localRevisionBindings?.invocation===target.managerRevision&&same(s.resourceBinding,target.resourceBinding))||terminal.requestId!==target.requestId||terminal.revision!==target.managerRevision||terminal.activeToken!==target.activeToken||terminal.ownerId!==target.resourceBinding?.ownerId||terminal.resourceBinding!==target.resourceBinding?.bindingId||terminal.resourceGeneration!==target.resourceBinding?.resourceGeneration||terminal.originalTerminal!==true||terminal.resourceReleased!==true||terminal.resultAccepted!==true)fail('WORKSPACE_SNAPSHOT_BINDING','Snapshot must bind the retained management operation, exact target, original terminal and released resource');
}
// These are declarations for format interpretation, never owner capabilities.
function registryFor(registry,codec){return {...registry,schemas:[...(registry?.schemas??[]),{schemaId,schemaVersion:'1'}],codecs:[...(registry?.codecs??[]),codec]};}
function safeFiles(values){return values.map(v=>{if(!v||typeof v!=='object')fail('WORKSPACE_FILE_METADATA','File requirements must be explicit metadata');const out={};for(const k of ['id','ref','role','name','size','type','lastModified'])if(v[k]!==undefined)out[k]=v[k];return {...out,reselectRequired:true,originalFileEmbedded:false};});}
function encodeMetadata(value,store,path='workspace',seen=new Set()){
 if(value instanceof Blob||typeof value==='function'||typeof value==='symbol'||typeof value==='bigint')fail('WORKSPACE_RUNTIME_VALUE','Runtime File/Blob, functions and capabilities cannot be serialized as workspace metadata');
 if(value instanceof ArrayBuffer||ArrayBuffer.isView(value)){const ref=store.put(value,path);return {binaryRef:ref,byteLength:value.byteLength,type:value.constructor.name};}
 if(value===null||typeof value!=='object')return value;
 if(seen.has(value))fail('WORKSPACE_RUNTIME_VALUE','Cyclic workspace metadata is unsupported');seen.add(value);
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)fail('WORKSPACE_RUNTIME_VALUE','Only plain metadata, arrays and explicitly bound binary attachments are persistent');
 const out=Array.isArray(value)?value.map((v,i)=>encodeMetadata(v,store,path+'/'+i,seen)):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encodeMetadata(v,store,path+'/'+k,seen)]));seen.delete(value);return out;
}
export async function buildManagementBundle({state,artifacts,fileRequirements=[],codec=createWorkspaceCodec(),registry,settings,kind='partial',fileBindings}={}){
 if(!state?.profile||!artifacts||!Object.keys(artifacts).length)fail('WORKSPACE_INPUT_REQUIRED','A configured pipeline and at least one durable tensor are required');
 // Own everything before the first asynchronous encode or digest.
 const savedState=clone(state),records=clone(artifacts),store=createOwnedArtifactStore(),assets=new Map(),files=[],bindings=[],payloadBindings=[],binaryBindings=[];
 const requirements=safeFiles(fileRequirements.length?fileRequirements:Object.values(fileBindings??{}));
 const workspace={version:MANAGEMENT_WORKSPACE_VERSION,state:savedState,fileRequirements:requirements,settings:clone(settings??savedState.workspaceSettings??{}),kind,artifactRefs:[]};
 const nativeCodec={codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:clone(codec.sourceRef)};
 const add=(path,kind,bytes)=>{assets.set(path,new Uint8Array(bytes));files.push({path,kind,required:true});};
 try{
  let index=0;
  for(const [ref,record] of Object.entries(records)){
   if(!record?.tensor||!record?.descriptor)fail('WORKSPACE_TENSOR_REQUIRED','Durable tensor and explicit common descriptor required for '+ref);
   checkDeclaration(record);
   const root='artifacts/'+index++,nativePath=root+'/tensor.wktensor',original=clone(record.descriptor);
   const handle=captureNativeTensor({tensor:record.tensor,descriptor:original,store});
   // Capture snapshots binary metadata, but never replace existing multi-owner
   // provenance or ordered frame lineage with guesses from a single native field.
   const descriptor=handle.descriptor;descriptor.native.metadata={...encodeMetadata(original.native.metadata,store,root+'/declaration'),...descriptor.native.metadata};descriptor.provenance=encodeMetadata(original.provenance,store,root+'/provenance');descriptor.lineage=encodeMetadata(original.lineage,store,root+'/lineage');
   const payloadRef='workspace:'+ref;descriptor.native.payloadRef=payloadRef;descriptor.tensor.dataRef=payloadRef;
   const snapshot=record.snapshot??savedState.snapshots?.find(s=>s.snapshotId===descriptor.snapshotId)??null;
   if(descriptor.snapshotId!==null&&!snapshot)fail('WORKSPACE_SNAPSHOT_REQUIRED','Actual published snapshot required for '+ref);
   checkSnapshot(descriptor,snapshot,record.management);
   const evidence=encodeMetadata(record.evidence??{schemaVersion:1,artifactId:descriptor.artifactId,records:[],absentReason:'Ordinary control execution: numerical receipts are not required or synthesized.'},store,root+'/evidence');
   const trace=encodeMetadata(record.trace??{schemaVersion:1,artifactId:descriptor.artifactId,records:[]},store,root+'/trace');
   const metadata={descriptor,evidence,trace,snapshot:encodeMetadata(snapshot,store,root+'/snapshot'),extensions:descriptor.extensions};
   const paths={nativePath};add(nativePath,'native',await codec.encode(record.tensor));
   for(const [name,value] of Object.entries(metadata)){const path=root+'/'+name+'.json';paths[name+'Path']=path;add(path,name,canonicalBytes(value));}
   bindings.push({artifactId:descriptor.artifactId,...paths,codec:nativeCodec});payloadBindings.push({ref:payloadRef,artifactId:descriptor.artifactId,nativePath,kind:'decoded-tensor-data'});
   workspace.artifactRefs.push({ref,artifactId:descriptor.artifactId,management:record.management??null,sourceRecords:record.sourceRecords??[],fileBinding:record.fileBinding?{...safeFiles([record.fileBinding])[0]}:null});
  }
  const extension={schemaId,schemaVersion:'1',requiredForUse:true,data:encodeMetadata(workspace,store)};
  for(const [binaryRef,bytes] of exportBinaryAssets(extension,store)){
   // The extension visitor sees workspace metadata; artifact sidecars are
   // scanned below as JSON so no binary marker is missed.
   const path='attachments/'+binaryBindings.length+'.bin';add(path,'attachment',bytes);const value=findMarker(extension,binaryRef);binaryBindings.push({binaryRef,path,type:value.type,byteLength:value.byteLength});
  }
  for(const file of [...files].filter(f=>f.kind!=='native'&&f.kind!=='attachment')){
   const value=JSON.parse(new TextDecoder().decode(assets.get(file.path)));
   for(const [binaryRef,bytes] of exportBinaryAssets(value,store))if(!binaryBindings.some(b=>b.binaryRef===binaryRef)){const marker=findMarker(value,binaryRef),path='attachments/'+binaryBindings.length+'.bin';add(path,'attachment',bytes);binaryBindings.push({binaryRef,path,type:marker.type,byteLength:marker.byteLength});}
  }
  const manifest={packageVersion:PACKAGE_VERSION,packageId:'management:'+crypto.randomUUID(),artifacts:bindings,files,payloadBindings,binaryBindings,extensions:{[key]:extension}};
  const written=new Map(),trusted=registryFor(registry,codec),receipt=await writeArtifactPackage(manifest,assets,{registry:trusted,write:async(path,bytes)=>written.set(path,bytes)});
  // Validate actual bytes and codec readback before making a downloadable bundle.
  const checked=await readArtifactPackage({read:async path=>written.get(path)??null},trusted);
  if(checked.issues.some(i=>i.code!=='EVIDENCE_NOT_RECORDED'))fail('WORKSPACE_UNVERIFIED',JSON.stringify(checked.issues));
  return {bytes:zipSync(Object.fromEntries(written),{level:0}),manifest:JSON.parse(new TextDecoder().decode(written.get('manifest.json'))),receipt};
 }finally{store.clear();}
}
function findMarker(value,ref){if(value&&typeof value==='object'){if(value.binaryRef===ref)return value;for(const v of Object.values(value)){const found=findMarker(v,ref);if(found)return found;}}return null;}
export async function readManagementBundle(bytes,{registry,codec=createWorkspaceCodec(),maxUnpackedBytes=1073741824}={}){
 if(!(bytes instanceof Uint8Array))fail('WORKSPACE_BYTES_REQUIRED','Actual ZIP bytes required');
 let total=0;const names=new Set();
 const entries=unzipSync(new Uint8Array(bytes),{filter:file=>{if(names.has(file.name)||file.name.startsWith('/')||file.name.split('/').some(v=>v==='..'||v==='')||file.name.includes('\\'))fail('WORKSPACE_ARCHIVE_PATH','Duplicate or unsafe archive entry');names.add(file.name);total+=file.originalSize;if(!Number.isSafeInteger(total)||total>maxUnpackedBytes)fail('WORKSPACE_ARCHIVE_BUDGET','Workspace archive exceeds explicit unpacked-byte allowance');return true;}});
 const result=await readArtifactPackage({read:async path=>entries[path]??null},registryFor(registry,codec));
 if(result.issues.some(i=>i.code!=='EVIDENCE_NOT_RECORDED'))fail('WORKSPACE_UNVERIFIED',JSON.stringify(result.issues));
 const workspace=result.restoredPackageExtensions?.[key]?.data;if(workspace?.version!==MANAGEMENT_WORKSPACE_VERSION)fail('WORKSPACE_VERSION','Unknown or missing workspace version');
 const artifacts={};for(const mapping of workspace.artifactRefs){const r=result.artifacts.find(r=>r.binding.artifactId===mapping.artifactId);if(!r?.restoredNative)fail('WORKSPACE_TENSOR_REQUIRED','Saved artifact bytes were not decoded');const descriptor=clone(r.restoredDescriptor);checkSnapshot(descriptor,r.restoredSnapshot,mapping.management);artifacts[mapping.ref]={descriptor,tensor:clone(r.restoredNative),snapshot:clone(r.restoredSnapshot),evidence:clone(r.restoredEvidence),trace:clone(r.restoredTrace),management:clone(mapping.management),sourceRecords:clone(mapping.sourceRecords),...(mapping.fileBinding?{fileBinding:{...mapping.fileBinding,requiresReselection:false,durablePayloadRestored:true}}:{})};}
 const state=workspace.state,fileRequirements=safeFiles(workspace.fileRequirements??[]),restore={profile:clone(state.profile),selections:clone(state.selections??{}),records:clone(artifacts),snapshotMetadata:clone(state.snapshots??[])};
 return {state,artifacts,restore,fileRequirements,settings:workspace.settings,kind:workspace.kind,receipt:result.receipt,manifest:result.manifest,issues:result.issues,status:'restored',sha256:await sha256Bytes(bytes)};
}
