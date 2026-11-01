import {createInferenceClient} from './client.mjs';
import {requireTensor} from './tensor.mjs';
import {inspectVaeManifest,validateVaeDescriptor,validateVaeRequest,RAW_GENERATED_SAMPLE} from './vae.mjs';
export function createVaeModule({client=createInferenceClient(),ownsClient=true}={}){
 let config=null,disposed=false,observed={};
 function ready(){if(disposed)throw Error('VAE module disposed');if(!config)throw Error('Configure VAE profile and files before inference');}
 function support(request){
  const result=(supported,code,reason,requiredChanges=[])=>({supported,code,reason,requiredChanges,scope:'configured-contract; runtime verification is separate'});
  if(disposed)return result(false,'MODULE_DISPOSED','VAE module disposed',['Create and configure a new VAE module']);
  if(!config)return result(false,'NOT_CONFIGURED','No configured manifest/graph',['Configure the required manifest and local files']);
  if(!request||!['encode','decode'].includes(request.operation))return result(false,'OPERATION_UNSUPPORTED','VAE operation must be encode or decode',['Use encode or decode']);
  try{validateVaeDescriptor({operation:request.operation,tensor:request.input,manifest:config.manifest});}
  catch(error){return result(false,'DESCRIPTOR_UNSUPPORTED',error.message,['For a different shape export/configure its matching profile and graph; for metadata use the declared dtype/layout/meaning/decoder binding. No automatic resize, padding, frame reduction or normalization conversion.']);}
  for(const role of request.operation==='encode'?['encoder']:['decoderBody','conv2Weight','conv2Bias']){
   const a=config.manifest.assets[role],file=config.files.get(a.file),size=file instanceof Uint8Array?file.byteLength:file?.size;
   if(!file)return result(false,'MISSING_ASSET','Missing local '+role+' asset: '+a.file,['Provide the configured asset via files Map']);
   if(size!==a.bytes)return result(false,'ASSET_SIZE_MISMATCH','Local '+role+' asset size differs from configured manifest',['Provide the matching graph/weight bytes']);
  }
  return result(true,'SUPPORTED','Descriptor matches the configured exact shape and native semantics');
 }
 async function run(operation,tensor){
  ready();requireTensor(tensor,{dtype:'float32',layout:'NCTHW'});validateVaeRequest({operation,tensor,manifest:config.manifest});
  const selected=config,result=await client.run({module:'vae',operation,...selected,input:tensor});
  if(config===selected&&result.binding?.assetsVerified)observed[operation]={verified:true,...structuredClone(result.binding)};
  return result;
 }
 const api={
  capabilities(request){
   const m=config?.manifest,p=m?.profile,base={dtype:'float32',layout:'NCTHW'},raw={state:'raw',conversionApplied:false};
   return{apiVersion:'works-ai-1',module:'vae',operations:['encode','decode'],inputSpace:'raw',
    encode:{input:{...base,shape:p?[...p.videoShape]:null,meanings:{'raw-decoder-rgb':[-1,1],'rgb-unit':[0,1]}},output:{...base,shape:p?[...p.latentShape]:null,meaning:'raw-posterior-mean',posterior:'mean',normalization:raw,modelSha256:m?.model.sha256??null},graph:m?structuredClone(m.assets.encoder):null},
    decode:{input:{...base,shape:p?[...p.latentShape]:null,meaning:'raw-posterior-mean',meanings:['raw-posterior-mean',RAW_GENERATED_SAMPLE],normalization:raw,decoderModelSha256:m?.model.sha256??null},generatedSampleContract:{schemaVersion:1,representation:'generated-sample',space:'raw',normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'},declaredOnly:true,realGenerationVerified:false},output:{...base,shape:p?[...p.videoShape]:null,meaning:'raw-decoder-rgb',clipped:false},graph:m?structuredClone(m.assets.decoderBody):null},
    profile:structuredClone(p??null),model:structuredClone(m?.model??null),constraints:{exactConfiguredShapes:true,manifest:{batch:1,frames:'F=4n+1',heightWidth:'multiples of 8'},exporter:{batch:1,frames:'F=4n+1',minimumHeightWidth:16,heightWidthMultiple:16},adaptation:'none'},
    runtime:{encode:structuredClone(observed.encode??{verified:false}),decode:structuredClone(observed.decode??{verified:false}),note:'Configured declarations are not proof of graph execution; bytes and actual shapes are checked on each run.'},
    arithmetic:'BF16 values expanded to FP32',configured:!!config,disposed,...(request!==undefined?{support:support(request)}:{})};
  },
  configure({manifest,files,diagnostics=false}){if(disposed)throw Error('VAE module disposed');inspectVaeManifest(manifest);if(!(files instanceof Map))throw TypeError('Local files Map required');if(typeof diagnostics!=='boolean')throw TypeError('diagnostics must be boolean');if(client.state.status==='running'&&client.state.module==='vae')client.cancel();config={manifest:structuredClone(manifest),files:new Map(files),diagnostics};observed={};return api.capabilities();},
  encode:tensor=>run('encode',tensor),decode:tensor=>run('decode',tensor),
  cancel(){if(client.state.status==='running'&&client.state.module==='vae'){client.cancel();return true;}return false;},
  dispose(){api.cancel();config=null;observed={};disposed=true;if(ownsClient)client.dispose();}
 };return Object.freeze(api);
}
