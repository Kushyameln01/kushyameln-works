import {canonicalize,canonicalBytes,sha256Bytes,hashCanonical} from './canonical.mjs';
import {validateArtifactDescriptor,validateExecutionSnapshot} from './descriptor.mjs';

export const PACKAGE_VERSION='works-artifact-package/1.0-draft.1';
const decoder=new TextDecoder('utf-8',{fatal:true});
const kinds=['native','descriptor','evidence','trace','snapshot','extensions','attachment'];
const binaryTypes={Uint8Array,Uint8ClampedArray,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array,ArrayBuffer,DataView};
const binaryWidth=type=>binaryTypes[type]?.BYTES_PER_ELEMENT??1;
const requiredPaths={nativePath:'native',descriptorPath:'descriptor',evidencePath:'evidence',tracePath:'trace',snapshotPath:'snapshot',extensionsPath:'extensions'};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(v,k)=>Object.hasOwn(v,k);
const sha=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const same=(a,b)=>canonicalize(a)===canonicalize(b);
const safePath=p=>typeof p==='string'&&p.length>0&&!/[\\\u0000-\u001f\u007f]/.test(p)&&!p.startsWith('/')&&!p.includes(':')&&p.split('/').every(s=>s!==''&&s!=='.'&&s!=='..')&&!['manifest.json','receipt.json'].includes(p);
export class PackageError extends Error {constructor(code,fieldPath,message){super(message);this.name='PackageError';this.code=code;this.fieldPath=fieldPath;}}
const fail=(code,path,message)=>{throw new PackageError(code,path,message);};
function sourceValid(s){return object(s)&&((typeof s.repository==='string'&&s.repository.length>0&&typeof s.path==='string'&&s.path.length>0&&/^[0-9a-f]{40}$/.test(s.commit))||(typeof s.archiveRef==='string'&&s.archiveRef.length>0&&sha(s.sha256)));}
function only(v,keys,path,issues){if(object(v))for(const k of Object.keys(v))if(!keys.includes(k))issues.push({code:'UNKNOWN_MANIFEST_FIELD',fieldPath:`${path}/${k}`,reason:'Field is not part of the adopted package schema.'});}
export function validatePackageManifest(manifest,{allowMissingDigests=false}={}) {
  const issues=[];const add=(fieldPath,reason)=>issues.push({code:'INVALID_PACKAGE_MANIFEST',fieldPath,reason});
  try{canonicalize(manifest);}catch(e){add('',e.message);return {valid:false,issues};}
  if(!object(manifest))return {valid:false,issues:[{code:'INVALID_PACKAGE_MANIFEST',fieldPath:'',reason:'Manifest must be an object.'}]};
  only(manifest,['packageVersion','packageId','artifacts','files','extensions','payloadBindings','binaryBindings'],'',issues);
  if(manifest.packageVersion!==PACKAGE_VERSION)add('/packageVersion','Unknown package version.');
  if(typeof manifest.packageId!=='string'||!manifest.packageId)add('/packageId','Package ID is required.');
  if(!Array.isArray(manifest.artifacts)||!manifest.artifacts.length)add('/artifacts','Nonempty artifact bindings are required.');
  if(!Array.isArray(manifest.files)||!manifest.files.length)add('/files','Nonempty asset manifest is required.');
  if(!object(manifest.extensions))add('/extensions','Explicit extension object is required.');
  else for(const [key,entry] of Object.entries(manifest.extensions))if(!/^[^:]+:.+$/.test(key)||!object(entry)||typeof entry.schemaId!=='string'||!entry.schemaId||typeof entry.schemaVersion!=='string'||!entry.schemaVersion||typeof entry.requiredForUse!=='boolean'||!own(entry,'data'))add(`/extensions/${key}`,'Namespaced extension requires schema ID/version, requiredForUse and data.');
  const fileMap=new Map(),ids=new Set();
  for(const [i,file] of (Array.isArray(manifest.files)?manifest.files:[]).entries()) {
    const path=`/files/${i}`;
    if(!object(file)){add(path,'File entry must be an object.');continue;}
    only(file,['path','kind','required','byteLength','sha256'],path,issues);
    if(!safePath(file.path))add(`${path}/path`,'Use safe relative asset paths; manifest and receipt self references are forbidden.');
    if(fileMap.has(file.path))add(`${path}/path`,'Duplicate file path.');fileMap.set(file.path,file);
    if(!kinds.includes(file.kind))add(`${path}/kind`,'Unknown file kind.');
    if(typeof file.required!=='boolean')add(`${path}/required`,'Required/optional classification must be explicit.');
    if((!allowMissingDigests||own(file,'byteLength'))&&(!Number.isSafeInteger(file.byteLength)||file.byteLength<0))add(`${path}/byteLength`,'byteLength must be a nonnegative safe integer.');
    if((!allowMissingDigests||own(file,'sha256'))&&!sha(file.sha256))add(`${path}/sha256`,'Whole-file SHA-256 must be lowercase hexadecimal.');
  }
  for(const [i,a] of (Array.isArray(manifest.artifacts)?manifest.artifacts:[]).entries()) {
    const path=`/artifacts/${i}`;
    if(!object(a)){add(path,'Artifact binding must be an object.');continue;}
    only(a,['artifactId',...Object.keys(requiredPaths),'codec'],path,issues);
    if(typeof a.artifactId!=='string'||!a.artifactId||ids.has(a.artifactId))add(`${path}/artifactId`,'Artifact ID is required and unique.');ids.add(a.artifactId);
    for(const [key,kind] of Object.entries(requiredPaths)) {const file=fileMap.get(a[key]);if(!file||file.kind!==kind||file.required!==true)add(`${path}/${key}`,`A required ${kind} file must be explicitly bound.`);}
    if(!object(a.codec)){add(`${path}/codec`,'Explicit native codec identity/source is required.');continue;}
    only(a.codec,['codecId','codecVersion','sourceRef'],`${path}/codec`,issues);
    if(typeof a.codec.codecId!=='string'||!a.codec.codecId||typeof a.codec.codecVersion!=='string'||!a.codec.codecVersion||!sourceValid(a.codec.sourceRef))add(`${path}/codec`,'Codec ID/version and pinned public source are required.');
  }
  if(!Array.isArray(manifest.payloadBindings))add('/payloadBindings','Explicit payload reference bindings are required.');
  const payloadRefs=new Set();
  for(const [i,b] of (Array.isArray(manifest.payloadBindings)?manifest.payloadBindings:[]).entries()) {
    const path=`/payloadBindings/${i}`;
    if(!object(b)){add(path,'Payload binding must be an object.');continue;}
    only(b,['ref','artifactId','nativePath','kind'],path,issues);
    const artifact=(Array.isArray(manifest.artifacts)?manifest.artifacts:[]).find(a=>a?.artifactId===b.artifactId);
    if(typeof b.ref!=='string'||!b.ref||payloadRefs.has(b.ref)||b.kind!=='decoded-tensor-data'||!artifact||artifact.nativePath!==b.nativePath)add(path,'Payload ref must be unique and explicitly map to its artifact native file decoded tensor data.');
    payloadRefs.add(b.ref);
  }
  if(own(manifest,'binaryBindings')&&!Array.isArray(manifest.binaryBindings))add('/binaryBindings','Binary bindings must be an explicit array when present.');
  const binaryRefs=new Set();
  for(const [i,b] of (Array.isArray(manifest.binaryBindings)?manifest.binaryBindings:[]).entries()) {
    const path=`/binaryBindings/${i}`;
    if(!object(b)){add(path,'Binary binding must be an object.');continue;}
    only(b,['binaryRef','path','type','byteLength'],path,issues);
    const file=fileMap.get(b.path);
    if(typeof b.binaryRef!=='string'||!b.binaryRef||binaryRefs.has(b.binaryRef)||payloadRefs.has(b.binaryRef)||!own(binaryTypes,b.type)||!Number.isSafeInteger(b.byteLength)||b.byteLength<0||b.byteLength%binaryWidth(b.type)!==0||!file||file.kind!=='attachment'||file.required!==true||own(file,'byteLength')&&file.byteLength!==b.byteLength)add(path,'Binary ref must uniquely bind a required attachment, supported type and aligned exact byte length.');
    binaryRefs.add(b.binaryRef);
  }
  return {valid:issues.length===0,issues};
}
function assertManifest(m,options){const result=validatePackageManifest(m,options);if(!result.valid)fail('INVALID_PACKAGE_MANIFEST',result.issues[0].fieldPath,result.issues[0].reason);}
function bytes(value,path){if(!(value instanceof Uint8Array))fail('INVALID_ASSET_BYTES',path,'Storage must return actual Uint8Array bytes.');return new Uint8Array(value);}
function parseJSON(value,path,{canonical=false}={}) {
  let parsed;try{parsed=JSON.parse(decoder.decode(value));canonicalize(parsed);}catch(error){fail('INVALID_JSON',path,error.message);}
  if(canonical&&!equalBytes(value,canonicalBytes(parsed)))fail('NONCANONICAL_JSON',path,'Metadata must be RFC8785 canonical UTF-8 JSON, including unique keys.');
  return parsed;
}
function equalBytes(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function validateSidecar(value,kind,artifactId,path,refs,issues) {
  const idField=kind==='evidence'?'evidenceId':'traceId';
  if(!object(value)||value.schemaVersion!==1||value.artifactId!==artifactId||!Array.isArray(value.records)||Object.keys(value).some(k=>!['schemaVersion','artifactId','records','absentReason'].includes(k)))fail('INVALID_SIDECAR',path,`${kind} must use its versioned artifact-bound records envelope.`);
  const ids=new Set();
  for(const [i,record] of value.records.entries()) {
    if(!object(record)||typeof record[idField]!=='string'||!record[idField]||ids.has(record[idField])||!own(record,'data')||Object.keys(record).some(k=>![idField,'data'].includes(k)))fail('INVALID_SIDECAR',`${path}/records/${i}`,`Each ${kind} record requires a unique identity and opaque preserved data.`);
    ids.add(record[idField]);
  }
  if(kind==='evidence'&&!value.records.length) {
    if(typeof value.absentReason!=='string'||!value.absentReason)fail('INVALID_SIDECAR',path,'Absent evidence requires an explicit reason.');
    issues.push({code:'EVIDENCE_NOT_RECORDED',fieldPath:path,reason:value.absentReason});
  }
  if(kind==='trace')for(const ref of refs)if(!ids.has(ref))fail('TRACE_BINDING_MISSING',path,`Required transform trace ${ref} was not recovered.`);
}
function binaryHydrator(manifest,assets) {
  const map=new Map((manifest.binaryBindings??[]).map(b=>[b.binaryRef,b]));
  const littleEndian=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
  function hydrate(value,path) {
    if(Array.isArray(value))return value.map((v,i)=>hydrate(v,`${path}/${i}`));
    if(!object(value))return value;
    if(Object.keys(value).length===3&&own(value,'binaryRef')&&own(value,'type')&&own(value,'byteLength')&&typeof value.binaryRef==='string'&&value.binaryRef.length>0&&own(binaryTypes,value.type)&&Number.isSafeInteger(value.byteLength)&&value.byteLength>=0) {
      const binding=map.get(value.binaryRef);
      if(!binding)fail('BINARY_BINDING_MISSING',path,'Every opaque binary reference must bind an explicitly required attachment.');
      if(value.type!==binding.type||value.byteLength!==binding.byteLength||Object.keys(value).some(k=>!['binaryRef','type','byteLength'].includes(k)))fail('BINARY_BINDING_MISMATCH',path,'Binary sidecar reference type/length differs from its attachment binding.');
      const raw=assets.get(binding.path);
      if(!raw||raw.byteLength!==binding.byteLength)fail('BINARY_BINDING_MISMATCH',binding.path,'Binary attachment actual bytes differ from the bound length.');
      if(binaryWidth(binding.type)>1&&!littleEndian)fail('UNSUPPORTED_BYTE_ORDER',binding.path,'This draft stores multi-byte metadata in the little-endian native codec environment.');
      const buffer=new Uint8Array(raw).buffer;
      return binding.type==='ArrayBuffer'?buffer:binding.type==='DataView'?new DataView(buffer):new binaryTypes[binding.type](buffer);
    }
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,hydrate(v,`${path}/${k}`)]));
  }
  return hydrate;
}
async function structuralMetadata(manifest,assets,registry) {
  const artifacts=[],issues=[];
  for(const a of manifest.artifacts) {
    const descriptor=parseJSON(assets.get(a.descriptorPath),a.descriptorPath,{canonical:true});
    const result=validateArtifactDescriptor(descriptor,registry);
    if(result.issues.length)fail('INVALID_ARTIFACT_DESCRIPTOR',a.descriptorPath+result.issues[0].fieldPath,result.issues[0].reason);
    for(const unknown of result.unknownRequiredSchemas)issues.push({code:'UNKNOWN_REQUIRED_SCHEMA',fieldPath:a.descriptorPath+unknown.fieldPath,reason:`Unknown ${unknown.schemaId}@${unknown.schemaVersion}.`});
    if(descriptor.artifactId!==a.artifactId)fail('ARTIFACT_ID_MISMATCH',a.descriptorPath,'Descriptor and manifest artifact IDs differ.');
    for(const ref of [descriptor.native.payloadRef,...(descriptor.tensor?[descriptor.tensor.dataRef]:[])])if(!manifest.payloadBindings.some(b=>b.ref===ref&&b.artifactId===a.artifactId&&b.nativePath===a.nativePath&&b.kind==='decoded-tensor-data'))fail('PAYLOAD_BINDING_MISSING',a.descriptorPath,'Opaque tensor data reference must explicitly bind to the native file decoded payload.');
    const evidence=parseJSON(assets.get(a.evidencePath),a.evidencePath,{canonical:true});
    const trace=parseJSON(assets.get(a.tracePath),a.tracePath,{canonical:true});
    validateSidecar(evidence,'evidence',a.artifactId,a.evidencePath,[],issues);
    validateSidecar(trace,'trace',a.artifactId,a.tracePath,descriptor.provenance.transformTraceRefs,issues);
    const snapshot=parseJSON(assets.get(a.snapshotPath),a.snapshotPath,{canonical:true});
    const extensions=parseJSON(assets.get(a.extensionsPath),a.extensionsPath,{canonical:true});
    if(!same(descriptor.extensions,extensions))fail('EXTENSION_SIDECAR_MISMATCH',a.extensionsPath,'Extension sidecar must preserve the complete descriptor extensions.');
    if(descriptor.snapshotId===null) {if(snapshot!==null)fail('SNAPSHOT_MISMATCH',a.snapshotPath,'Null descriptor snapshot requires an explicit null snapshot sidecar.');}
    else {const checked=validateExecutionSnapshot(snapshot,registry);if(!checked.valid||snapshot.snapshotId!==descriptor.snapshotId)fail('SNAPSHOT_MISMATCH',a.snapshotPath,'Snapshot structure or snapshot ID does not match the descriptor.');}
    if(own(descriptor.native.metadata,'data'))fail('NATIVE_DATA_IN_METADATA',a.descriptorPath,'Tensor data is held only by the explicitly bound native payload.');
    artifacts.push({binding:a,descriptor,evidence,trace,snapshot,extensions,native:null,restoredNative:null});
  }
  // Digest the original snapshot JSON before interpreting any metadata marker.
  await verifySnapshots(artifacts);
  // One visitor covers every retained metadata object, including schema-permitted
  // future fields. Positional allowlists must not leave dangling binary refs.
  const hydrate=binaryHydrator(manifest,assets),restoredManifest=hydrate(manifest,'');
  for(const record of artifacts) {
    const a=record.binding,restoredDescriptor=hydrate(record.descriptor,a.descriptorPath);
    record.restoredMetadata=restoredDescriptor.native.metadata;
    record.restoredExtensions=restoredDescriptor.extensions;
    record.restoredEvidence=hydrate(record.evidence,a.evidencePath);
    record.restoredTrace=hydrate(record.trace,a.tracePath);
    hydrate(record.snapshot,a.snapshotPath);
    hydrate(record.extensions,a.extensionsPath);
  }
  return {artifacts,issues,restoredPackageExtensions:restoredManifest.extensions};
}
function codecFor(binding,registry){const codecs=Array.isArray(registry?.codecs)?registry.codecs:[];return codecs.find(c=>object(c)&&c.codecId===binding.codecId&&c.codecVersion===binding.codecVersion&&sourceValid(c.sourceRef)&&typeof c.decode==='function'&&same(c.sourceRef,binding.sourceRef));}
function nativeJSON(value){if(ArrayBuffer.isView(value))return Array.from(value);if(Array.isArray(value))return value.map(nativeJSON);if(object(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,nativeJSON(v)]));return value;}
function validateNativeTensor(t,path) {
  const constructors={float32:Float32Array,int32:Int32Array,uint8:Uint8Array,int64:BigInt64Array};
  if(!object(t)||!constructors[t.dtype]||!(t.data instanceof constructors[t.dtype])||!Array.isArray(t.shape)||!t.shape.length)fail('NATIVE_CODEC_RESULT_INVALID',path,'Registered codec must return a supported owned native tensor.');
  let count=1;for(const n of t.shape){if(!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(count*=n))fail('NATIVE_CODEC_RESULT_INVALID',path,'Invalid tensor shape.');}
  if(count!==t.data.length)fail('NATIVE_CODEC_RESULT_INVALID',path,'Tensor payload length does not match declared shape.');
  if(t.dtype==='float32'&&t.data.some(v=>!Number.isFinite(v)))fail('NATIVE_CODEC_RESULT_INVALID',path,'Tensor contains nonfinite values.');
}
function compareNative(t,record) {
  const a=record.binding,d=record.descriptor,meta=record.restoredMetadata;
  if(d.tensor) {
    for(const [field,expected,actual] of [['dtype',d.tensor.dtype,t.dtype],['shape',d.tensor.shape,t.shape],['axes',d.tensor.axes.join(''),t.layout],['nativeMeaning',d.tensor.nativeMeaning,t.meaning]])if(!same(expected,actual))fail('NATIVE_METADATA_MISMATCH',`${a.descriptorPath}/tensor/${field}`,'Common tensor declaration disagrees with the decoded native file.');
  }
  for(const field of ['dtype','shape','layout','meaning','modelSha256','tokenizerSha256','normalization','attentionMask','context','latentContract'])if(own(meta,field)) {
    if(!own(t,field)||!same(nativeJSON(meta[field]),nativeJSON(t[field])))fail('NATIVE_METADATA_MISMATCH',`${a.descriptorPath}/native/metadata/${field}`,'Native metadata sidecar disagrees with the decoded file.');
  }
}
async function decodeRecords(records,assets,registry,issues) {
  for(const record of records) {
    const binding=record.binding,codec=codecFor(binding.codec,registry);
    if(!codec){issues.push({code:'NATIVE_CODEC_UNVERIFIED',fieldPath:binding.nativePath,reason:'Exact pinned native codec is not supplied; no code is loaded implicitly.'});continue;}
    let native;try{native=await codec.decode(new Uint8Array(assets.get(binding.nativePath)));}catch(error){fail('NATIVE_CODEC_REJECTED',binding.nativePath,error.message);}
    validateNativeTensor(native,binding.nativePath);compareNative(native,record);record.native=structuredClone(native);record.restoredNative={...structuredClone(native),...structuredClone(record.restoredMetadata),data:structuredClone(native.data)};

  }
}
async function verifySnapshots(records) {
  for(const record of records) if(record.snapshot!==null) {
    const expected=record.snapshot.snapshotHash,hashInput={...record.snapshot};delete hashInput.snapshotHash;
    if(await hashCanonical(hashInput)!==expected)fail('SNAPSHOT_HASH_MISMATCH',record.binding.snapshotPath,'snapshotHash excludes its own root field; execution trace is a separate file.');
  }
}
function manifestExtensions(manifest,registry,issues) {
  for(const [key,value] of Object.entries(manifest.extensions)) {
    if(!key.includes(':')||!object(value)||typeof value.schemaId!=='string'||typeof value.schemaVersion!=='string'||typeof value.requiredForUse!=='boolean'||!own(value,'data'))fail('INVALID_PACKAGE_EXTENSION',`/extensions/${key}`,'Extension requires namespaced schema identity, requiredForUse and data.');
    if(value.requiredForUse&&!registry?.schemas?.some?.(s=>s?.schemaId===value.schemaId&&s?.schemaVersion===value.schemaVersion))issues.push({code:'UNKNOWN_REQUIRED_SCHEMA',fieldPath:`/extensions/${key}`,reason:`Unknown ${value.schemaId}@${value.schemaVersion}.`});
  }
}
/** sink: {write(relativePath, ownedBytes): Promise<void>, registry?}. Use a fresh
 * destination. Receipt is written last; no atomic overwrite guarantee is claimed.
 * assets is Map<relativePath,Uint8Array>. Input objects/bytes remain unchanged. */
