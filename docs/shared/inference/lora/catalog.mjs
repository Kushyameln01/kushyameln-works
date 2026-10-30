const BASE={
 light:{id:'light',high:{fileName:'Bernini-R_LightX2V_high_noise.safetensors',url:'https://huggingface.co/rzgar/Bernini-R-LightX2V-4step-loras/resolve/main/Bernini-R_LightX2V_high_noise.safetensors',size:1244141856,sha256:'9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945'},low:{fileName:'Bernini-R_LightX2V_low_noise.safetensors',url:'https://huggingface.co/rzgar/Bernini-R-LightX2V-4step-loras/resolve/main/Bernini-R_LightX2V_low_noise.safetensors',size:1244141856,sha256:'86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b'}},
 detail:{id:'detail',high:{fileName:'NSFW-22-H-e8.safetensors',url:null,size:613516752,sha256:'34e2144d3cd65360f97d09ccbe03e1c39a096df6c9234af5fe3899d1b63cda39'},low:{fileName:'NSFW-22-L-e8.safetensors',url:null,size:613516752,sha256:'d6b783742f4d5fd63a0223ae1d5bf64fc995a6b408480ac2a00528ae0d4146db'}}
};
export function createCatalog(overrides={}){
 if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw new Error('Invalid catalog overrides');
 for(const key of Object.keys(overrides))if(!Object.hasOwn(BASE,key))throw new Error('Unknown catalog category');
 const catalog={};
 for(const category of ['light','detail']){
  const o=overrides[category]??{};if(!o||typeof o!=='object'||Array.isArray(o))throw new Error('Invalid catalog category');
  for(const key of Object.keys(o))if(!['high','low'].includes(key))throw new Error('Unknown catalog noise');
  const group={id:category};
  for(const noise of ['high','low']){
   const override=o[noise]??{};if(!override||typeof override!=='object'||Array.isArray(override))throw new Error('Invalid catalog descriptor');
   for(const key of Object.keys(override))if(!['url','size','sha256','fileName'].includes(key))throw new Error('Unknown catalog descriptor field');
   const d={...BASE[category][noise],...override};
   if(d.url!==null){let u;try{u=new URL(d.url);}catch{throw new Error('Catalog URL must use HTTP(S)');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Catalog URL must use HTTP(S)');d.url=u.href;}
   if(!Number.isSafeInteger(d.size)||d.size<8||!/^[a-f0-9]{64}$/i.test(d.sha256)||typeof d.fileName!=='string'||!d.fileName.endsWith('.safetensors')||/[\\/]/.test(d.fileName))throw new Error('Invalid catalog descriptor');
   group[noise]=Object.freeze(d);
  }
  catalog[category]=Object.freeze(group);
 }
 return Object.freeze(catalog);
}
export const LORA_CATALOG=createCatalog();
