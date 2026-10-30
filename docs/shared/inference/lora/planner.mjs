// Explicit target correspondence only: no fuzzy names, implicit transposes or Conv flattening.
export function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
export async function objectHash(v){return sha256(new TextEncoder().encode(JSON.stringify(v)));}
export function validateTarget(target){
 if(target?.apiVersion!==1||!['modelHash','graphHash'].every(k=>/^[a-f0-9]{64}$/i.test(target[k]))||typeof target.registryVersion!=='string'||!target.registryVersion||!Array.isArray(target.targets))throw Error('Invalid target registry identity');
 const keys=new Set(),ids=new Set();
 for(const t of target.targets){if(!t||typeof t.key!=='string'||keys.has(t.key)||typeof t.weightId!=='string'||!t.weightId||ids.has(t.weightId)||!['text_encoder','diffusion_models','vae'].includes(t.module)||typeof t.graphInitializer!=='string'||!t.graphInitializer||t.dtype!=='F32'||t.layout!=='row-major'||!Array.isArray(t.shape)||t.shape.length<1||t.shape.length>2||t.shape.some(x=>!Number.isSafeInteger(x)||x<1)||!Number.isSafeInteger(t.shape.reduce((a,b)=>a*b,1))||t.transpose||t.slice||t.quantization)throw Error('Unsupported or duplicate target registry entry');keys.add(t.key);ids.add(t.weightId);}
 return freeze(structuredClone(target));
}
export function analyze(inspection){
 const groups=new Map(),unknown=[];
 for(const name of Object.keys(inspection.tensors)){
  let stem,kind;
  for(const [suffix,k] of [['.lora_down.weight','down'],['.lora_up.weight','up'],['.lora_A.weight','down'],['.lora_B.weight','up'],['.alpha','alpha'],['.diff_b','bias'],['.diff','diff']])if(name.endsWith(suffix)){stem=name.slice(0,-suffix.length);kind=k;break;}
  if(!kind){unknown.push(name);continue;}
  const g=groups.get(stem)??{stem};if(g[kind])unknown.push(name);else g[kind]=name;groups.set(stem,g);
 }
 return {groups:[...groups.values()],unknown};
}
export function mapOperations(inspection,target){
 const {groups,unknown}=analyze(inspection);if(unknown.length)throw Error('Unsupported/unknown tensors: '+unknown.join(', '));
 const byKey=new Map(target.targets.map(t=>[t.key,t])),ops=[],covered=new Set();
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function add(g,key,kind,names,shape,extra={}){const t=byKey.get(key);if(!t)throw Error('Missing target '+key);if(!eq(shape,t.shape))throw Error('Target shape mismatch '+key);if(covered.has(t.weightId))throw Error('Conflicting target patches '+key);covered.add(t.weightId);ops.push({kind,target:t,names,...extra});}
 for(const g of groups){
  if(g.down||g.up){
   if(!g.down||!g.up||g.diff)throw Error('Unsupported incomplete/conflicting LoRA '+g.stem);
   const a=inspection.tensors[g.down],b=inspection.tensors[g.up];
   if(a.shape.length!==2||b.shape.length!==2||a.shape[0]<1||a.shape[0]!==b.shape[1])throw Error('Unsupported non-linear LoRA shape '+g.stem);
   if(g.alpha&&(inspection.tensors[g.alpha].shape.length!==0))throw Error('Invalid alpha scalar '+g.stem);
   add(g,g.stem+'.weight','lora',[g.down,g.up,...g.alpha?[g.alpha]:[]],[b.shape[0],a.shape[1]],{rank:a.shape[0],alphaName:g.alpha??null,downName:g.down,upName:g.up});
  }else if(g.alpha)throw Error('Unsupported orphan alpha '+g.stem);
  if(g.diff)add(g,g.stem+'.weight','diff',[g.diff],inspection.tensors[g.diff].shape,{deltaName:g.diff});
  if(g.bias)add(g,g.stem+'.bias','diff',[g.bias],inspection.tensors[g.bias].shape,{deltaName:g.bias});
 }
 if(!ops.length)throw Error('No supported LoRA operations');
 if(ops.reduce((n,o)=>n+o.names.length,0)!==Object.keys(inspection.tensors).length)throw Error('Incomplete tensor coverage');
 return ops;
}