export async function writeArtifactPackage(manifest,assets,sink) {
  assertManifest(manifest,{allowMissingDigests:true});if(!(assets instanceof Map)||typeof sink?.write!=='function')fail('INVALID_STORAGE','', 'Explicit Map assets and async write sink are required.');
  const copied=new Map(),output=structuredClone(manifest);
  for(const file of output.files){const value=assets.get(file.path);if(value===undefined){if(file.required)fail('REQUIRED_ASSET_MISSING',file.path,'Required asset is absent.');fail('OPTIONAL_ASSET_MISSING',file.path,'Declared optional bytes must be recovered or omitted from this new manifest explicitly.');}const b=bytes(value,file.path);copied.set(file.path,b);const digest=await sha256Bytes(b);if(own(file,'byteLength')&&file.byteLength!==b.length||own(file,'sha256')&&file.sha256!==digest)fail('ASSET_HASH_MISMATCH',file.path,'Supplied file identity disagrees with actual bytes.');file.byteLength=b.length;file.sha256=digest;}
  assertManifest(output);const {artifacts,issues}=await structuralMetadata(output,copied,sink.registry);manifestExtensions(output,sink.registry,issues);if(sink.registry)await decodeRecords(artifacts,copied,sink.registry,issues);
  const manifestBytes=canonicalBytes(output),receipt={packageVersion:PACKAGE_VERSION,packageId:output.packageId,manifestPath:'manifest.json',manifestByteLength:manifestBytes.length,manifestSha256:await sha256Bytes(manifestBytes)};
  for(const [path,b] of copied)await sink.write(path,new Uint8Array(b));await sink.write('manifest.json',manifestBytes);await sink.write('receipt.json',canonicalBytes(receipt));
  return receipt;
}
/** source: {read(relativePath):Promise<Uint8Array|null>, legacyNative?}.
 * registry.codecs is an explicit trusted array of {codecId,codecVersion,
 * sourceRef,decode(bytes):Promise<nativeTensor>}. No plugin/code import occurs. */
