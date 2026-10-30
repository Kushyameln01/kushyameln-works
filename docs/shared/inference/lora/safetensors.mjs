const WIDTHS = Object.freeze({BF16:2,F16:2,F32:4});
const integer = n => Number.isSafeInteger(n) && n >= 0;
function abort(signal) { signal?.throwIfAborted(); }
async function exact(source, offset, length, signal) {
 abort(signal);
 const bytes = await source.read(offset,length,{signal});
 abort(signal);
 if (!(bytes instanceof Uint8Array) || bytes.length !== length) throw new Error('Truncated safetensors read');
 return bytes;
}
function rejectDuplicateKeys(text) {
 let i=0;
 const space=()=>{while(/\s/.test(text[i]??'') && i<text.length)i++;};
 function string(){const start=i++;while(i<text.length){if(text[i++]==='"')return JSON.parse(text.slice(start,i));if(text[i-1]==='\\')i++;}throw new Error('Unterminated JSON string');}
 function value(){
  space();
  if(text[i]==='{'){
   i++;space();const keys=new Set();if(text[i]==='}'){i++;return;}
   while(i<text.length){space();if(text[i]!=='"')throw new Error('Invalid JSON object');const key=string();if(keys.has(key))throw new Error('Duplicate JSON key');keys.add(key);space();if(text[i++]!==':')throw new Error('Invalid JSON colon');value();space();if(text[i]==='}'){i++;return;}if(text[i++]!==',')throw new Error('Invalid JSON delimiter');}
  }else if(text[i]==='['){i++;space();if(text[i]===']'){i++;return;}while(i<text.length){value();space();if(text[i]===']'){i++;return;}if(text[i++]!==',')throw new Error('Invalid JSON delimiter');}}
  else if(text[i]==='"')string();
  else {const start=i;while(i<text.length&&!/[\s,\]}]/.test(text[i]))i++;if(i===start)throw new Error('Invalid JSON value');}
 }
 value();space();if(i!==text.length)throw new Error('Invalid JSON trailing data');
}
export async function inspectSafetensors(source,{signal,maxHeaderBytes=8*1024*1024}={}) {
 if(!source || !integer(source.size) || source.size<8 || typeof source.read!=='function')throw new Error('Invalid safetensors source');
 if(!integer(maxHeaderBytes)||maxHeaderBytes<2)throw new Error('Invalid header limit');
 const prefix=await exact(source,0,8,signal);
 const headerBig=new DataView(prefix.buffer,prefix.byteOffset,8).getBigUint64(0,true);
 if(headerBig>BigInt(maxHeaderBytes)||headerBig>BigInt(source.size-8)||headerBig<2n)throw new Error('Invalid safetensors header length');
 const headerBytes=Number(headerBig),dataStart=8+headerBytes;
 const raw=await exact(source,8,headerBytes,signal);
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 if(raw[0]!==0x7b||!text.startsWith('{'))throw new Error('Safetensors header must begin with object');
 rejectDuplicateKeys(text);
 const header=JSON.parse(text);
 if(!header||Array.isArray(header)||typeof header!=='object')throw new Error('Invalid safetensors header');
 const tensors=Object.create(null),regions=[];
 for(const [name,t] of Object.entries(header)){
  if(name==='__metadata__')continue;
  if(!t || typeof t!=='object' || Array.isArray(t)||!Object.hasOwn(WIDTHS,t.dtype))throw new Error('Unsupported tensor dtype');
  if(!Array.isArray(t.shape)||!t.shape.every(integer))throw new Error('Invalid tensor shape');
  let elements=1;for(const d of t.shape){elements*=d;if(!integer(elements))throw new Error('Unsafe tensor shape');}
  const bytes=elements*WIDTHS[t.dtype];if(!integer(bytes))throw new Error('Unsafe tensor byte length');
  if(!Array.isArray(t.data_offsets)||t.data_offsets.length!==2||!t.data_offsets.every(integer))throw new Error('Invalid tensor offsets');
  const [a,b]=t.data_offsets;
  if(a>b||b>source.size-dataStart||b-a!==bytes)throw new Error('Tensor shape/offset mismatch');
  tensors[name]=Object.freeze({dtype:t.dtype,shape:Object.freeze([...t.shape]),data_offsets:Object.freeze([a,b])});
  if(a!==b)regions.push([a,b]);
 }
 if(Object.hasOwn(header,'__metadata__')&&header.__metadata__===null)throw new Error('Invalid safetensors metadata');
 const metadata=header.__metadata__??null;
 if(metadata!==null && (typeof metadata!=='object'||Array.isArray(metadata)||Object.values(metadata).some(v=>typeof v!=='string')))throw new Error('Invalid safetensors metadata');
 regions.sort((a,b)=>a[0]-b[0]);let end=0;
 for(const [a,b] of regions){if(a!==end)throw new Error('Tensor overlap or hole');end=b;}
 if(end!==source.size-dataStart)throw new Error('Safetensors data coverage mismatch');
 return Object.freeze({size:source.size,headerBytes,dataStart,tensors:Object.freeze(tensors),metadata:metadata===null?null:Object.freeze({...metadata})});
}
export async function readTensor(source,inspection,name,{elementOffset=0,elementCount,signal}={}) {
 const t=inspection?.tensors?.[name];if(!t)throw new Error('Unknown tensor');
 if(source.size!==inspection.size)throw new Error('Source size changed');
 const width=WIDTHS[t.dtype],total=(t.data_offsets[1]-t.data_offsets[0])/width;
 elementCount??=total-elementOffset;
 if(!integer(elementOffset)||!integer(elementCount)||elementOffset>total||elementCount>total-elementOffset)throw new Error('Tensor read range invalid');
 if(elementCount===0){abort(signal);return new Uint8Array();}
 return exact(source,inspection.dataStart+t.data_offsets[0]+elementOffset*width,elementCount*width,signal);
}
