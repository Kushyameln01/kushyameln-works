/** E4 persistence of the five distinct owner outputs. No native execution or
 * numerical judgement occurs here. The codec is the adopted byte-exact 2bd one. */
import {canonicalBytes,canonicalize,sha256Bytes} from '../../canonical.mjs';
import {PACKAGE_VERSION,writeArtifactPackage,readArtifactPackage} from '../../package.mjs';
import {createAdoptedWktensorCodec} from '../../codecs/wktensor.mjs';
import {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor,exportBinaryAssets,releaseArtifactHandle} from '../artifacts.mjs';
import {N2_TAIL_OUTPUTS,N2_TAIL_PROFILE_ID,N2_TAIL_PINS} from './declarations.mjs';
export {N2_TAIL_OUTPUTS};
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const same=(a,b)=>canonicalize(a)===canonicalize(b);
const codec=createAdoptedWktensorCodec();
const schemaId='works:n2-tail-output',semanticId='works:self-attention-post-token-hidden';
const registry={schemas:[{schemaId,schemaVersion:'1'},{schemaId:semanticId,schemaVersion:'1'}],roles:[],codecs:[codec]};
const raw=data=>new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
const boundary=async({signal,ensureCurrent})=>{signal?.throwIfAborted();await ensureCurrent?.();signal?.throwIfAborted();};
export async function readN2TailOutputPackage(storage){
 const result=await readArtifactPackage(storage,registry);
 if(result.status!=='complete')fail('N2_TAIL_PACKAGE_UNVERIFIED','The complete five-output package did not pass E4 readback');
 const names=result.artifacts.map(a=>a.descriptor.native.metadata.outputName);
 if(names.length!==5||new Set(names).size!==5||Object.keys(N2_TAIL_OUTPUTS).some(n=>!names.includes(n)))fail('N2_TAIL_OUTPUTS_MISSING','All five distinct named outputs are required');
 for(const a of result.artifacts){const name=a.descriptor.native.metadata.outputName,s=N2_TAIL_OUTPUTS[name],m=a.descriptor.native.metadata;
  if(a.descriptor.artifactId!==result.manifest.packageId+'#'+name||!same(a.native.shape,s.shape)||a.native.dtype!=='float32'||a.native.layout!==s.axes.join('')||a.native.meaning!==s.nativeMeaning||a.descriptor.profileRef!==N2_TAIL_PROFILE_ID||!same(m.dtypeAdapter,{nativeDtype:'F32',storageDtype:'float32',operation:'metadata-spelling-only; identical IEEE754 binary32 bits'}))fail('N2_TAIL_OUTPUT_IDENTITY_MISMATCH','Output name, hidden meaning, profile or same-bits dtype metadata differs');
 }
 return result;
}
/** storage must write to a fresh destination and read actual persisted bytes.
 * Cache adoption is a separate post-admission operation using the E5 API.
 * artifactRef names the package; its principal output is artifactRef#residual. */
