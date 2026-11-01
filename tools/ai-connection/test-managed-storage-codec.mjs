import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {canonicalBytes} from '../../docs/shared/ai-connection/canonical.mjs';
import {writeArtifactPackage,readArtifactPackage,PACKAGE_VERSION} from '../../docs/shared/ai-connection/package.mjs';
import {edgeFixture} from './fixtures.mjs';
const runner=new URL('./run-managed-local-files.mjs',import.meta.url),root=new URL('../../',import.meta.url);
const invoke=(...args)=>spawnSync(process.execPath,[runner.pathname,...args],{encoding:'utf8'});
const source={repository:'Kushyameln01/kushyameln-works',commit:'2bdca59ea78580d4fe7a9d31a8de33209b64d029',path:'docs/shared/inference/tensor.mjs',sha256:'d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5'};
test('LoRA CLI documents bundled adopted storage default with optional paired external flags',()=>{const r=invoke('--help');assert.equal(r.status,0);assert.match(r.stdout,/bundled.*2bdca59/i);assert.match(r.stdout,/\[--codec-root/);assert.match(r.stdout,/--codec-commit/);});
test('partial external codec injection rejects before source or original File access',()=>{for(const flags of [['--codec-root','/absent'],['--codec-commit','a'.repeat(40)]]){const r=invoke(...flags);assert.notEqual(r.status,0);assert.match(r.stderr,/codec-root and --codec-commit must be supplied together/);}});
test('default storage no longer requires an external codec archive',()=>{const r=invoke('--lora-root','/absent/lora','--lora-commit','a'.repeat(40),'--diffusion-root','/absent/diffusion','--diffusion-commit','b'.repeat(40),'--inputs','/absent/input.json','--out','/tmp/absent-output');assert.notEqual(r.status,0);assert.doesNotMatch(r.stderr,/Missing --codec-root|Missing --codec-commit/);assert.doesNotMatch(r.stderr,/Missing --lora-root|Missing --diffusion-root|Complete lowercase source commits/);});

// Import each actual browser module through the Node ES-module loader. Native
// inference dependencies are inert exports that must never be called; codec
// selection and E4 serialization use the actual management source and bytes.
const nativeNames=['createDiffusionAdapter','createAdoptedLoraAdapter','createCandidateAdoptedLoraAdapter','createManagedDiagnosticPackage','writeArtifactPackage','readArtifactPackage','createDiffusionModels','PROTOCOL_VERSION','BUILD_ID','createLoraSource','createDiagnosticConsumer','diagnosticRegistryHash','createOrtProjectionStage','createLoraV2','createSnapshotNativeLoraOwner','createSnapshotManager','createInvocationQueue','hashCanonical','compareAll'];
const stubCode=nativeNames.map(name=>`export const ${name}=()=>{throw Error('Unexpected native operation ${name}');};`).join('\n');
async function loadBrowser(moduleName){
 const requests=[];
 const hooks=registerHooks({
  resolve(specifier,context,next){
   if(specifier==='/management/shared/ai-connection/codecs/wktensor.mjs'){requests.push(specifier);return {url:new URL('docs/shared/ai-connection/codecs/wktensor.mjs',root).href,shortCircuit:true};}
   if(specifier==='/codec/shared/inference/tensor.mjs'){requests.push(specifier);return {url:'storage-test:external-codec',shortCircuit:true};}
   if(/^\/(?:management|diffusion|lora|lora-tools)\//.test(specifier))return {url:'storage-test:native',shortCircuit:true};
   return next(specifier,context);
  },
  load(url,context,next){if(url==='storage-test:native')return {format:'module',source:stubCode,shortCircuit:true};if(url==='storage-test:external-codec')return {format:'module',source:'export const encodeTensor=async()=>new Uint8Array([99]);export const decodeTensor=async()=>({external:true});',shortCircuit:true};return next(url,context);}
 });
 try{return {module:await import(new URL(moduleName+'?storage-test='+crypto.randomUUID(),import.meta.url)),requests,close:()=>hooks.deregister()};}catch(error){hooks.deregister();throw error;}
}
async function saveRead(codec){
 const q=edgeFixture(),tensor={dtype:'float32',shape:[1,4],layout:'BC',meaning:'mean',data:new Float32Array([.25,-.5,.75,1])},nativeBytes=await codec.encode(tensor);
 q.artifact.native.payloadRef='output.wktensor';q.artifact.tensor.dataRef='output.wktensor';
 const evidence={schemaVersion:1,artifactId:'a',records:[{evidenceId:'fixture:storage-only',data:{scope:'codec/default-route',modelInference:false}}]};
 const assets=new Map([['output.wktensor',nativeBytes],['descriptor.json',canonicalBytes(q.artifact)],['evidence.json',canonicalBytes(evidence)],['trace.json',canonicalBytes({schemaVersion:1,artifactId:'a',records:[]})],['snapshot.json',canonicalBytes(null)],['extensions.json',canonicalBytes({})]]);
 const fileKinds=['native','descriptor','evidence','trace','snapshot','extensions'];
 const manifest={packageVersion:PACKAGE_VERSION,packageId:'fixture:managed-default-storage',artifacts:[{artifactId:'a',nativePath:'output.wktensor',descriptorPath:'descriptor.json',evidencePath:'evidence.json',tracePath:'trace.json',snapshotPath:'snapshot.json',extensionsPath:'extensions.json',codec:{codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:codec.sourceRef}}],files:[...assets.keys()].map((path,i)=>({path,kind:fileKinds[i],required:true})),payloadBindings:[{ref:'output.wktensor',artifactId:'a',nativePath:'output.wktensor',kind:'decoded-tensor-data'}],extensions:{}};
 const registry={...q.registry,codecs:[{codecId:codec.codecId,codecVersion:codec.codecVersion,sourceRef:codec.sourceRef,decode:codec.decode}]},directory=await mkdtemp(join(tmpdir(),'managed-default-codec-'));
 try{await writeArtifactPackage(manifest,assets,{registry,write:async(path,bytes)=>{const file=join(directory,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}});const result=await readArtifactPackage({read:async path=>{try{return new Uint8Array(await readFile(join(directory,path)));}catch(error){if(error.code==='ENOENT')return null;throw error;}}},registry);assert.equal(result.status,'complete');assert.deepEqual(result.artifacts[0].native.data,tensor.data);assert.deepEqual(result.manifest.artifacts[0].codec.sourceRef,source);assert.deepEqual(result.assets.get('output.wktensor'),nativeBytes);}finally{await rm(directory,{recursive:true,force:true});}
}
for(const moduleName of ['managed-local-file-browser-cases.mjs','managed-lora-snapshot-browser-cases.mjs']){
 test(`${moduleName}: bundled default is the actual new codec through filesystem E4 save/read`,async()=>{const probe=await loadBrowser(moduleName);try{assert.equal(probe.requests.length,0,'No unused external codec may load with the browser module');const codec=await probe.module.selectManagedStorageCodec({sourcePins:{codec:source}});assert.deepEqual(codec.sourceRef,source);assert.deepEqual(probe.requests,['/management/shared/ai-connection/codecs/wktensor.mjs']);await saveRead(codec);}finally{probe.close();}});
 test(`${moduleName}: explicit external selection remains distinct and loads only that codec`,async()=>{const probe=await loadBrowser(moduleName);try{const external={repository:'fixture:external',commit:'4'.repeat(40),path:'docs/shared/inference/tensor.mjs',sha256:'5'.repeat(64)};const codec=await probe.module.selectManagedStorageCodec({sourcePins:{codec:external},storageCodec:{mode:'external-explicit',sourceRef:external}});assert.deepEqual(codec.sourceRef,external);assert.deepEqual(await codec.encode({}),new Uint8Array([99]));assert.deepEqual(probe.requests,['/codec/shared/inference/tensor.mjs']);}finally{probe.close();}});
 test(`${moduleName}: default cannot attest a conflicting origin pin`,async()=>{const probe=await loadBrowser(moduleName);try{await assert.rejects(()=>probe.module.selectManagedStorageCodec({sourcePins:{codec:{...source,commit:'0'.repeat(40)}}}),/source|pin|codec/i);}finally{probe.close();}});
}
