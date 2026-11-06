import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const helperURL=new URL('../../docs/shared/ai-connection/adapters/lora-data/source.mjs',import.meta.url);
const base=new URL('../../docs/shared/ai-connection/adapters/lora-data/',import.meta.url);
const bytes=async()=>({admissionBytes:new Uint8Array(await readFile(new URL('management-admission-inputs.mjs',base))),numericBytes:new Uint8Array(await readFile(new URL('numeric-declarations.mjs',base)))});
test('DATA source proof requires both byte-exact 82b modules and cannot be fabricated or cloned',async()=>{
 const h=await import(helperURL),input=await bytes(),p=await h.verifyLoraAdmissionDataSources(input);
 assert.equal(h.isVerifiedLoraAdmissionDataSources(p),true);assert.equal(Object.isFrozen(p),true);
 assert.equal(h.isVerifiedLoraAdmissionDataSources(structuredClone(p)),false);
 assert.equal(h.isVerifiedLoraAdmissionDataSources({verified:true}),false);
 assert.equal(p.sourceRef.commit,'82b21f09cb63926543181b16f0e97ebc6b9fa6be');assert.equal(p.files.length,2);
 assert.deepEqual(p.files.map(f=>f.byteLength),[32961,9909]);
});
test('DATA verification rejects a changed module, omitted dependency, truncation or forged labels',async()=>{
 const h=await import(helperURL),original=await bytes();
 for(const field of ['admissionBytes','numericBytes']){
  const changed={...original,[field]:new Uint8Array(original[field])};changed[field][100]^=1;
  for(const bad of [changed,{...original,[field]:original[field].subarray(1)},{...original,[field]:null},{...original,[field]:{sha256:'label-only'}}])await assert.rejects(h.verifyLoraAdmissionDataSources(bad),{code:'LORA_DATA_SOURCE_MISMATCH'});
 }
});
test('DATA source verification owns both byte inputs before awaiting either digest',async()=>{
 const h=await import(helperURL),input=await bytes(),pending=h.verifyLoraAdmissionDataSources(input);
 input.admissionBytes.fill(0);input.numericBytes.fill(0);assert.equal(h.isVerifiedLoraAdmissionDataSources(await pending),true);
});
