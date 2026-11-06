/** Reproducible development Files. Not any of the four private original LoRAs.
 * Source tensors retain the canonical full 5120 dimensions; execution selects
 * explicit rows through the native standalone plan, without changing shape. */
export const LORA_FIXTURE_DOMAIN=Object.freeze({key:'diffusion_model.blocks.0.self_attn.q.weight',fullShape:Object.freeze([5120,5120]),rank:1,dtype:'F32',selectedRows:Object.freeze({startRow:1,rowCount:1}),kind:'synthetic-development-local-File'});
const values=Object.freeze({HIGH:{light:{down:.125,up:.25},detail:{down:.25,up:-.125}},LOW:{light:{down:.25,up:.25},detail:{down:.125,up:-.25}}});
export function createLoraFixtureBytes({side,pairId}={}){
 const v=values[side]?.[pairId];if(!v)throw TypeError('Explicit fixture HIGH/LOW and light/detail required');
 const stem='diffusion_model.blocks.0.self_attn.q';
 const names=pairId==='light'?['.lora_down.weight','.lora_up.weight']:['.lora_A.weight','.lora_B.weight'];
 const tensors=[[stem+names[0],[1,5120],v.down],[stem+names[1],[5120,1],v.up]],header={};const parts=[];let offset=0;
 for(const [name,shape,value] of tensors){const count=shape[0]*shape[1],bytes=new Uint8Array(count*4),view=new DataView(bytes.buffer);for(let i=0;i<count;i++)view.setFloat32(i*4,value,true);header[name]={dtype:'F32',shape,data_offsets:[offset,offset+bytes.length]};offset+=bytes.length;parts.push(bytes);}
 const encoded=new TextEncoder().encode(JSON.stringify(header)),prefix=new Uint8Array(8);new DataView(prefix.buffer).setBigUint64(0,BigInt(encoded.length),true);
 const out=new Uint8Array(8+encoded.length+offset);out.set(prefix);out.set(encoded,8);let position=8+encoded.length;for(const bytes of parts){out.set(bytes,position);position+=bytes.length;}return out;
}
export function createLoraFixtureFile(options){return new File([createLoraFixtureBytes(options)],`management-${options.pairId}-${options.side}.safetensors`,{type:'application/octet-stream',lastModified:0});}
