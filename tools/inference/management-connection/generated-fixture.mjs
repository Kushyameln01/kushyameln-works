// Connection fixture only. The Diffusion owner performs every restoration.
// The synthetic values below have never passed through a diffusion model.
export const DIFFUSION_SOURCE_SHA='ffeeeedb6b57d182a977c3ac02c042ce235fc87a';
export const RECT_GENERATED_SHAPE=Object.freeze([1,16,1,2,4]);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');

export async function prepareGeneratedFixture({generatedSpace,wasmBytes,producerModelSha256s,codec,signal}){
 if(typeof generatedSpace?.createGeneratedLatentSpace!=='function'||typeof codec?.encodeTensor!=='function'||typeof codec?.decodeTensor!=='function')throw TypeError('Real Diffusion owner and native codec required');
 if(!Array.isArray(producerModelSha256s)||!producerModelSha256s.length)throw TypeError('Explicit fixture producer bindings required');
 const data=Float32Array.from({length:128},(_,i)=>(i-64)/32);
 const normalized={dtype:'float32',shape:[...RECT_GENERATED_SHAPE],layout:'NCTHW',meaning:generatedSpace.GENERATED_MODEL_LATENT,normalization:generatedSpace.NORMALIZATION,producerModelSha256s:[...producerModelSha256s],
  context:{schemaVersion:1,contextId:'synthetic-generated-rect-0',inputId:'synthetic-normalized-generated-values',inputSha256:await sha(new Uint8Array(data.buffer)),slotId:'diagnostic-generated-target',sourceFrameIndices:[0],sourceFrameTimesSeconds:[0]},data};
 const owner=await generatedSpace.createGeneratedLatentSpace({wasmBytes,targetShape:RECT_GENERATED_SHAPE});
 const started=performance.now();let result;
 try{
  const raw=await owner.restore(normalized,{signal});
  const savedBytes=await codec.encodeTensor(raw),readback=await codec.decodeTensor(savedBytes);
  result={normalized,raw,savedBytes,readback,stats:owner.stats(),elapsedMs:performance.now()-started,
   fixtureScope:{synthetic:true,modelInference:false,realGeneratedSample:false,generationReady:false,
    purpose:'Saved-input partial connection; producer identities are explicit contract test bindings, not evidence that HIGH/LOW executed',
    restorationOwner:'diffusion_models',sourceSha:DIFFUSION_SOURCE_SHA,normalizationConversions:1}};
 }finally{owner.dispose();}
 return {...result,disposedStats:owner.stats()};
}

async function commandLine(){
 const fs=await import('node:fs/promises'),path=await import('node:path'),{pathToFileURL}=await import('node:url');
 const {parseArgs}=await import('node:util');
 const {values}=parseArgs({options:{'diffusion-source':{type:'string'},'owner-source':{type:'string'},bundle:{type:'string'},out:{type:'string'}}});
 for(const key of ['diffusion-source','owner-source','bundle','out'])if(!values[key])throw TypeError('Required --'+key);
 const diffusion=path.resolve(values['diffusion-source']),ownerSource=path.resolve(values['owner-source']),bundle=path.resolve(values.bundle),out=path.resolve(values.out);
 const acquire=JSON.parse(await fs.readFile(path.join(diffusion,'source-acquisition.json'),'utf8'));
 if(acquire.distributionSha!==DIFFUSION_SOURCE_SHA)throw Error('Extracted Diffusion source differs from the fixed fixture source');
 const load=(root,file)=>import(pathToFileURL(path.join(root,file)));
 const generatedSpace=await load(diffusion,'docs/shared/diffusion-models/execution/generated-space.mjs');
 const {BASE_MODEL_HASHES}=await load(diffusion,'docs/shared/diffusion-models/lora/weights.mjs');
 const codec=await load(ownerSource,'docs/shared/inference/tensor.mjs');
 const {validateVaeRequest}=await load(ownerSource,'docs/shared/inference/vae.mjs');
 const wasmPath=path.join(diffusion,'docs/shared/diffusion-models/execution/generated-space/build/generated-space.wasm');
 const prepared=await prepareGeneratedFixture({generatedSpace,wasmBytes:new Uint8Array(await fs.readFile(wasmPath)),producerModelSha256s:[BASE_MODEL_HASHES.HIGH,BASE_MODEL_HASHES.LOW],codec});
 const manifest=JSON.parse(await fs.readFile(path.join(bundle,'manifest.json'),'utf8'));
 const request=validateVaeRequest({operation:'decode',tensor:prepared.readback,manifest});
 const assets=[];
 for(const role of ['decoderBody','conv2Weight','conv2Bias']){
  const expected=manifest.assets[role],localPath=path.join(bundle,expected.file);let observedBytes=null;
  try{observedBytes=(await fs.stat(localPath)).size;}catch(error){if(error.code!=='ENOENT')throw error;}
  assets.push({role,path:localPath,bytes:expected.bytes,sha256:expected.sha256,observedBytes,sizeMatches:observedBytes===expected.bytes,hashEvidence:'Existing accepted manifest; full asset hash is not recomputed by fixture preparation'});
 }
 await fs.mkdir(out,{recursive:true});
 const normalizedBytes=new Uint8Array(prepared.normalized.data.buffer);
 const normalizedDescriptor={...prepared.normalized};delete normalizedDescriptor.data;
 const files=[{file:'normalized-generated.f32',bytes:normalizedBytes.byteLength,sha256:await sha(normalizedBytes)},{file:'raw-generated.wktensor',bytes:prepared.savedBytes.byteLength,sha256:await sha(prepared.savedBytes)}];
 await fs.writeFile(path.join(out,files[0].file),normalizedBytes);
 await fs.writeFile(path.join(out,'normalized-generated.json'),JSON.stringify({format:'synthetic-normalized-generated-fixture/1',fixtureScope:prepared.fixtureScope,tensor:normalizedDescriptor,payload:files[0]},null,2)+'\n');
 await fs.writeFile(path.join(out,files[1].file),prepared.savedBytes);
 const receipt={schemaVersion:1,fixtureScope:prepared.fixtureScope,diffusionDistributionSha:DIFFUSION_SOURCE_SHA,diffusionExecutionSourceSha:DIFFUSION_SOURCE_SHA,
  files,rawInputDescriptor:codec.describeTensor(prepared.readback),decodeAdmission:{operation:'decode',profileId:request.profileId,inputShape:request.inputShape,outputShape:request.outputShape,nativeDescriptorAccepted:true,neuralDecodeExecuted:false},
  assets,ownerStats:prepared.stats,disposedStats:prepared.disposedStats,elapsedMs:prepared.elapsedMs,
  normalizedPersistence:'External JSON descriptor + little-endian F32; no new normalized generated WKT contract is claimed',
  unaccepted:['Real model-produced generated sample','Neural VAE decode and management save in this preparation step','Original81 stream private assets are absent; no claim from this Rect fixture']};
 await fs.writeFile(path.join(out,'fixture-manifest.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({out,files,decodeAdmission:receipt.decodeAdmission,restorationOperations:prepared.stats.operations,disposed:prepared.disposedStats.disposed,neuralInference:false},null,2));
}

if(typeof process!=='undefined'&&process.argv[1]){
 const {pathToFileURL}=await import('node:url');
 if(import.meta.url===pathToFileURL(process.argv[1]).href)await commandLine();
}
