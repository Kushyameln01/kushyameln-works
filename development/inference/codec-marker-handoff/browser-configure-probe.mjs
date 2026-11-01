import {createTextVaeAdapter} from '/manager/docs/shared/ai-connection/adapters/text-vae.mjs';
import {createTextEncoderModule,createVaeModule} from '/native/docs/shared/inference/api.mjs';
import {createInferenceClient} from '/native/docs/shared/inference/client.mjs';
import {inspectTextEncoderManifest} from '/native/docs/shared/inference/text-encoder.mjs';

const check=(ok,message)=>{if(!ok)throw Error(message);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');

globalThis.configureProbe=async spec=>{
 const result={passed:false,scope:'Actual browser local File/Map configure only; same host, no NN or separate Codex acceptance',modules:{},guards:{nativeRunCalls:0,workerFactoryCalls:0,globalWorkerCalls:0,fetchCalls:0},neuralRuns:0,assetPayloadHashesVerified:false};
 const oldWorker=globalThis.Worker,oldFetch=globalThis.fetch;
 const deny=field=>()=>{result.guards[field]++;throw Error('Forbidden in configure-only probe: '+field);};
 globalThis.Worker=class{constructor(){result.guards.globalWorkerCalls++;throw Error('Worker creation forbidden');}};
 globalThis.fetch=deny('fetchCalls');
 let client,vae,text;const adapters=[];
 try{
  const mapFor=(id,expected)=>{
   const files=new Map();
   for(const file of document.querySelector(id).files){check(!files.has(file.name),'Duplicate actual local filename');files.set(file.name,file);}
   for(const row of expected){const file=files.get(row.mapKey);check(file instanceof File&&file instanceof Blob,'Actual browser File required: '+row.mapKey);check(file.size===row.expectedBytes,'Actual browser File size: '+row.mapKey);}
   return files;
  };
  const rectFiles=mapFor('#rect',spec.rect.assets),textFiles=mapFor('#text',spec.text.assets.filter(x=>x.role!=='original-embedding-source'));
  const source=document.querySelector('#source').files[0];
  check(source instanceof File&&source.size===spec.text.originalModelBytes,'Original browser source File size');
  textFiles.set(spec.text.sourceFileKey,source);
  async function manifestFrom(files,expected){
   const file=files.get('manifest.json');check(file instanceof File,'Actual manifest File required');
   const bytes=await file.arrayBuffer();check(bytes.byteLength===expected.byteLength&&await hash(bytes)===expected.sha256,'Actual selected manifest bytes/hash');
   return JSON.parse(new TextDecoder().decode(bytes));
  }
  const rect=await manifestFrom(rectFiles,spec.rect.manifest),preparedText=await manifestFrom(textFiles,spec.text.manifest);
  check(rect.profile.id==='wan21-raw-f32-1x16x32'&&equal(rect.profile.videoShape,[1,3,1,16,32])&&equal(rect.profile.latentShape,[1,16,1,2,4]),'Exact Rect profile');
  const textInfo=inspectTextEncoderManifest(preparedText);
  check(preparedText.numericGate.maxAbsError===.001&&preparedText.numericGate.rtol===.001,'Selected Text final gate');
  check(preparedText.finalNorm.epsilon===1e-6,'Selected Text epsilon');
  check(preparedText.modelSha256===spec.text.modelSha256&&preparedText.tokenizer.sha256===spec.text.tokenizerSha256,'Text model/tokenizer binding');

  client=createInferenceClient({workerFactory:deny('workerFactoryCalls')});
  const guarded=new Proxy(client,{get(target,key){return key==='run'?deny('nativeRunCalls'):Reflect.get(target,key,target);}});
  vae=createVaeModule({client:guarded,ownsClient:false});text=createTextEncoderModule({client:guarded,ownsClient:false});
  for(const [module,nativeClient,input] of [['vae',vae,{manifest:rect,files:rectFiles}],['text_encoder',text,{manifest:preparedText,files:textFiles}]]){
   const beforeConfigured=nativeClient.capabilities().configured;
   const descriptor={moduleId:'configure-probe:'+module,nativeAPI:{version:'works-ai-1',build:'works-inference-v1'},operations:[{operationId:'configure',implementationState:'implemented'}]};
   const adapter=createTextVaeAdapter({module,descriptor,nativeClient,sourceVerified:true,binding:{ownerId:'same-host-probe:'+module,sessionId:'same-host-configure-only',bindingRef:'local-files'}});adapters.push(adapter);
   const reply=await adapter.invoke({requestId:'configure-'+module,operationId:'configure',localRevision:1,input});
   check(reply.status==='ok','Actual manager configure reply: '+JSON.stringify(reply));
   check(beforeConfigured===false,'Native module was unconfigured before actual dispatch');
   check(reply.result.configured===true&&reply.result.module===module&&reply.result.apiVersion==='works-ai-1','Native configure result');
   if(module==='vae')check(equal(reply.result.profile,rect.profile),'Native configured Rect profile');
   else check(reply.result.modelSha256===spec.text.modelSha256&&reply.result.tokenizerSha256===spec.text.tokenizerSha256,'Native configured Text binding');
   result.modules[module]={adapterInvocations:1,adapterReply:reply,fileMapIsNativeMap:input.files instanceof Map,nativeConfiguredTransition:{before:beforeConfigured,after:nativeClient.capabilities().configured},files:[...input.files].map(([key,file])=>({mapKey:key,fileName:file.name,bytes:file.size,isFile:file instanceof File,isBlob:file instanceof Blob})),assetHashValidationPerformedByConfigure:false};
  }
  check(client.state.status==='idle','Native client stayed idle');
  check(Object.values(result.guards).every(x=>x===0),'No Worker/run/fetch executed');
  result.textInspection={...textInfo,numericGate:preparedText.numericGate,finalNorm:preparedText.finalNorm,independentPlainAllValueComparison:'NOT_VERIFIED; no inference performed'};
  result.actualOriginalFileBytes=source.size;
  result.passed=true;
 }catch(error){result.error={name:error.name,message:error.message};}
 finally{
  for(const adapter of adapters)await adapter.dispose();
  vae?.dispose();text?.dispose();client?.dispose();
  result.cleanup={adaptersActive:adapters.map(a=>a.active),vaeConfigured:vae?.capabilities().configured??null,textConfigured:text?.capabilities().configured??null,nativeClientState:client?.state??null};
  globalThis.Worker=oldWorker;globalThis.fetch=oldFetch;
 }
 check(result.cleanup.adaptersActive.every(x=>x===null),'Adapters terminal before disposal');
 check(!result.cleanup.vaeConfigured&&!result.cleanup.textConfigured&&result.cleanup.nativeClientState.status==='disposed','Configuration/client disposal');
 return result;
};
