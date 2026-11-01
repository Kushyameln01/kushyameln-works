/** Management persistence of named owner arrays. This does not perform model math
 * or assign native owner meanings that the bare-array API never exported. */
import {canonicalBytes,canonicalize,sha256Bytes} from '../../canonical.mjs';
import {PACKAGE_VERSION,writeArtifactPackage,readArtifactPackage} from '../../package.mjs';
import {createAdoptedWktensorCodec} from '../../codecs/wktensor.mjs';
import {createOwnedArtifactStore,captureNativeTensor,restoreNativeTensor,exportBinaryAssets,releaseArtifactHandle} from '../artifacts.mjs';
import {P4_PROFILE_ID,p4OutputSpecs} from './declarations.mjs';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const same=(a,b)=>canonicalize(a)===canonicalize(b),raw=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
const codec=createAdoptedWktensorCodec(),schemaId='works:p4-manager-output',semanticSchema='works:p4-manager-output-semantics';
const registry={schemas:[{schemaId,schemaVersion:'1'},{schemaId:semanticSchema,schemaVersion:'1'}],roles:[],codecs:[codec]};
const authority='management-sidecar/owner-named-output';
const dtypeAdapter={nativeDtype:'Float32Array/IEEE754-binary32',storageDtype:'float32',operation:'management wrapper; identical IEEE754 binary32 bits'};
const boundary=async({signal,ensureCurrent})=>{signal?.throwIfAborted();await ensureCurrent?.();signal?.throwIfAborted();};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
// The common E4 JSON envelopes preserve ordinary JSON and explicit binary
// attachments. Owner metadata additionally supports graphs/types that JSON
// cannot replay. Keep the owner's exact encoding for that dependent scope.
function jsonAndBinary(value,ancestors=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value)&&!Object.is(value,-0);
 if(!value||typeof value!=='object')return false;
 if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return true;
 if(ancestors.has(value))return false;
 const proto=Object.getPrototypeOf(value);
 if(proto!==Object.prototype&&proto!==null&&proto!==Array.prototype)return false;
 if(Array.isArray(value)&&(Object.keys(value).length!==value.length||Object.keys(value).some((key,index)=>key!==String(index))))return false;
 ancestors.add(value);const valid=Object.values(value).every(v=>jsonAndBinary(v,ancestors));ancestors.delete(value);return valid;
}

export async function readP4OutputPackage(storage){
 const result=await readArtifactPackage(storage,registry);
 if(result.status!=='complete')fail('P4_PACKAGE_UNVERIFIED','Complete persisted P4 output package required');
 if(result.artifacts.length!==25)fail('P4_OUTPUT_IDENTITY_MISMATCH','All25 named owner outputs required; output alias is not an artifact');
 const rows=result.artifacts[0]?.descriptor.native.metadata.textRows,specs=p4OutputSpecs(rows),names=result.artifacts.map(a=>a.descriptor.native.metadata.outputName);
 if(new Set(names).size!==25||Object.keys(specs).some(name=>!names.includes(name)))fail('P4_OUTPUT_IDENTITY_MISMATCH','Exact25 named outputs required');
 for(const artifact of result.artifacts){
  const metadata=artifact.descriptor.native.metadata,name=metadata.outputName,spec=specs[name];
  if(!spec||artifact.descriptor.artifactId!==result.manifest.packageId+'#'+name||artifact.descriptor.profileRef!==P4_PROFILE_ID||artifact.descriptor.native.schemaId!==schemaId||!same(artifact.native.shape,spec.shape)||artifact.native.dtype!=='float32'||artifact.native.layout!==spec.axes.join('')||artifact.native.meaning!==spec.semanticId||metadata.textRows!==rows||metadata.ownerNativeMeaning!==null||metadata.meaningAuthority!==authority||!same(metadata.dtypeAdapter,dtypeAdapter))fail('P4_OUTPUT_IDENTITY_MISMATCH','Named output shape, management semantic authority or byte wrapper differs');
 }
 return result;
}

