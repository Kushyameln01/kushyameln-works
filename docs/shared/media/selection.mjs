// Optional output selection. Numerical feature extraction remains upstream.
const META=16384,WORKSPACE=65536,HEADER=1024,MAX_TIME=86400;
const DEFAULT_LIMITS={maxPixels:1048576,maxFrames:100,maxDurationSeconds:10};
const LIMIT_KEYS=new Set([...Object.keys(DEFAULT_LIMITS),'maxFileBytes','maxArtifactBytes']);
const FRAME_KEYS=new Set(['sequence','timestamp','duration','sceneId','width','height','stride','data','codes','histogram','mapping','metrics','unapplied']);
const fail=code=>{throw Error(code);};
const plain=value=>value!==null&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const typedProto=Object.getPrototypeOf(Uint8Array.prototype),getters=Object.fromEntries(['buffer','byteOffset','byteLength','length'].map(k=>[k,Object.getOwnPropertyDescriptor(typedProto,k).get]));
const typed=(v,k)=>Reflect.apply(getters[k],v,[]),bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get,resizable=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get;
const bufferBytes=b=>Reflect.apply(bufferLength,b,[]);
const bufferOK=value=>{const b=typed(value,'buffer');return b instanceof ArrayBuffer&&(!resizable||!Reflect.apply(resizable,b,[]))&&bufferBytes(b)>0;};
const canonicalView=(v,Type)=>new Type(typed(v,'buffer'),typed(v,'byteOffset'),typed(v,'length'));
function descriptors(value){
  if(!plain(value))fail('SELECTION_METADATA');
  const result=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(result).some(key=>typeof key!=='string'||!Object.hasOwn(result[key],'value')||!result[key].enumerable))fail('SELECTION_METADATA');
  return result;
}
function cloneMetadata(source){
  let bytes=0,nodes=0;const path=new Set();
  const add=n=>{bytes+=n;if(bytes>META)fail('SELECTION_METADATA_LIMIT');};
  function stringSize(value){
    let n=2;if(value.length>META)fail('SELECTION_METADATA_LIMIT');
    for(let i=0;i<value.length;i++){
      const c=value.charCodeAt(i);
      if(c===34||c===92||[8,9,10,12,13].includes(c))n+=2;
      else if(c<32)n+=6;
      else if(c<128)n++;
      else if(c<2048)n+=2;
      else if(c>=0xd800&&c<=0xdbff&&i+1<value.length&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){n+=4;i++;}
      else if(c>=0xd800&&c<=0xdfff)n+=6;
      else n+=3;
      if(n>META)fail('SELECTION_METADATA_LIMIT');
    }
    return n;
  }
  function copy(value,depth){
    if(++nodes>2048||depth>8)fail('SELECTION_METADATA_LIMIT');
    if(value===null){add(4);return null;}
    if(typeof value==='string'){add(stringSize(value));return value;}
    if(typeof value==='number'){if(!Number.isFinite(value))fail('SELECTION_METADATA');add(JSON.stringify(value).length);return value;}
    if(typeof value==='boolean'){add(value?4:5);return value;}
    if(typeof value!=='object'||path.has(value))fail('SELECTION_METADATA');
    path.add(value);
    try{
      if(Array.isArray(value)){
        if(value.length>2048)fail('SELECTION_METADATA_LIMIT');
        const own=Object.getOwnPropertyDescriptors(value);
        if(Reflect.ownKeys(own).length!==value.length+1)fail('SELECTION_METADATA');
        add(2+Math.max(0,value.length-1));const output=[];
        for(let i=0;i<value.length;i++){const entry=own[i];if(!entry||!Object.hasOwn(entry,'value'))fail('SELECTION_METADATA');output.push(copy(entry.value,depth+1));}
        return output;
      }
      const own=descriptors(value),keys=Object.keys(own).sort();if(keys.length>2048)fail('SELECTION_METADATA_LIMIT');add(2+Math.max(0,keys.length-1));const output={};
      for(const key of keys){add(stringSize(key)+1);Object.defineProperty(output,key,{value:copy(own[key].value,depth+1),enumerable:true,writable:true,configurable:true});}
      return output;
    }finally{path.delete(value);}
  }
  return copy(source,0);
}
function parseFrame(frame,limits,expectedSequence,lastTime,firstTime){
  const own=descriptors(frame),keys=Object.keys(own);
  if(keys.includes('aligned')||keys.includes('alignment'))fail('SELECTION_ALIGNMENT_UNSUPPORTED');
  if(keys.some(key=>!FRAME_KEYS.has(key)))fail('SELECTION_FRAME_FIELD');
  const value=Object.fromEntries(keys.map(key=>[key,own[key].value]));
  const {sequence,width,height}=value,stride=value.stride??width*4;let {data,codes,histogram}=value;
  if(!Number.isSafeInteger(sequence)||sequence!==expectedSequence)fail('SELECTION_SEQUENCE');
  if(expectedSequence>=limits.maxFrames)fail('SELECTION_FRAME_LIMIT');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height)||width*height>limits.maxPixels)fail('SELECTION_PIXEL_LIMIT');
  const pixels=width*height;
  if(!Number.isSafeInteger(stride)||stride<width*4||!Number.isSafeInteger(stride*height)||!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||!bufferOK(data)||typed(data,'byteLength')<stride*height)fail('SELECTION_FRAME_BYTES');
  if(!(codes instanceof Uint8Array)||!bufferOK(codes)||typed(codes,'length')!==pixels||!(histogram instanceof Uint32Array)||!bufferOK(histogram)||typed(histogram,'length')!==256)fail('SELECTION_FRAME_BYTES');
  data=canonicalView(data,Uint8Array);codes=canonicalView(codes,Uint8Array);histogram=canonicalView(histogram,Uint32Array);
  const timestamp=value.timestamp??null,duration=value.duration??null,sceneId=value.sceneId??null;
  if(timestamp!==null&&(!Number.isFinite(timestamp)||timestamp<0||timestamp>MAX_TIME))fail('SELECTION_TIMESTAMP');
  if(duration!==null&&(!Number.isFinite(duration)||duration<0||duration>MAX_TIME))fail('SELECTION_DURATION_LIMIT');
  if(timestamp!==null&&timestamp<lastTime)fail('SELECTION_TIMESTAMP_ORDER');
  const origin=firstTime??timestamp;
  if(timestamp===null?(duration??0)>limits.maxDurationSeconds:timestamp-origin+(duration??0)>limits.maxDurationSeconds+1e-9)fail('SELECTION_DURATION_LIMIT');
  if(sceneId!==null&&(typeof sceneId!=='string'||sceneId.length>128))fail('SELECTION_SCENE');
  const metadata={sequence,timestamp,duration,sceneId};
  for(const key of ['mapping','metrics','unapplied'])if(Object.hasOwn(value,key))metadata[key]=value[key];
  const meta=cloneMetadata(metadata);
  if(Object.hasOwn(meta,'unapplied')){if(!Array.isArray(meta.unapplied)||meta.unapplied.some(v=>typeof v!=='string'))fail('SELECTION_METADATA');meta.unapplied=meta.unapplied.filter(v=>v!=='frame-selection');}
  const mapping=Object.hasOwn(meta,'mapping')?JSON.stringify(meta.mapping):'absent';
  const buffers=new Set([data.buffer,codes.buffer,histogram.buffer]);let borrowedBytes=0;for(const buffer of buffers)borrowedBytes+=bufferBytes(buffer);
  if(!Number.isSafeInteger(borrowedBytes))fail('SELECTION_FRAME_BYTES');
  return{data,codes,histogram,width,height,stride,pixels,bytes:5*pixels+1024,borrowedBytes,meta,mapping,origin};
}
function equalBytes(a,b){if(a.byteLength!==b.byteLength)return false;for(let i=0;i<a.byteLength;i++)if(a[i]!==b[i])return false;return true;}
function sameContent(a,b,meta,mapping){
  return a.width===b.width&&a.height===b.height&&a.sceneId===meta.sceneId&&a.mapping===mapping&&equalBytes(a.data,b.data)&&equalBytes(a.codes,b.codes)&&equalBytes(new Uint8Array(a.histogram.buffer),new Uint8Array(b.histogram.buffer));
}

