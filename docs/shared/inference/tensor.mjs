const MAGIC=new TextEncoder().encode('WKTSR001');
const TYPES={float32:Float32Array,int32:Int32Array,uint8:Uint8Array,int64:BigInt64Array};
const MAX_HEADER=65536;
const SHA256=/^[0-9a-f]{64}$/;
function object(value,keys,name){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw TypeError('Invalid '+name);return value;}
function identifier(value,name){if(typeof value!=='string'||!value||value.length>128||/[\u0000-\u001f\u007f]/.test(value))throw TypeError('Invalid '+name);return value;}
function digestId(value,name){if(typeof value!=='string'||!SHA256.test(value))throw TypeError('Invalid '+name+' SHA-256');return value;}
// Optional connection metadata. These declarations are not proof of numerical
// conversion or of the original media's identity; callers verify those separately.
export function snapshotTensorMetadata(t){
 const result={};
 const normalization=t.normalization;
 if(normalization!==undefined&&(['raw-posterior-mean','wan21-raw-generated-sample:v1'].includes(t.meaning)||(t.meaning==='wan21-normalized-posterior-mean:v1'&&normalization!=='wan21-comfy-f32-v1')))throw TypeError('Latent normalization marker contradicts its declared meaning');
 if(t.meaning==='wan21-normalized-posterior-mean:v1'&&normalization!==undefined)result.normalization=normalization;
 if(t.modelSha256!==undefined)digestId(t.modelSha256,'model');
 if(t.tokenizerSha256!==undefined){
  if(t.layout!=='BLC'||t.meaning!=='text_hidden_states')throw TypeError('Tokenizer binding requires text conditioning');
  result.tokenizerSha256=digestId(t.tokenizerSha256,'tokenizer');
 }
 if(t.context!==undefined){
  const c=object(t.context,['schemaVersion','contextId','inputId','inputSha256','slotId','sourceFrameIndices','sourceFrameTimesSeconds'],'context');
  if(c.schemaVersion!==1||!Array.isArray(c.sourceFrameIndices)||!c.sourceFrameIndices.length||Array.from(c.sourceFrameIndices).some(n=>!Number.isSafeInteger(n)||n<0))throw TypeError('Invalid source frame mapping');
  result.context={schemaVersion:1,contextId:identifier(c.contextId,'contextId'),inputId:identifier(c.inputId,'inputId'),inputSha256:digestId(c.inputSha256,'source input'),slotId:identifier(c.slotId,'slotId'),sourceFrameIndices:[...c.sourceFrameIndices]};
  if(c.sourceFrameTimesSeconds!==undefined){
   if(!Array.isArray(c.sourceFrameTimesSeconds)||c.sourceFrameTimesSeconds.length!==c.sourceFrameIndices.length||Array.from(c.sourceFrameTimesSeconds).some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0))throw TypeError('Invalid source frame timestamps');
   result.context.sourceFrameTimesSeconds=[...c.sourceFrameTimesSeconds];
  }
 }
 if(t.latentContract!==undefined){
  const c=object(t.latentContract,['schemaVersion','representation','space','vaeModelSha256','producerModelSha256s','normalization'],'latent contract');
  const n=object(c.normalization,['id','state','owner'],'latent normalization');
  if(c.schemaVersion!==1||c.representation!=='generated-sample'||c.space!=='raw'||t.meaning!=='wan21-raw-generated-sample:v1'||t.dtype!=='float32'||t.layout!=='NCTHW'||n.id!=='wan21-comfy-f32-v1'||n.state!=='restored'||n.owner!=='diffusion_models')throw TypeError('Invalid raw generated-sample contract');
  const vae=digestId(c.vaeModelSha256,'decoder VAE'),producers=c.producerModelSha256s;
  if(!Array.isArray(producers)||!producers.length||new Set(producers).size!==producers.length)throw TypeError('Invalid generated-sample producer hashes');
  for(const hash of producers)if(digestId(hash,'producer')===vae)throw TypeError('VAE hash cannot replace generation provenance');
  if(t.modelSha256!==undefined&&!producers.includes(t.modelSha256))throw TypeError('Sample model hash is not a declared producer');
  result.latentContract={schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256:vae,producerModelSha256s:[...producers],normalization:{id:n.id,state:n.state,owner:n.owner}};
 }else if(t.meaning==='wan21-raw-generated-sample:v1')throw TypeError('Generated sample requires a separate latent contract');
 return result;
}
function shapeLength(shape){
 if(!Array.isArray(shape)||shape.length<1||shape.length>8)throw TypeError('tensor shape');
 let n=1;for(const dim of shape){if(!Number.isSafeInteger(dim)||dim<1)throw RangeError('tensor dimension');n*=dim;if(!Number.isSafeInteger(n))throw RangeError('tensor size');}return n;
}
function text(v,name){if(typeof v!=='string'||!v||v.length>256)throw TypeError(name);return v;}
export function requireTensor(t,expected={}){
 const Type=TYPES[t?.dtype];if(!Type||!(t.data instanceof Type))throw TypeError('tensor dtype/data mismatch');
 new Uint8Array(t.data.buffer,0,0);
 if(t.data.length!==shapeLength(t.shape))throw RangeError('tensor shape/data mismatch');
 text(t.layout,'tensor layout');text(t.meaning,'tensor meaning');
 if(t.dtype==='float32')for(const v of t.data)if(!Number.isFinite(v))throw RangeError('nonfinite tensor');
 if(t.attentionMask!==undefined){if(t.layout!=='BLC'||t.shape.length!==3||t.shape[0]!==1||t.attentionMask.length!==t.shape[1]||Array.from(t.attentionMask).some(v=>v!==0&&v!==1))throw TypeError('Invalid tensor attention mask');}
 snapshotTensorMetadata(t);
 for(const key of ['dtype','layout','meaning'])if(expected[key]!==undefined&&t[key]!==expected[key])throw TypeError('Tensor '+key+' cannot connect to this operation');
 if(expected.shape&&JSON.stringify(t.shape)!==JSON.stringify(expected.shape))throw RangeError('Tensor shape cannot connect to this profile');
 return t;
}
async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function encodeTensor(t){
 requireTensor(t);const data=new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength).slice();
 const endian=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;if(!endian&&t.data.BYTES_PER_ELEMENT>1)throw Error('This tensor writer requires a little-endian host');
 if(t.modelSha256!==undefined&&!/^[0-9a-f]{64}$/.test(t.modelSha256))throw TypeError('model hash');
 // Snapshot every identity/mapping field before digest yields to the caller.
 const metadata={schemaVersion:1,dtype:t.dtype,shape:[...t.shape],layout:t.layout,meaning:t.meaning,byteOrder:'little',byteLength:data.byteLength,dataSha256:null,...(t.modelSha256?{modelSha256:t.modelSha256}:{}),...(t.attentionMask!==undefined?{attentionMask:Array.from(t.attentionMask)}:{}),...snapshotTensorMetadata(t)};
 metadata.dataSha256=await hash(data);
 const header=new TextEncoder().encode(JSON.stringify(metadata));if(header.length>MAX_HEADER)throw RangeError('tensor header');
 const output=new Uint8Array(12+header.length+data.length);output.set(MAGIC);new DataView(output.buffer).setUint32(8,header.length,true);output.set(header,12);output.set(data,12+header.length);return output;
}
export async function decodeTensor(value){
 const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
 if(bytes.length<12||!MAGIC.every((b,i)=>bytes[i]===b))throw TypeError('Not a Works tensor file');
 const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true);
 if(length<1||length>MAX_HEADER||12+length>bytes.length)throw RangeError('Invalid tensor header');
 const m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(12,12+length)));
 const Type=TYPES[m.dtype];if(m.schemaVersion!==1||m.byteOrder!=='little'||!Type)throw TypeError('Unsupported tensor schema');
 if(m.attentionMask!==undefined&&(!Array.isArray(m.attentionMask)||m.attentionMask.some(v=>v!==0&&v!==1)))throw TypeError('Invalid raw attention-mask metadata');
 if(shapeLength(m.shape)*Type.BYTES_PER_ELEMENT!==m.byteLength||bytes.length!==12+length+m.byteLength)throw RangeError('Truncated/extra tensor bytes');
 // Copy explicitly: a Uint8Array subclass such as Node Buffer may override
 // slice() with view semantics and retain a larger, unaligned backing buffer.
 const data=new Uint8Array(bytes.subarray(12+length));if(await hash(data)!==m.dataSha256)throw Error('Tensor SHA-256 mismatch');
 const t={...m,data:new Type(data.buffer),...(m.attentionMask!==undefined?{attentionMask:Uint8Array.from(m.attentionMask)}:{})};requireTensor(t);return t;
}