export function createN2TailOutputPublisher({storage,artifactRef,receiptRef,ownerId,sourceRef=N2_TAIL_PINS.sourceRef,extensions={},cache}={}){
 if(cache!==undefined)fail('N2_TAIL_CACHE_POST_ADMISSION_REQUIRED','Publish E4 first, then explicitly cache the accepted package after norm publication');
 if(typeof storage?.write!=='function'||typeof storage?.read!=='function'||![artifactRef,receiptRef,ownerId].every(x=>typeof x==='string'&&x))fail('N2_TAIL_STORAGE_REQUIRED','Explicit fresh storage, readback and owned artifact/receipt identities required');
 return async function publishN2TailOutput(args){
  await boundary(args);
  // Copy all arrays and metadata before the first digest yields. Shared backing
  // memory is not an owned snapshot and cannot acquire a storage receipt.
  const arrays={},binding=structuredClone(args.outputBinding),evidence=structuredClone(args.output?.evidence),validationReceipt=structuredClone(args.validationReceipt),target=structuredClone(args.target),extra=structuredClone(extensions);
  for(const [name,s]of Object.entries(N2_TAIL_OUTPUTS)){
   const value=args.output?.arrays?.[name],b=binding?.arrays?.[name];
   if(!(value instanceof Float32Array)||value.buffer.resizable||typeof SharedArrayBuffer!=='undefined'&&value.buffer instanceof SharedArrayBuffer||value.length!==s.shape.reduce((a,b)=>a*b,1)||value.some(v=>!Number.isFinite(v))||!b||!same(b.shape,s.shape)||b.dtype!=='float32'||b.byteLength!==value.byteLength||b.layout!==undefined&&b.layout!==s.axes.join('')||b.meaning!==undefined&&b.meaning!==s.nativeMeaning)fail('N2_TAIL_OUTPUT_IDENTITY_MISMATCH','Exact owned F32 output and binding required: '+name);
   arrays[name]=new Float32Array(value);
  }
  if(!evidence||typeof evidence!=='object'||!validationReceipt)fail('N2_TAIL_EVIDENCE_REQUIRED','Native evidence and an explicit validation receipt must be preserved');
  for(const [name,data]of Object.entries(arrays))if(await sha256Bytes(raw(data))!==binding.arrays[name].sha256)fail('N2_TAIL_OUTPUT_HASH_MISMATCH','Actual output bytes changed: '+name);
  if(binding.artifactRef!==undefined&&binding.artifactRef!==artifactRef+'#residual'||binding.sha256!==binding.arrays.residual.sha256)fail('N2_TAIL_OUTPUT_HASH_MISMATCH','Principal output identity must be the actual residual bits');
  await boundary(args);
  const store=createOwnedArtifactStore(),handles=[],assets=new Map(),files=[],artifacts=[],payloadBindings=[],binaryBindings=[];
  try{
   for(const [name,s]of Object.entries(N2_TAIL_OUTPUTS)){
    const id=artifactRef+'#'+name,tensor={dtype:'float32',shape:s.shape,layout:s.axes.join(''),meaning:s.nativeMeaning,data:arrays[name]};
    const descriptor={contractVersion:'works-module-contract/1.0-draft.1',artifactId:id,kind:'tensor',profileRef:N2_TAIL_PROFILE_ID,native:{schemaId,schemaVersion:'1',payloadRef:'pending',metadata:{}},semantics:{schemaId:semanticId,schemaVersion:'1',spaceId:'bernini:block0:self-attention-tail:'+name},tensor:{dtype:'float32',shape:s.shape,axes:s.axes,nativeMeaning:s.nativeMeaning,dataRef:'pending'},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[],sourceRef},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId,mode:'copy'},extensions:extra};
    const handle=captureNativeTensor({tensor,response:{evidence},descriptor,extensions:extra,store});handles.push(handle);
    const d=structuredClone(handle.descriptor);d.native.metadata={...d.native.metadata,outputName:name,dtypeAdapter:{nativeDtype:'F32',storageDtype:'float32',operation:'metadata-spelling-only; identical IEEE754 binary32 bits'},sourceRef};
    const records={schemaVersion:1,artifactId:id,records:[{evidenceId:'n2-tail:native-output-and-validation',data:{outputName:name,nativeEvidence:evidence,validationReceipt,outputBinding:binding,target,sourceRef}}]};
    // Binary evidence and extensions use capture/export's owned marker contract.
    const metadataHandle=captureNativeTensor({tensor,response:{},descriptor:{...d,native:{...d.native,metadata:{}},extensions:{...extra,'n2:opaque-evidence':{schemaId:'works:n2-tail-opaque-evidence',schemaVersion:'1',requiredForUse:false,data:records}}},store});handles.push(metadataHandle);
    const opaque=metadataHandle.descriptor.extensions;d.extensions=opaque;const preservedRecords=opaque['n2:opaque-evidence'].data;
    const path=name+'/output.wktensor';d.native.payloadRef=path;d.tensor.dataRef=path;
    const sidecars=[['output.wktensor','native',await codec.encode(restoreNativeTensor(handle,store))],['descriptor.json','descriptor',canonicalBytes(d)],['evidence.json','evidence',canonicalBytes(preservedRecords)],['trace.json','trace',canonicalBytes({schemaVersion:1,artifactId:id,records:[]})],['snapshot.json','snapshot',canonicalBytes(null)],['extensions.json','extensions',canonicalBytes(d.extensions)]];
    for(const [file,kind,bytes]of sidecars){const p=name+'/'+file;assets.set(p,bytes);files.push({path:p,kind,required:true});}
    for(const [ref,bytes]of exportBinaryAssets({descriptor:d,evidence:preservedRecords},store)){
     if(binaryBindings.some(b=>b.binaryRef===ref))continue;
     const p='attachments/'+binaryBindings.length+'.bin',value=store.get(ref);assets.set(p,bytes);files.push({path:p,kind:'attachment',required:true});binaryBindings.push({binaryRef:ref,path:p,type:value.constructor.name,byteLength:bytes.byteLength});
    }
    artifacts.push({artifactId:id,nativePath:path,descriptorPath:name+'/descriptor.json',evidencePath:name+'/evidence.json',tracePath:name+'/trace.json',snapshotPath:name+'/snapshot.json',extensionsPath:name+'/extensions.json',codec:{codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:codec.sourceRef}});payloadBindings.push({ref:path,artifactId:id,nativePath:path,kind:'decoded-tensor-data'});
   }
   const manifest={packageVersion:PACKAGE_VERSION,packageId:artifactRef,artifacts,files,extensions:{},payloadBindings,binaryBindings};
   const packageReceipt=await writeArtifactPackage(manifest,assets,{registry,write:async(path,bytes)=>{await boundary(args);await storage.write(path,bytes);}});await boundary(args);
   const restored=await readN2TailOutputPackage(storage);await boundary(args);
   if(!same(restored.receipt,packageReceipt))fail('N2_TAIL_PACKAGE_RECEIPT_MISMATCH','Actual readback must retain the exact written manifest and all provenance/evidence/extension bytes');
   for(const a of restored.artifacts){const name=a.descriptor.native.metadata.outputName;if(await sha256Bytes(raw(a.native.data))!==binding.arrays[name].sha256)fail('N2_TAIL_OUTPUT_HASH_MISMATCH','Persisted output bits differ: '+name);}
   await boundary(args);args.onProgress?.({phase:'n2-tail-package-readback',outputCount:5});
   return {status:'complete',artifactRef:artifactRef+'#residual',profileRef:N2_TAIL_PROFILE_ID,payloadSha256:binding.arrays.residual.sha256,arraysBinding:binding.arrays,receiptRef,packageReceipt,readbackVerified:true};
  }finally{for(const h of handles)releaseArtifactHandle(h,store);store.clear();}
 };
}
