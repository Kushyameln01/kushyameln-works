import {PAPER_KERNEL} from './registry.mjs';
export {PAPER_KERNEL};
const MAX_MEMORY=16777216,MAX_ARENA=12582912,MAX_HOST=4194304;
const KINDS=['svd-diagonal-v1','paper-alg2-diagonal-v1'];
const ERRORS=['','SOLVER_NONCONVERGENCE','ZERO_SIGNAL','RANK_LIMIT','EIGENSPACE_AMBIGUOUS','PATTERN_AMBIGUOUS','NUMERIC_ACCURACY','INVALID_ARGUMENT','WORKSPACE_LIMIT'];
const encoder=new TextEncoder(),align=n=>Math.ceil(n/8)*8,integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b,hashPattern=/^[a-f0-9]{64}$/,idPattern=/^[A-Za-z0-9_.:-]{1,64}$/;
const validId=value=>typeof value==='string'&&idPattern.test(value);
const typedPrototype=Object.getPrototypeOf(Uint8Array.prototype),typedGet=Object.fromEntries(['length','buffer','byteOffset','byteLength'].map(k=>[k,Object.getOwnPropertyDescriptor(typedPrototype,k).get]));
const typed=(data,key)=>Reflect.apply(typedGet[key],data,[]);
function jsonSnapshot(value,limit){
 let bytes=0;const add=s=>{bytes+=encoder.encode(s).byteLength;if(bytes>limit)throw RangeError('METADATA_LIMIT');return s;};
 function visit(v,depth){if(depth>16)throw RangeError('METADATA_DEPTH');if(v===null)return add('null');if(typeof v==='string'){if(v.length>limit)throw RangeError('METADATA_LIMIT');return add(JSON.stringify(v));}if(typeof v==='boolean')return add(String(v));if(typeof v==='number'&&Number.isFinite(v))return add(JSON.stringify(v));
  if(Array.isArray(v)){if(v.length>4096)throw RangeError('METADATA_COUNT');return add('[')+v.map((x,i)=>(i?add(','):'')+visit(x,depth+1)).join('')+add(']');}
  if(v&&Object.getPrototypeOf(v)===Object.prototype){const keys=Object.keys(v).sort();if(keys.length>8192)throw RangeError('METADATA_COUNT');return add('{')+keys.map((k,i)=>{if(k.length>limit)throw RangeError('METADATA_LIMIT');const descriptor=Object.getOwnPropertyDescriptor(v,k);if(!descriptor||!('value'in descriptor))throw TypeError('METADATA_ACCESSOR');return (i?add(','):'')+add(JSON.stringify(k))+add(':')+visit(descriptor.value,depth+1);}).join('')+add('}');}
  throw TypeError('METADATA_JSON_REQUIRED');
 }
 const text=visit(value,0);if(encoder.encode(text).byteLength>limit)throw RangeError('METADATA_LIMIT');return {value:JSON.parse(text),text,bytes:encoder.encode(text).byteLength};
}
async function sha(data){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');}
function abort(signal){if(signal?.aborted)throw new DOMException('Paper preparation aborted','AbortError');}
export async function preparePaperKernel({signal,onCompile,onResponse}={}){
 abort(signal);const response=await fetch(PAPER_KERNEL.url,{signal,credentials:'omit'});abort(signal);if(!response.ok)throw Error(`Paper kernel fetch ${response.status}`);onResponse?.(response.headers.get('content-type')??'');
 const bytes=await response.arrayBuffer();abort(signal);if(await sha(bytes)!==PAPER_KERNEL.sha256)throw Error('PAPER_KERNEL_HASH');abort(signal);onCompile?.();abort(signal);const module=await WebAssembly.compile(bytes);abort(signal);return module;
}
function dimensions(width,height){if(!integer(width,1,64)||!integer(height,1,64))throw RangeError('GRID_LIMIT');return width*height;}
function preprocessingKind(p,width,height){
 const keys=['version','grid','roi','resize','luma','lbp','border'];
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==keys.length||Object.keys(p).some(k=>!keys.includes(k))||p.version!==1||!p.grid||Object.keys(p.grid).length!==2||p.grid.width!==width||p.grid.height!==height||p.resize!=='none'||p.luma!=='integer77-150-29-white-alpha'||p.lbp!=='3x3-ge-NW-N-NE-E-SE-S-SW-W'||p.border!=='zero-gray-halo')throw TypeError('PREPROCESSING_CONTRACT');
 if(['synthetic-numeric-fixture','maximum-numeric-fixture'].includes(p.roi))return 'synthetic-numeric';
 const r=p.roi,roiKeys=['x','y','width','height','sourceWidth','sourceHeight','coordinateSpace'];
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==roiKeys.length||Object.keys(r).some(k=>!roiKeys.includes(k))||r.coordinateSpace!=='display-pixels'||r.width!==width||r.height!==height||!integer(r.x,0,16777216)||!integer(r.y,0,16777216)||!integer(r.sourceWidth,1,16777216)||!integer(r.sourceHeight,1,16777216)||r.sourceWidth*r.sourceHeight>16777216||r.x+width>r.sourceWidth||r.y+height>r.sourceHeight)throw TypeError('PREPROCESSING_ROI');
 return 'media-crop';
}
function checkedArray(data,Type,length,memory){if(!(data instanceof Type))throw TypeError('ARRAY_SHAPE');const buffer=typed(data,'buffer');if(!(buffer instanceof ArrayBuffer)||buffer.resizable||buffer===memory?.buffer||typed(data,'length')!==length)throw TypeError('ARRAY_SHAPE');new Uint8Array(buffer,typed(data,'byteOffset'),typed(data,'byteLength'));return data;}
function modelParts(model,memory){
 const p=dimensions(model.width,model.height),k=model.featureCount;if(model.schema!==1||!KINDS.includes(model.kind)||!integer(k,1,16)||!integer(model.requestedFeatureCount,k,16)||!['strict','allow-fewer'].includes(model.rankPolicy)||model.status!==(k<model.requestedFeatureCount?'rank-limited':'complete')||!['synthetic-numeric','media-crop'].includes(model.preprocessingKind)||model.abi!==PAPER_KERNEL.abi||model.kernelSha256!==PAPER_KERNEL.sha256||!hashPattern.test(model.modelHash)||!hashPattern.test(model.preprocessingSha256))throw TypeError('MODEL_IDENTITY');
 const coefficientKeys=model.kind===KINDS[0]?['spatial','pattern']:['spatial','selectedCodes'];if(!model.coefficients||Object.keys(model.coefficients).length!==2||Object.keys(model.coefficients).some(k=>!coefficientKeys.includes(k)))throw TypeError('MODEL_COEFFICIENTS');
 const spatial=checkedArray(model.coefficients?.spatial,Float64Array,p*k,memory);if(!Reflect.apply(Float64Array.prototype.every,spatial,[Number.isFinite]))throw TypeError('MODEL_NONFINITE');
 const second=model.kind===KINDS[0]?checkedArray(model.coefficients.pattern,Float64Array,256*k,memory):checkedArray(model.coefficients.selectedCodes,Uint8Array,k,memory);if(second instanceof Float64Array&&!Reflect.apply(Float64Array.prototype.every,second,[Number.isFinite]))throw TypeError('MODEL_NONFINITE');if(second instanceof Uint8Array&&new Set(second).size!==k)throw TypeError('MODEL_SELECTED_CODES');
 const meta={};for(const key of Object.keys(model))if(key!=='coefficients'&&key!=='modelHash')meta[key]=model[key];const metadata=jsonSnapshot(meta,65536);
 return {p,k,spatial,second,metadata,modelHash:model.modelHash,bytes:typed(spatial,'byteLength')+typed(second,'byteLength')+metadata.bytes};
}
async function modelHash(metadata,spatial,second){
 const text=encoder.encode(metadata.text),bytes=new Uint8Array(4+text.length+spatial.byteLength+second.byteLength),view=new DataView(bytes.buffer);view.setUint32(0,text.length,true);bytes.set(text,4);let offset=4+text.length;
 for(const x of spatial){view.setFloat64(offset,x,true);offset+=8;}
 if(second instanceof Float64Array){for(const x of second){view.setFloat64(offset,x,true);offset+=8;}}else bytes.set(second,offset);
 return sha(bytes);
}
function validateSplit(manifest,samples){
 if(manifest.version!==1||!hashPattern.test(manifest.preprocessingSha256)||!Array.isArray(manifest.groups)||!Array.isArray(manifest.samples)||manifest.groups.length>1536||manifest.samples.length>1536)throw TypeError('SPLIT_MANIFEST');
 const groups=new Map(),ids=new Map(),sources=new Map();
 for(const g of manifest.groups){if(!validId(g.groupId)||!['train','calibration','evaluation'].includes(g.split)||groups.has(g.groupId))throw Error('SPLIT_GROUP_CONFLICT');groups.set(g.groupId,g.split);}
 for(const s of manifest.samples){const split=groups.get(s.groupId);if(!validId(s.sampleId)||ids.has(s.sampleId)||!split||![0,1].includes(s.label)||!hashPattern.test(s.sourceSha256)||!hashPattern.test(s.codeSha256))throw Error('SPLIT_SAMPLE_INVALID');if(sources.has(s.sourceSha256)&&sources.get(s.sourceSha256)!==split)throw Error('SPLIT_SOURCE_LEAKAGE');sources.set(s.sourceSha256,split);ids.set(s.sampleId,{...s,split});}
 const expected=Array.from(ids.values()).filter(s=>s.split==='train');if(expected.length!==samples.length)throw Error('TRAINING_SET_MISMATCH');const seen=new Set(),counts=[0,0];
 const records=samples.map(s=>{const info=ids.get(s.sampleId);if(!info||info.split!=='train'||seen.has(s.sampleId))throw Error('TRAINING_SET_MISMATCH');seen.add(s.sampleId);counts[info.label]++;return info;});if(!counts[0]||!counts[1])throw Error('EMPTY_CLASS');return {records,counts};
}
export function instantiatePaperKernel(module){
 const expected='FitAlg2:function,FitDirect:function,Gram:function,InferAlg2:function,InferDirect:function,MeanAdd:function,memory:memory';
 if(!(module instanceof WebAssembly.Module)||WebAssembly.Module.imports(module).length||WebAssembly.Module.exports(module).map(x=>`${x.name}:${x.kind}`).sort().join(',')!==expected)throw TypeError('PAPER_ABI');
 let instance=new WebAssembly.Instance(module),memory=instance.exports.memory;const arenaBase=memory.buffer.byteLength,instanceId=`paper-${crypto.randomUUID()}`;
 if(arenaBase>MAX_MEMORY||instance.exports.MeanAdd.length!==4||instance.exports.Gram.length!==3||instance.exports.FitDirect.length!==14||instance.exports.FitAlg2.length!==14||instance.exports.InferDirect.length!==6||instance.exports.InferAlg2.length!==6)throw TypeError('PAPER_ABI');
 let disposed=false,busy=false,liveBytes=0,peakBytes=0,hostSnapshotBytes=0,peakHostSnapshotBytes=0,fits=0,inferences=0;
 function check(){if(disposed)throw Error('DISPOSED');}
 function begin(){check();if(busy)throw Error('BUSY');busy=true;}
 function reserveHost(bytes){if(bytes>MAX_HOST)throw RangeError('HOST_SNAPSHOT_LIMIT');hostSnapshotBytes=bytes;peakHostSnapshotBytes=Math.max(peakHostSnapshotBytes,bytes);}
 function end(){hostSnapshotBytes=0;busy=false;}
 function arena(sizes,body){check();let end=arenaBase;const ptr=sizes.map(n=>{const x=end;end=align(end+n);return x;});if(end-arenaBase>MAX_ARENA||end>MAX_MEMORY)throw RangeError('WORKSPACE_LIMIT');const mem=memory;let reserved=false;
  try{const pages=Math.ceil((end-mem.buffer.byteLength)/65536);if(pages>0)mem.grow(pages);new Uint8Array(mem.buffer,arenaBase,end-arenaBase).fill(0);liveBytes=end-arenaBase;peakBytes=Math.max(peakBytes,liveBytes);reserved=true;return body(ptr,mem);}
  finally{if(reserved)new Uint8Array(mem.buffer,arenaBase,end-arenaBase).fill(0);liveBytes=0;}
 }
 async function fit(input){
  begin();let snapshot;
  try{
   const p=dimensions(input?.width,input?.height),requested=input.featureCount,kind=input.kind,rankPolicy=input.rankPolicy??'strict';if(!KINDS.includes(kind)||!integer(requested,1,16)||!['strict','allow-fewer'].includes(rankPolicy)||!Array.isArray(input.samples)||input.samples.length<2||input.samples.length>512)throw RangeError('FIT_OPTIONS');
   const preprocessing=jsonSnapshot(input.preprocessing,16384),manifest=jsonSnapshot(input.splitManifest,524288),provenance=preprocessingKind(preprocessing.value,input.width,input.height);
   const sources=Array.prototype.map.call(input.samples,s=>{const sampleId=s?.sampleId,codes=s?.codes;if(!validId(sampleId))throw TypeError('SAMPLE_ID');checkedArray(codes,Uint8Array,p,memory);return {sampleId,codes};});
   reserveHost(sources.length*p+preprocessing.bytes+manifest.bytes);
   snapshot={width:input.width,height:input.height,p,requested,kind,rankPolicy,preprocessing,manifest,samples:sources.map(s=>({sampleId:s.sampleId,codes:new Uint8Array(s.codes)}))};
   const split=validateSplit(manifest.value,snapshot.samples),preprocessingSha256=await sha(encoder.encode(preprocessing.text));check();if(preprocessingSha256!==manifest.value.preprocessingSha256)throw Error('PREPROCESSING_HASH');
   for(let i=0;i<snapshot.samples.length;i++){if(await sha(snapshot.samples[i].codes)!==split.records[i].codeSha256)throw Error('CODE_HASH');check();}
   const splitHash=await sha(encoder.encode(manifest.text));check();const trainingHash=await sha(encoder.encode(jsonSnapshot(split.records.map(s=>({sampleId:s.sampleId,label:s.label,groupId:s.groupId,sourceSha256:s.sourceSha256,codeSha256:s.codeSha256})),524288).text));check();
   const numerical=arena([p*256*8,65536*8,65536*8,65536*8,requested*p*8,256*requested*8,p,65536],([d,g,work,v,t,h,code,diag],mem)=>{
    const ex=instance.exports,bytes=new Uint8Array(mem.buffer);for(let i=0;i<snapshot.samples.length;i++){bytes.set(snapshot.samples[i].codes,code);const label=split.records[i].label;const status=ex.MeanAdd(d,code,p,label?1/split.counts[1]:-1/split.counts[0]);if(status!==0)throw Error(ERRORS[-status]??'KERNEL_ERROR');bytes.fill(0,code,code+p);}
    if(ex.Gram(d,g,p)!==0)throw Error('KERNEL_ERROR');new Float64Array(mem.buffer,diag,16)[9]=liveBytes;
    const selected=diag+3200,fn=kind===KINDS[0]?ex.FitDirect:ex.FitAlg2,count=fn(d,g,work,v,t,kind===KINDS[0]?h:selected,diag,p,requested,rankPolicy==='allow-fewer'?1:0,64,1e-12,1e-8,1e-10);
    if(count<1)throw Error(ERRORS[-count]??'KERNEL_ERROR');if(count>requested)throw Error('INVALID_RESULT');
    const spatial=Float64Array.from(new Float64Array(mem.buffer,t,count*p)),second=kind===KINDS[0]?Float64Array.from(new Float64Array(mem.buffer,h,256*count)):Uint8Array.from(new Int32Array(mem.buffer,selected,count)),values=Array.from(new Float64Array(mem.buffer,diag,10));
    if(!spatial.every(Number.isFinite)||!second.every(Number.isFinite)||!values.every(Number.isFinite))throw Error('NUMERIC_ACCURACY');
    return {count,spatial,second,diagnostics:{alpha:values[0],eigenResidual:values[1],eigenOrthogonality:values[2],selectedUOrthogonality:values[3],selectedPairResidual:values[4],initialRankInterval:[values[5],values[6]],rankAmbiguous:values[5]!==values[6],maxSweeps:values[8],workspaceBytes:values[9]}};
   });
   const model={schema:1,abi:PAPER_KERNEL.abi,kernelSha256:PAPER_KERNEL.sha256,kind,width:snapshot.width,height:snapshot.height,featureCount:numerical.count,requestedFeatureCount:requested,status:numerical.count<requested?'rank-limited':'complete',rankPolicy,preprocessingSha256,preprocessingKind:provenance,trainingHash,splitHash,classCounts:split.counts,rankScale:'max(1,trace(G_initial))',numericPolicy:{maxSweeps:64,tolerance:1e-12,rankCutoff:1e-8,rankGuard:1e-10,eigenspaceGap:1e-8,patternGap:1e-8},diagnostics:numerical.diagnostics};
   const metadata=jsonSnapshot(model,65536),digest=await modelHash(metadata,numerical.spatial,numerical.second);check();fits++;
   return {...model,coefficients:kind===KINDS[0]?{spatial:numerical.spatial,pattern:numerical.second}:{spatial:numerical.spatial,selectedCodes:numerical.second},modelHash:digest};
  }finally{snapshot=null;end();}
 }
 async function infer(input){
  begin();let snapshot;
  try{
   const parts=modelParts(input?.model,memory),preprocessing=jsonSnapshot(input.preprocessing,16384),provenance=preprocessingKind(preprocessing.value,parts.metadata.value.width,parts.metadata.value.height);if(provenance!==parts.metadata.value.preprocessingKind)throw TypeError('PREPROCESSING_PROVENANCE');checkedArray(input.codes,Uint8Array,parts.p,memory);reserveHost(parts.bytes+parts.p+preprocessing.bytes);
   snapshot={...parts,spatial:new Float64Array(parts.spatial),second:parts.second instanceof Float64Array?new Float64Array(parts.second):new Uint8Array(parts.second),codes:new Uint8Array(input.codes),preprocessing};
   const preprocessingHash=await sha(encoder.encode(snapshot.preprocessing.text));check();if(preprocessingHash!==snapshot.metadata.value.preprocessingSha256)throw Error('PREPROCESSING_HASH');if(await modelHash(snapshot.metadata,snapshot.spatial,snapshot.second)!==snapshot.modelHash)throw Error('MODEL_HASH');check();
   const {p,k}=snapshot,result=arena([snapshot.spatial.byteLength,snapshot.second instanceof Float64Array?snapshot.second.byteLength:k*4,p,k*8],([t,h,code,out],mem)=>{
    new Float64Array(mem.buffer,t,snapshot.spatial.length).set(snapshot.spatial);if(snapshot.second instanceof Float64Array)new Float64Array(mem.buffer,h,snapshot.second.length).set(snapshot.second);else new Int32Array(mem.buffer,h,k).set(snapshot.second);new Uint8Array(mem.buffer,code,p).set(snapshot.codes);
    const status=(snapshot.second instanceof Float64Array?instance.exports.InferDirect:instance.exports.InferAlg2)(t,h,code,out,p,k);if(status!==0)throw Error(ERRORS[-status]??'KERNEL_ERROR');const output=Float64Array.from(new Float64Array(mem.buffer,out,k));if(!output.every(Number.isFinite))throw Error('NUMERIC_ACCURACY');return output;
   });inferences++;return result;
  }finally{snapshot=null;end();}
 }
 function dispose(){if(disposed)return;disposed=true;instance=null;memory=null;module=null;liveBytes=0;hostSnapshotBytes=0;}
 return Object.freeze({instanceId,get memory(){return memory;},fit,infer,dispose,resourceStats:()=>({disposed,busy,liveBytes,peakBytes,hostSnapshotBytes,peakHostSnapshotBytes,arenaBase,memoryBytes:memory?.buffer.byteLength??0,maxMemoryBytes:MAX_MEMORY,fits,inferences})});
}