export function createExactFrameSelector({onFrame,onOmitted,anchorEvery=30,requiredTimestamps=[],budgetBytes=16777216,limits:overrides={},signal}={}){
  if(typeof onFrame!=='function'||typeof onOmitted!=='function'||!Number.isSafeInteger(anchorEvery)||anchorEvery<0||anchorEvery>100000||!Number.isSafeInteger(budgetBytes)||budgetBytes<1024||budgetBytes>536870912)fail('SELECTION_OPTIONS');
  if(!plain(overrides)||Object.keys(overrides).some(key=>!LIMIT_KEYS.has(key))||Object.values(overrides).some(v=>!Number.isSafeInteger(v)||v<1))fail('SELECTION_LIMITS');
  const limits={...DEFAULT_LIMITS,...overrides};if(limits.maxPixels>16777216||limits.maxFrames>100000||limits.maxDurationSeconds>86400)fail('SELECTION_LIMITS');
  if(!Array.isArray(requiredTimestamps)||requiredTimestamps.length>128||requiredTimestamps.some(v=>!Number.isFinite(v)||v<0||v>MAX_TIME)||new Set(requiredTimestamps).size!==requiredTimestamps.length)fail('SELECTION_REQUIRED_TIMESTAMPS');
  if(signal&&typeof signal.addEventListener!=='function')fail('SELECTION_OPTIONS');if(signal?.aborted)fail('CANCELLED');
  let liveBytes=0,peakBytes=0,ownedBinaryBytes=0,borrowedInputBytes=0,metadataBytes=0,requiredBytes=0;
  function reserve(bytes,category){if(liveBytes+bytes>budgetBytes)fail('SELECTION_MEMORY_BUDGET');liveBytes+=bytes;peakBytes=Math.max(peakBytes,liveBytes);change(bytes,category);}
  function change(bytes,category){if(category==='owned')ownedBinaryBytes+=bytes;else if(category==='borrowed')borrowedInputBytes+=bytes;else if(category==='required')requiredBytes+=bytes;else metadataBytes+=bytes;}
  function release(bytes,category){liveBytes-=bytes;change(-bytes,category);}
  const requiredCount=requiredTimestamps.length,requiredReservation=requiredCount*9;
  if(HEADER+requiredReservation>budgetBytes)fail('SELECTION_MEMORY_BUDGET');reserve(HEADER,'metadata');reserve(requiredReservation,'required');
  let required=new Float64Array(requiredTimestamps),matched=new Uint8Array(requiredCount),matchedCount=0,controlReserved=true,requiredReserved=true;
  let state='active',busy=false,baseline=null,baselineHeader=0,current=null,pending=null,outbound=null,finished=null;
  let received=0,kept=0,omitted=0,lastTime=-Infinity,firstTime=null;
  function clearCurrent(){if(current){release(current.bytes,'owned');current=null;}}
  function clearBaseline(){if(baseline){release(baseline.bytes,'owned');baseline=null;}if(baselineHeader){release(baselineHeader,'metadata');baselineHeader=0;}}
  function clearPending(){if(pending){pending=null;release(META,'metadata');}}
  function cleanup(){clearCurrent();clearBaseline();clearPending();if(controlReserved){release(HEADER,'metadata');controlReserved=false;}if(requiredReserved){required=null;matched=null;release(requiredReservation,'required');requiredReserved=false;}signal?.removeEventListener('abort',abort);}
  function abort(){if(state!=='active')return;state='cancelled';cleanup();}
  function check(){if(state==='disposed')fail('SELECTION_DISPOSED');if(state==='cancelled'||signal?.aborted)fail('CANCELLED');if(state!=='active')fail('SELECTION_'+state.toUpperCase());}
  signal?.addEventListener('abort',abort,{once:true});
  function snapshot(input){
    reserve(input.bytes,'owned');
    try{const data=new Uint8Array(input.pixels*4);for(let y=0;y<input.height;y++)data.set(input.data.subarray(y*input.stride,y*input.stride+input.width*4),y*input.width*4);return{width:input.width,height:input.height,data,codes:new Uint8Array(input.codes),histogram:new Uint32Array(input.histogram),bytes:input.bytes};}
    catch(error){release(input.bytes,'owned');throw error;}
  }
  function outputCopy(){
    reserve(baseline.bytes,'owned');
    try{return{data:baseline.data.slice(),codes:baseline.codes.slice(),histogram:baseline.histogram.slice(),bytes:baseline.bytes,width:baseline.width,height:baseline.height};}
    catch(error){release(baseline.bytes,'owned');throw error;}
  }
  async function emit(meta,reasons){
    check();outbound=outputCopy();const output={...meta,width:outbound.width,height:outbound.height,stride:outbound.width*4,data:outbound.data,codes:outbound.codes,histogram:outbound.histogram,selection:{mode:'exact-duplicates',version:1,reasons:[...reasons]}};
    try{kept++;await onFrame(output);check();}
    finally{release(outbound.bytes,'owned');outbound=null;}
  }
  function status(){return Object.freeze({state,busy,received,kept,omitted,pendingSequence:pending?.sequence??null,requiredCount,matchedRequiredCount:matchedCount,resources:Object.freeze({liveBytes,peakBytes,budgetBytes,ownedBinaryBytes,borrowedInputBytes,metadataBytes,requiredBytes,scope:'binary payloads including active borrowed input/callback copy and bounded metadata reservations; external retained output and engine/native heap excluded'})});}
  function failOperation(error){if(state==='active')state='failed';cleanup();if(state==='cancelled'||signal?.aborted)throw Error('CANCELLED');if(state==='disposed')throw Error('SELECTION_DISPOSED');throw error;}
  async function push(frame){
    if(busy)fail('SELECTION_BUSY');check();busy=true;let workspace=false,borrowed=0;
    try{
      reserve(WORKSPACE,'metadata');workspace=true;const input=parseFrame(frame,limits,received,lastTime,firstTime);
      reserve(input.borrowedBytes,'borrowed');borrowed=input.borrowedBytes;current=snapshot(input);
      const same=baseline!==null&&sameContent(baseline,current,input.meta,input.mapping),reasons=[];
      if(!baseline)reasons.push('first');else if(!same)reasons.push('changed');
      if(baseline&&baseline.sceneId!==input.meta.sceneId)reasons.push('scene-boundary');
      if(baseline&&baseline.mapping!==input.mapping)reasons.push('mapping-change');
      if(input.meta.sequence>0&&anchorEvery>0&&input.meta.sequence%anchorEvery===0)reasons.push('periodic');
      for(let i=0;i<requiredCount;i++)if(input.meta.timestamp===required[i]){if(!matched[i]){matched[i]=1;matchedCount++;}reasons.push('required-timestamp');break;}
      received++;if(input.meta.timestamp!==null){lastTime=input.meta.timestamp;firstTime??=input.meta.timestamp;}
      if(pending){const omission={sequence:pending.sequence,timestamp:pending.timestamp,duration:pending.duration,referenceSequence:baseline.referenceSequence,reason:'exact-duplicate'};clearPending();omitted++;await onOmitted(omission);check();}
      if(!same){clearBaseline();reserve(HEADER+META,'metadata');baselineHeader=HEADER+META;baseline={...current,sceneId:input.meta.sceneId,mapping:input.mapping,referenceSequence:input.meta.sequence};current=null;}
      else clearCurrent();
      if(reasons.length){baseline.referenceSequence=input.meta.sequence;await emit(input.meta,reasons);}
      else{reserve(META,'metadata');pending=input.meta;}
      return Object.freeze({sequence:input.meta.sequence,decision:reasons.length?'kept':'pending'});
    }catch(error){failOperation(error);}
    finally{clearCurrent();if(borrowed)release(borrowed,'borrowed');if(workspace)release(WORKSPACE,'metadata');busy=false;}
  }
  async function finish(){
    if(busy)fail('SELECTION_BUSY');if(finished)return finished;check();busy=true;let workspace=false;
    try{
      reserve(WORKSPACE,'metadata');workspace=true;if(received===0)fail('SELECTION_EMPTY');
      if(matchedCount!==requiredCount)fail('SELECTION_REQUIRED_TIMESTAMP_MISSING');
      if(pending){const meta=pending;clearPending();await emit(meta,['final']);}
      check();state='finished';cleanup();
    }catch(error){failOperation(error);}
    finally{if(workspace)release(WORKSPACE,'metadata');busy=false;}
    finished=status();return finished;
  }
  function dispose(){if(state==='disposed')return;state='disposed';cleanup();}
  return Object.freeze({push,write:push,finish,dispose,status});
}
