import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compareLoraValues,verifyP4L512LoraPayload,runP4RealTextL512Lora,LORA_OWNER_COMMIT,LORA_FILE} from './lora.mjs';
import {OUTPUT_SHAPES} from './run.mjs';
import {stringifyP4DiagnosticArtifact} from '../p4-cross-ffn/run.mjs';
const sha=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
assert.equal(compareLoraValues(new Float32Array([1]),new Float64Array([1]),{absolute:1e-5,relative:1e-4}).passed,true);
assert.equal(compareLoraValues(new Float32Array([2]),new Float64Array([1]),{absolute:1e-5,relative:1e-4}).passed,false);
assert.equal(compareLoraValues(new Float32Array([NaN]),new Float64Array([1]),{absolute:0,relative:0}).passed,false);
const names=['compile','compileStreaming','instantiate','instantiateStreaming','Instance'],originals=new Map(names.map(k=>[k,WebAssembly[k]]));let nativeCalls=0;
for(const k of names)WebAssembly[k]=new Proxy(WebAssembly[k],{apply(){nativeCalls++;throw Error('No native construction allowed');},construct(){nativeCalls++;throw Error('No native construction allowed');}});
try{
 await assert.rejects(()=>runP4RealTextL512Lora(null,null,{}),/native Text JSON text/);
 const inputPath=process.env.P4_REAL_TEXT_NATIVE_INPUT??'/tmp/p4-real-text-l512/inputs/real-text-l512-native.json';
 const driver=fileURLToPath(new URL('../../../../../tools/diffusion-models/p4-real-text-l512-lora-browser.py',import.meta.url));
 if(existsSync(inputPath)&&existsSync(driver)&&existsSync('/workspace/work/diffusion-private-tail-saved-outputs-20261101/low-tail-outputs.json')){
  // Private saved-input reads only: no browser, model file or operator math.
  const script="import importlib.util,json,sys; s=importlib.util.spec_from_file_location('lora_test_driver',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); p,g=m.COMMON.load_saved_inputs('LOW'); p.pop('oldOutputs'); p.update(candidatePlanSHA256=m.COMMON.module_at('p4-cross-ffn-reference').PLAN_SHA256,inputBindings={'savedArtifactSHA256':g['savedArtifactSHA256'],**m.BASE.load_native_input(m.BASE.DEFAULT_INPUT)}); print(m.COMMON.encode_browser_payload(p))";
  const loaded=spawnSync('python',['-c',script,driver],{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(loaded.status,0,loaded.stderr);
  const payload=JSON.parse(loaded.stdout);payload.nativeInputText=readFileSync(inputPath,'utf8');payload.sourcePins={ownerCommit:LORA_OWNER_COMMIT};
  const arrays={weight:new Float64Array(20480),bias:new Float32Array(4),baseWeight:new Float32Array(20480),baseBias:new Float32Array(4),blockOutput:new Float32Array(10240)},records={};payload.oracleArraysBase64={};
  for(const [k,value]of Object.entries(arrays)){records[k]={bytes:value.byteLength,sha256:await sha(value)};payload.oracleArraysBase64[k]=Buffer.from(value.buffer).toString('base64');}
  const identities=Object.fromEntries(Object.entries(OUTPUT_SHAPES).map(([k,shape])=>[k,{shape,elements:shape.reduce((a,b)=>a*b,1),bytes:shape.reduce((a,b)=>a*b,1)*4,sha256:k==='blockOutput'?records.blockOutput.sha256:'a'.repeat(64)}]));
  const oracle={schemaVersion:'bernini-p4-real-text-l512-lora-oracle/0.1',mode:'COMPOSED_BEFORE_RUNTIME',side:'LOW',strength:1,candidatePlanSHA256:payload.candidatePlanSHA256,
   original:{fileName:LORA_FILE.name,byteLength:LORA_FILE.bytes,expectedSha256:LORA_FILE.sha256,headerSha256:LORA_FILE.headerSHA256,rank:128,alpha:128,loaderPolicyId:'comfy-lora-b5a4321-linear-diff-v1'},
   selection:{weightId:'blocks.0.cross_attn.q.weight',biasWeightId:'blocks.0.cross_attn.q.bias',rows:[0,4],columns:[0,5120],fullWeightShape:[5120,5120],fullBiasShape:[5120],coverage:'PARTIAL'},
   gates:{weight:{absolute:1e-5,relative:1e-4},bias:{absolute:0,relative:0},projection:{absolute:.01,relative:.001},projectionGateId:'p4-cross-ffn-composed-f32-v1'},numericGates:{localCut:{abs:.001,rel:.0001},composed:{abs:.01,rel:.001}},
   inputBindings:{...payload.inputBindings,finalF32PatchArtifactSHA256:'b'.repeat(64)},A:{...records,independentPatchArtifact:{sha256:'b'.repeat(64)}},outputIdentities:identities,
   arrays:Object.fromEntries(Object.entries(identities).map(([k,v])=>[k,{...v,path:k+'.f32',dtype:'float32'}]))};
  const bind=async(o,p=payload)=>({...p,oracleManifestText:stringifyP4DiagnosticArtifact(o),oracleManifestSHA256:await sha(new TextEncoder().encode(stringifyP4DiagnosticArtifact(o)))});
  const good=await bind(oracle),admitted=await verifyP4L512LoraPayload(good);assert.equal(admitted.references.weight.length,20480);assert.equal(admitted.references.blockOutput.length,10240);
  for(const mutate of [o=>o.strength=0,o=>o.side='HIGH',o=>o.selection.rows=[0,16],o=>o.selection.columns=[0,4096],o=>o.original.expectedSha256='0'.repeat(64),o=>o.gates.weight.absolute=1,o=>o.gates.projection.absolute=.1,o=>o.numericGates.localCut.abs=.1,o=>delete o.outputIdentities.gate,o=>o.A.independentPatchArtifact.sha256='0'.repeat(64),o=>o.inputBindings.nativeTextArtifactSHA256='0'.repeat(64)]){
   const bad=structuredClone(oracle);mutate(bad);
   await assert.rejects(()=>bind(bad).then(verifyP4L512LoraPayload));
  }
  await assert.rejects(()=>verifyP4L512LoraPayload({...good,sourcePins:{ownerCommit:'0'.repeat(40)}}),/owner\/oracle/);
  await assert.rejects(()=>verifyP4L512LoraPayload({...good,oracleManifestSHA256:'0'.repeat(64)}),/owner\/oracle/);
  await assert.rejects(()=>verifyP4L512LoraPayload({...good,oracleArraysBase64:{...good.oracleArraysBase64,weight:Buffer.alloc(163840,1).toString('base64')}}),/reference byte identity/);
 }else console.log('Private saved/native files unavailable: portable fail-closed checks only');
 assert.equal(nativeCalls,0);
}finally{for(const[k,v]of originals)WebAssembly[k]=v;}
console.log('Real L512 LoRA scope/reference admission PASS; no native constructors');
