const MAGIC=new TextEncoder().encode('WKTSR001');
const TYPES={float32:Float32Array,int32:Int32Array,uint8:Uint8Array,int64:BigInt64Array};
const MAX_HEADER=65536;
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
 for(const key of ['dtype','layout','meaning'])if(expected[key]!==undefined&&t[key]!==expected[key])throw TypeError('Tensor '+key+' cannot connect to this operation');
 if(expected.shape&&JSON.stringify(t.shape)!==JSON.stringify(expected.shape))throw RangeError('Tensor shape cannot connect to this profile');
 return t;
}
async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function encodeTensor(t){
 requireTensor(t);const data=new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength).slice();
 const endian=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;if(!endian&&t.data.BYTES_PER_ELEMENT>1)throw Error('This tensor writer requires a little-endian host');
 if(t.modelSha256!==undefined&&!/^[0-9a-f]{64}$/.test(t.modelSha256))throw TypeError('model hash');
 const metadata={schemaVersion:1,dtype:t.dtype,shape:t.shape,layout:t.layout,meaning:t.meaning,byteOrder:'little',byteLength:data.byteLength,dataSha256:await hash(data),...(t.modelSha256?{modelSha256:t.modelSha256}:{}),...(t.attentionMask!==undefined?{attentionMask:Array.from(t.attentionMask)}:{})};
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
