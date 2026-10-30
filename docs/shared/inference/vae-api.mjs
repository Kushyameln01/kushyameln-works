import {createInferenceClient} from './client.mjs';
import {requireTensor} from './tensor.mjs';
import {validateVaeRequest,RAW_GENERATED_SAMPLE} from './vae.mjs';
export function createVaeModule({client=createInferenceClient(),ownsClient=true}={}){
 let config=null,disposed=false;
 function ready(){if(disposed)throw Error('VAE module disposed');if(!config)throw Error('Configure VAE profile and files before inference');}
 const api={
  capabilities(){return{apiVersion:'works-ai-1',module:'vae',operations:['encode','decode'],inputSpace:'raw',encode:{input:{dtype:'float32',layout:'NCTHW',meanings:{'raw-decoder-rgb':[-1,1],'rgb-unit':[0,1]}},output:{meaning:'raw-posterior-mean',posterior:'mean'}},decode:{input:{dtype:'float32',layout:'NCTHW',meaning:'raw-posterior-mean',meanings:['raw-posterior-mean',RAW_GENERATED_SAMPLE]},generatedSampleContract:{schemaVersion:1,representation:'generated-sample',space:'raw',normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'},declaredOnly:true,realGenerationVerified:false},output:{meaning:'raw-decoder-rgb',clipped:false}},profile:structuredClone(config?.manifest.profile??null),arithmetic:'BF16 values expanded to FP32',configured:!!config};},
  configure({manifest,files}){if(disposed)throw Error('VAE module disposed');if(manifest?.kind!=='wan21-vae-profile-v1'||manifest.schemaVersion!==1)throw TypeError('Unsupported VAE profile');if(!(files instanceof Map))throw TypeError('Local files Map required');if(client.state.status==='running'&&client.state.module==='vae')client.cancel();config={manifest:structuredClone(manifest),files:new Map(files)};return api.capabilities();},
  async encode(tensor){ready();requireTensor(tensor,{dtype:'float32',layout:'NCTHW'});validateVaeRequest({operation:'encode',tensor,manifest:config.manifest});return client.run({module:'vae',operation:'encode',...config,input:tensor});},
  async decode(tensor){ready();requireTensor(tensor,{dtype:'float32',layout:'NCTHW'});validateVaeRequest({operation:'decode',tensor,manifest:config.manifest});return client.run({module:'vae',operation:'decode',...config,input:tensor});},
  cancel(){if(client.state.status==='running'&&client.state.module==='vae'){client.cancel();return true;}return false;},
  dispose(){api.cancel();config=null;disposed=true;if(ownsClient)client.dispose();}
 };return Object.freeze(api);
}