export async function readArtifactPackage(source,registry) {
  if(typeof source?.read!=='function')fail('INVALID_STORAGE','','Explicit async source.read is required.');
  const raw=await source.read('manifest.json');
  if(raw===null||raw===undefined){if(source.legacyNative?.bytes instanceof Uint8Array)return {status:'legacy-incomplete',manifest:null,receipt:null,assets:new Map([['legacy-native',new Uint8Array(source.legacyNative.bytes)]]),artifacts:[],issues:[{code:'LEGACY_PROVENANCE_INCOMPLETE',fieldPath:'',reason:'Native bytes without outer manifest have no complete common descriptor/evidence/trace/snapshot provenance.'}]};fail('MANIFEST_MISSING','manifest.json','No package manifest was recovered.');}
  const manifestBytes=bytes(raw,'manifest.json'),manifest=parseJSON(manifestBytes,'manifest.json',{canonical:true});assertManifest(manifest);
  const receiptRaw=await source.read('receipt.json');if(receiptRaw===null||receiptRaw===undefined)fail('RECEIPT_MISSING','receipt.json','External manifest identity receipt is required.');
  const receipt=parseJSON(bytes(receiptRaw,'receipt.json'),'receipt.json',{canonical:true});
  if(!object(receipt)||Object.keys(receipt).sort().join(',')!==['packageVersion','packageId','manifestPath','manifestByteLength','manifestSha256'].sort().join(',')||receipt.packageVersion!==PACKAGE_VERSION||receipt.packageId!==manifest.packageId||receipt.manifestPath!=='manifest.json'||receipt.manifestByteLength!==manifestBytes.length||receipt.manifestSha256!==await sha256Bytes(manifestBytes))fail('MANIFEST_HASH_MISMATCH','receipt.json','Manifest bytes/identity do not match the external receipt.');
  const assets=new Map(),issues=[];
  for(const file of manifest.files){const raw=await source.read(file.path);if(raw===null||raw===undefined){if(file.required)fail('REQUIRED_ASSET_MISSING',file.path,'Required package bytes were not recovered.');issues.push({code:'OPTIONAL_ASSET_MISSING',fieldPath:file.path,reason:'Optional bytes declared in manifest were not recovered.'});continue;}const b=bytes(raw,file.path);if(b.length!==file.byteLength||await sha256Bytes(b)!==file.sha256)fail('ASSET_HASH_MISMATCH',file.path,'Whole-file byte length or hash mismatch.');assets.set(file.path,b);}
  const decoded=await structuralMetadata(manifest,assets,registry);issues.push(...decoded.issues);manifestExtensions(manifest,registry,issues);await decodeRecords(decoded.artifacts,assets,registry,issues);
  return {status:issues.length?'unverified':'complete',manifest,receipt,assets,artifacts:decoded.artifacts,issues,restoredPackageExtensions:decoded.restoredPackageExtensions};
}