export function createP4OutputPublisher({storage,artifactRef,receiptRef,ownerId,textRows,sourceRef,provenance,lineage,extensions={}}={}){
 const specs=p4OutputSpecs(textRows);
 if(typeof storage?.write!=='function'||typeof storage?.read!=='function'||![artifactRef,receiptRef,ownerId].every(v=>typeof v==='string'&&v)||!plain(sourceRef)||!plain(provenance)||!plain(lineage))fail('P4_STORAGE_REQUIRED','Fresh actual storage, source, explicit provenance and lineage required');
 const configured=structuredClone({sourceRef,provenance,lineage,extensions});
 return async function publishP4Output(args){
  args.signal?.throwIfAborted();
  const binding=structuredClone(args.outputBinding),evidence=structuredClone(args.output?.evidence),validationReceipt=structuredClone(args.validationReceipt),target=structuredClone(args.target),arrays={},extra=structuredClone(configured.extensions);
  const metadata={};for(const field of ['inputMetadata','trace','snapshot'])if(Object.hasOwn(args,field))metadata[field]=structuredClone(args[field]);
  const names=Object.keys(args.output?.arrays??{});
  if(names.length!==25||Object.keys(specs).some(name=>!Object.hasOwn(args.output.arrays,name))||!binding?.arrays||Object.keys(binding.arrays).length!==25)fail('P4_OUTPUT_IDENTITY_MISMATCH','Exact25 named arrays and bindings required');
  for(const [name,spec] of Object.entries(specs)){
   const value=args.output.arrays[name],b=binding.arrays[name],elements=spec.shape.reduce((a,b)=>a*b,1);
   if(Object.getPrototypeOf(value??{})!==Float32Array.prototype||!(value.buffer instanceof ArrayBuffer)||value.buffer.resizable||value.byteOffset!==0||value.byteLength!==value.buffer.byteLength||value.length!==elements||!value.every(Number.isFinite)||!b||b.dtype!=='float32'||!same(b.shape,spec.shape)||b.byteLength!==value.byteLength||b.layout!==spec.axes.join('')||b.meaning!==spec.semanticId)fail('P4_OUTPUT_IDENTITY_MISMATCH','Exact owned output shape/meaning/binding required: '+name);
   arrays[name]=new Float32Array(value);
  }
  if(!plain(evidence)||!plain(validationReceipt))fail('P4_EVIDENCE_REQUIRED','Explicit native evidence and validation receipt required');
  const encoded=metadata.inputMetadata?.conditioning?.ownerEncodedMetadata,encodedHash=metadata.inputMetadata?.conditioning?.ownerEncodedMetadataSHA256;
  let rawJsonPreserved=true;
  for(const condition of [evidence.conditioning,validationReceipt.nativeEvidence?.conditioning,metadata.inputMetadata?.conditioning]){
   if(!condition||!Object.hasOwn(condition,'metadata')||jsonAndBinary(condition.metadata))continue;
   if(Object.getPrototypeOf(encoded??{})!==Uint8Array.prototype||!(encoded.buffer instanceof ArrayBuffer)||typeof encodedHash!=='string')fail('P4_METADATA_ENCODING_REQUIRED','Non-JSON owner metadata requires its exact owner-encoded bytes/hash');
   condition.metadata={storageRepresentation:'owner-encoded-opaque',encoding:'bernini-p4-conditioning-metadata/0.1',sha256:encodedHash,byteLength:encoded.byteLength};rawJsonPreserved=false;
  }
  if(![evidence,validationReceipt,metadata,extra,configured.provenance,configured.lineage].every(v=>jsonAndBinary(v)))fail('P4_METADATA_UNSERIALIZABLE','Non-JSON outer metadata must not be silently flattened or dropped');
  const metadataStorage={rawJsonPreserved,ownerEncodedMetadataRetained:encoded!==undefined,operationalReplay:'NOT_VERIFIED'};
  if(encoded!==undefined&&(Object.getPrototypeOf(encoded)!==Uint8Array.prototype||!(encoded.buffer instanceof ArrayBuffer)||await sha256Bytes(encoded)!==encodedHash))fail('P4_METADATA_ENCODING_MISMATCH','Owner metadata encoding bytes differ from explicit hash');
  for(const [name,data] of Object.entries(arrays))if(await sha256Bytes(raw(data))!==binding.arrays[name].sha256)fail('P4_OUTPUT_HASH_MISMATCH','Actual output bits differ: '+name);
  if(binding.artifactRef!==artifactRef+'#blockOutput'||binding.sha256!==binding.arrays.blockOutput.sha256)fail('P4_OUTPUT_HASH_MISMATCH','Principal output must bind actual blockOutput bits');
  await boundary(args);
  const store=createOwnedArtifactStore(),handles=[],assets=new Map(),files=[],artifacts=[],payloadBindings=[],binaryBindings=[];
  try{
   for(const [name,spec] of Object.entries(specs)){
    const id=artifactRef+'#'+name,tensor={dtype:'float32',shape:spec.shape,layout:spec.axes.join(''),meaning:spec.semanticId,data:arrays[name]};
    const descriptor={contractVersion:'works-module-contract/1.0-draft.1',artifactId:id,kind:'tensor',profileRef:P4_PROFILE_ID,native:{schemaId,schemaVersion:'1',payloadRef:'pending',metadata:{}},semantics:{schemaId:semanticSchema,schemaVersion:'1',spaceId:spec.semanticId},tensor:{dtype:'float32',shape:spec.shape,axes:spec.axes,nativeMeaning:spec.semanticId,dataRef:'pending'},provenance:configured.provenance,lineage:configured.lineage,snapshotId:null,ownership:{ownerId,mode:'copy'},extensions:extra};
    const handle=captureNativeTensor({tensor,response:{evidence},descriptor,extensions:extra,store});handles.push(handle);
    const d=structuredClone(handle.descriptor);
    // The generic native capture derives single-producer fields from a tensor.
    // P4 returns bare arrays: its explicit multi-input management lineage is
    // supplied outside that native tensor and must survive this wrapper.
    d.provenance=structuredClone(configured.provenance);d.lineage=structuredClone(configured.lineage);
    d.native.metadata={...d.native.metadata,outputName:name,textRows,meaningAuthority:authority,ownerNativeMeaning:null,dtypeAdapter,sourceRef:configured.sourceRef};
    const records={schemaVersion:1,artifactId:id,records:[{evidenceId:'p4:owner-output-and-management-validation',data:{outputName:name,nativeEvidence:evidence,validationReceipt,outputBinding:binding,target,sourceRef:configured.sourceRef,metadataStorage,...metadata}}]};
    const opaque=captureNativeTensor({tensor,response:{},descriptor:{...d,native:{...d.native,metadata:{}},extensions:{...extra,'p4:opaque-evidence':{schemaId:'works:p4-manager-opaque-evidence',schemaVersion:'1',requiredForUse:false,data:records}}},store});handles.push(opaque);
    d.extensions=opaque.descriptor.extensions;const preserved=d.extensions['p4:opaque-evidence'].data,path=name+'/output.wktensor';d.native.payloadRef=path;d.tensor.dataRef=path;
    const trace={schemaVersion:1,artifactId:id,records:preserved.records[0].data.trace?.records??[]};
    const sidecars=[['output.wktensor','native',await codec.encode(restoreNativeTensor(handle,store))],['descriptor.json','descriptor',canonicalBytes(d)],['evidence.json','evidence',canonicalBytes(preserved)],['trace.json','trace',canonicalBytes(trace)],['snapshot.json','snapshot',canonicalBytes(null)],['extensions.json','extensions',canonicalBytes(d.extensions)]];
    for(const [file,kind,bytes] of sidecars){const p=name+'/'+file;assets.set(p,bytes);files.push({path:p,kind,required:true});}
    for(const [ref,bytes] of exportBinaryAssets({descriptor:d,evidence:preserved},store)){
     if(binaryBindings.some(b=>b.binaryRef===ref))continue;
     const path='attachments/'+binaryBindings.length+'.bin',value=store.get(ref);assets.set(path,bytes);files.push({path,kind:'attachment',required:true});binaryBindings.push({binaryRef:ref,path,type:value.constructor.name,byteLength:bytes.byteLength});
    }
    artifacts.push({artifactId:id,nativePath:path,descriptorPath:name+'/descriptor.json',evidencePath:name+'/evidence.json',tracePath:name+'/trace.json',snapshotPath:name+'/snapshot.json',extensionsPath:name+'/extensions.json',codec:{codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:codec.sourceRef}});payloadBindings.push({ref:path,artifactId:id,nativePath:path,kind:'decoded-tensor-data'});
   }
   const manifest={packageVersion:PACKAGE_VERSION,packageId:artifactRef,artifacts,files,extensions:{},payloadBindings,binaryBindings};
   const packageReceipt=await writeArtifactPackage(manifest,assets,{registry,write:async(path,bytes)=>{await boundary(args);await storage.write(path,bytes);}});await boundary(args);
   const restored=await readP4OutputPackage(storage);await boundary(args);
   if(!same(restored.receipt,packageReceipt))fail('P4_PACKAGE_RECEIPT_MISMATCH','Fresh reader must reproduce written package identity');
   for(const artifact of restored.artifacts){const name=artifact.descriptor.native.metadata.outputName;if(await sha256Bytes(raw(artifact.native.data))!==binding.arrays[name].sha256)fail('P4_OUTPUT_HASH_MISMATCH','Persisted output bits differ: '+name);}
   args.onProgress?.({phase:'p4-package-readback',outputCount:25});
   return {status:'complete',artifactRef:artifactRef+'#blockOutput',profileRef:P4_PROFILE_ID,payloadSha256:binding.arrays.blockOutput.sha256,arraysBinding:binding.arrays,receiptRef,packageReceipt,readbackVerified:true,metadataStorage,meaningAuthority:authority,ownerNativeMeaning:null};
  }finally{for(const handle of handles)releaseArtifactHandle(handle,store);store.clear();}
 };
}
