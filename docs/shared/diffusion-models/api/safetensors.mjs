// Bounded, header-only parsing. Never reads tensor payloads or fetches a model.
const MAX_HEADER_BYTES=8*1024*1024;
const WIDTH={BOOL:1,U8:1,I8:1,F8_E4M3:1,F8_E5M2:1,I16:2,U16:2,F16:2,BF16:2,I32:4,U32:4,F32:4,I64:8,U64:8,F64:8};
function invalid(message){const e=new Error(message);e.code='INVALID_SAFETENSORS';throw e;}
export async function inspectSafetensors(file){
 if(!(file instanceof Blob))invalid('Expected a File or Blob');
 if(!Number.isSafeInteger(file.size)||file.size<8)invalid('Invalid file length');
 const prefix=await file.slice(0,8).arrayBuffer();
 const headerLength=new DataView(prefix).getBigUint64(0,true);
 if(headerLength<2n||headerLength>BigInt(MAX_HEADER_BYTES)||headerLength>BigInt(file.size-8))invalid('Header length exceeds file or 8 MiB limit');
 const bytes=await file.slice(8,8+Number(headerLength)).arrayBuffer();
 let header;
 try{header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{invalid('Invalid header JSON or UTF-8');}
 if(!header||Array.isArray(header)||typeof header!=='object')invalid('Header must be an object');
 if(header.__metadata__!==undefined && (!header.__metadata__||Array.isArray(header.__metadata__)||typeof header.__metadata__!=='object'||Object.values(header.__metadata__).some(v=>typeof v!=='string')))invalid('Metadata must map strings to strings');
 const payloadBytes=file.size-8-Number(headerLength),tensors=[],dtypes={};
 for(const [name,t] of Object.entries(header)){
  if(name==='__metadata__')continue;
  if(!t||!Object.hasOwn(WIDTH,t.dtype)||!Array.isArray(t.shape)||t.shape.some(x=>!Number.isSafeInteger(x)||x<0)||!Array.isArray(t.data_offsets)||t.data_offsets.length!==2)invalid('Invalid tensor descriptor: '+name);
  const [start,end]=t.data_offsets;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>payloadBytes)invalid('Invalid tensor bounds: '+name);
  const elements=t.shape.reduce((p,x)=>p*BigInt(x),1n);
  if(elements*BigInt(WIDTH[t.dtype])!==BigInt(end-start))invalid('Tensor byte length does not match dtype/shape: '+name);
  tensors.push({name,dtype:t.dtype,shape:[...t.shape],dataOffsets:[start,end],byteLength:end-start});
  dtypes[t.dtype]=(dtypes[t.dtype]??0)+(end-start);
 }
 let cursor=0;
 for(const tensor of [...tensors].sort((a,b)=>a.dataOffsets[0]-b.dataOffsets[0]||a.dataOffsets[1]-b.dataOffsets[1])){
  if(tensor.dataOffsets[0]!==cursor)invalid('Tensor payloads have gaps or overlaps');cursor=tensor.dataOffsets[1];
 }
 if(cursor!==payloadBytes)invalid('Tensor payload length differs from file length');
 const headerSHA256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 return {headerSHA256,fullFileSHA256:null,fullFileHashStatus:'NOT_COMPUTED_HEADER_ONLY',name:typeof file.name==='string'?file.name:null,fileBytes:file.size,headerBytes:Number(headerLength),payloadBytes,tensorCount:tensors.length,dtypePayloadBytes:dtypes,metadata:header.__metadata__??{},tensors,modelInference:false,readiness:{ready:false,reasons:payloadBytes>2**32?['SINGLE_WASM32_MEMORY_EXCEEDED','MODEL_INFERENCE_NOT_IMPLEMENTED']:['MODEL_INFERENCE_NOT_IMPLEMENTED']}};
}
