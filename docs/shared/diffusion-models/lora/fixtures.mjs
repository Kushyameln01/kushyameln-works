// Small synthetic format fixtures only; no original LoRA or model payloads.
const WIDTH={F16:2,BF16:2,F32:4,U8:1};
export function scalarBytes(dtype,value){
 const bytes=new Uint8Array(WIDTH[dtype]),v=new DataView(bytes.buffer);
 if(dtype==='F32')v.setFloat32(0,value,true);
 else if(dtype==='BF16'){const raw=new DataView(new ArrayBuffer(4));raw.setFloat32(0,value,true);v.setUint16(0,raw.getUint32(0,true)>>>16,true);}
 else if(dtype==='F16'){
  const sign=value<0||Object.is(value,-0)?0x8000:0,a=Math.abs(value);
  if(a===0)v.setUint16(0,sign,true);
  else {const e=Math.floor(Math.log2(a));const bits=e< -14?Math.round(a*2**24):((e+15)<<10)|Math.round((a/2**e-1)*1024);v.setUint16(0,sign|bits,true);}
 }else bytes[0]=value;
 return bytes;
}
export function tensor(name,dtype,shape,value=0){
 const count=shape.reduce((n,d)=>n*d,1),data=new Uint8Array(count*WIDTH[dtype]);
 if(value!==0){const scalar=scalarBytes(dtype,value);for(let at=0;at<data.length;at+=scalar.length)data.set(scalar,at);}
 return {name,dtype,shape,data};
}
export function packSafetensors(tensors,{metadata={},name='synthetic-lora.safetensors',rawHeader}={}){
 const header=Object.create(null);header.__metadata__=metadata;let offset=0;
 for(const t of tensors){header[t.name]={dtype:t.dtype,shape:[...t.shape],data_offsets:[offset,offset+t.data.byteLength]};offset+=t.data.byteLength;}
 const bytes=new TextEncoder().encode(rawHeader??JSON.stringify(header));
 const prefix=new Uint8Array(8);new DataView(prefix.buffer).setBigUint64(0,BigInt(bytes.byteLength),true);
 return new File([prefix,bytes,...tensors.map(t=>t.data)],name);
}
export function linearFixture({dtype='F32',alias='diffusion_model.blocks.0.self_attn.q',rank=1,alpha,alphaDtype=dtype,dialect='downUp',out=5120,columns=5120,extra=[]}={}){
 const suffix=dialect==='AB'?['.lora_A.weight','.lora_B.weight']:['.lora_down.weight','.lora_up.weight'];
 const ts=[tensor(alias+suffix[0],dtype,[rank,columns],1),tensor(alias+suffix[1],dtype,[out,rank],-2)];
 if(alpha!==undefined)ts.push(tensor(alias+'.alpha',alphaDtype,[],alpha));
 return packSafetensors([...ts,...extra]);
}
