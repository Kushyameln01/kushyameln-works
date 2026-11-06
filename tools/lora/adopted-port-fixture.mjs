// Development inputs only. Never used by the normal SDK or the production UI.
export const C=5120,W='blocks.0.self_attn.q.weight',B='blocks.0.self_attn.q.bias';
export const Q='diffusion_model.'+W,QB='diffusion_model.'+B;
export const weightTargets=[{key:Q,slice:{startRow:1,rowCount:2}}];
export const lightTargets=[...weightTargets,{key:QB,slice:{startRow:1,rowCount:2}}];
export const baseValue=i=>Math.fround((i%17-8)/128);
export const down=(pair,i)=>pair==='light'?(i%4-1)/64:(i%3-1)/32;
export const up=(pair,i)=>pair==='light'?(i%5+1)/8:(i%7+1)/16;
export const bias=i=>(i%5-2)/128;
export function validationFile(pair){
 const stem=Q.slice(0,-7),ts=[{name:stem+(pair==='light'?'.lora_down.weight':'.lora_A.weight'),shape:[1,C],data:Float32Array.from({length:C},(_,i)=>down(pair,i))},{name:stem+(pair==='light'?'.lora_up.weight':'.lora_B.weight'),shape:[C,1],data:Float32Array.from({length:C},(_,i)=>up(pair,i))}];
 if(pair==='light')ts.push({name:stem+'.alpha',shape:[],data:Float32Array.of(2)},{name:stem+'.diff_b',shape:[C],data:Float32Array.from({length:C},(_,i)=>bias(i))});
 let offset=0;const header={};for(const t of ts){header[t.name]={dtype:'F32',shape:t.shape,data_offsets:[offset,offset+t.data.byteLength]};offset+=t.data.byteLength;}
 let text=JSON.stringify(header);text+=' '.repeat((8-text.length%8)%8);const encoded=new TextEncoder().encode(text),size=new Uint8Array(8);new DataView(size.buffer).setBigUint64(0,BigInt(encoded.length),true);
 return new File([size,encoded,...ts.map(t=>t.data)],'validation-'+pair+'.safetensors',{type:'application/octet-stream'});
}
export function expected(selections,biasSelected){
 const weight=Float32Array.from({length:4*C},(_,i)=>baseValue(i)),vector=Float32Array.from({length:4},(_,i)=>baseValue(i));
 for(const pair of ['light','detail']){const s=selections.find(s=>s.pairId===pair);if(!s)continue;const scale=Math.fround(s.strength*(pair==='light'?2:1));for(let row=1;row<3;row++)for(let col=0;col<C;col++){const i=row*C+col;weight[i]=Math.fround(weight[i]+Math.fround(scale*Math.fround(down(pair,col)*up(pair,row))));}if(pair==='light'&&biasSelected)for(let row=1;row<3;row++)vector[row]=Math.fround(vector[row]+Math.fround(s.strength*bias(row)));}
 return {weight,bias:vector};
}
export async function createSyntheticSource(side,{onPaused=()=>{}}={}){
 const root='/shared/ai-connection/native/diffusion-b6e16647/docs/shared/diffusion-models/';
 const [{BERNINI_TARGETS,TARGET_PROVENANCE},{BASE_MODEL_HASHES},{MODEL_WEIGHT_SCHEMA,MODEL_WEIGHT_PROFILE}]=await Promise.all([import(root+'lora/targets.mjs'),import(root+'lora/weights.mjs'),import(root+'execution/model-weights.mjs')]);
 const entries=Object.fromEntries(BERNINI_TARGETS.map(t=>{const columns=t.key.endsWith('.weight')&&t.shape.length>=2?t.shape.slice(1).reduce((a,b)=>a*b,1):null;return [t.key,{originalKey:t.key,key:t.canonical,weightId:t.key,fullShape:t.shape.slice(),columns,elementCount:t.shape.reduce((a,b)=>a*b,1),computeDtype:'F32',storageDtype:'F16',binding:{kind:columns?'runtime-input':'hike-parameter',name:t.key},operatorBinding:{programSlot:t.key,kind:columns?'linear':'linear-bias'},transform:{kind:'identity'},maxRows:columns?Math.min(16,Math.floor(81920/columns)):undefined}];}));
 const pinned=TARGET_PROVENANCE.models.find(m=>m.name.includes(side)),description={schemaVersion:MODEL_WEIGHT_SCHEMA,executionProfileId:MODEL_WEIGHT_PROFILE,side,modelHash:BASE_MODEL_HASHES[side],headerSHA256:pinned.headerSHA256,fileBytes:pinned.fileBytes,pinnedCoreCommit:TARGET_PROVENANCE.pinnedComfyCommit,targetCount:1095,blockCount:40,entries,fixtureOnly:true,identityRole:'Conforming declared metadata; payload is synthetic dyadic F32, no original base validation'};
 let disposed=false,busy=false,reads=0,maxElements=0,pause=false,resume;
 async function read(id,start,count,row,{signal}={}){if(disposed||busy)throw Error('Synthetic base disposed or busy');busy=true;try{signal?.throwIfAborted();const e=entries[id],offset=start*(row?e.columns:1),n=count*(row?e.columns:1);if(n>81920||row&&count>e.maxRows)throw Error('Native source block bound exceeded');reads++;maxElements=Math.max(maxElements,n);if(pause){pause=false;onPaused();await new Promise(resolve=>{resume=resolve;});resume=null;}signal?.throwIfAborted();return {values:Float32Array.from({length:n},(_,i)=>baseValue(offset+i))};}finally{busy=false;}}
 return {describe:()=>structuredClone(description),readRows:(id,start,count,ctx)=>read(id,start,count,true,ctx),readVector:(id,start,count,ctx)=>read(id,start,count,false,ctx),addBias:(v,b,rows,cols)=>Float32Array.from(v,(x,i)=>Math.fround(x+b[i%cols])),stats:()=>({disposed,busy,reads,maxElements,fixtureOnly:true}),pauseNext(){pause=true;},resume(){resume?.();},dispose(){if(busy)throw Error('Join base read first');disposed=true;}};
}
