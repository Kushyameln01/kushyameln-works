import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const helperURL=new URL('../../docs/shared/ai-connection/adapters/n2-tail/source.mjs',import.meta.url);
const root=process.env.WORKS_N2_TAIL_NATIVE_ROOT;
const options={skip:!root};
async function sourceFiles(){
 const manifest=JSON.parse(await readFile(new URL('../../docs/shared/ai-connection/adapters/n2-tail/SOURCE-RECEIPT.json',import.meta.url)));
 return new Map(await Promise.all(manifest.files.map(async file=>[file.path,new Uint8Array(await readFile(resolve(root,file.path)))])));
}
test('N2 source labels or a missing runtime dependency cannot authorize native dispatch',async()=>{
 const h=await import(helperURL);assert.equal(h.isVerifiedN2TailSource({verified:true}),false);
 for(const files of [undefined,new Map(),new Map([['self-labelled',new Uint8Array([1])]])])await assert.rejects(h.verifyN2TailSource({files}),{code:'N2_TAIL_SOURCE_MISMATCH'});
});
test('N2 source verification binds both modules and real WASM bytes to execution source, not distribution',options,async()=>{
 const h=await import(helperURL),files=await sourceFiles(),proof=await h.verifyN2TailSource({files});
 assert.equal(h.isVerifiedN2TailSource(proof),true);assert.equal(h.isVerifiedN2TailSource(structuredClone(proof)),false);
 assert.equal(proof.sourceRef.commit,'a49aac492cc68e2dd6037e0deb4a6954731a847a');assert.equal(proof.distributionCommit,'beffdcb800b629d0b13ff43bbc90e9f74c659152');
 assert.equal(proof.files.length,24);assert.equal(proof.executionProfileId,'bernini-block0-n2-self-attention-residual-f32-v1');
 const wasm=proof.files.find(f=>f.path.endsWith('self-attention-tail/kernel.wasm'));
 assert.equal(wasm.byteLength,4018);assert.equal(wasm.sha256,'54c1690e4581a1de0b231d0b538ff280696542c2eb44ebedb4c2c661a6dd3925');
 assert.equal(Object.isFrozen(proof),true);assert.equal(Object.isFrozen(proof.files),true);
});
test('N2 source verification owns every dependency before hashing and rejects truncation or same-length changes',options,async()=>{
 const h=await import(helperURL),files=await sourceFiles(),key='docs/shared/diffusion-models/ort-bridge/self-attention-tail/kernel.wasm',original=files.get(key);
 for(const bytes of [original.subarray(1),new Uint8Array(original)]){
  if(bytes.length===original.length)bytes[90]^=1;
  const changed=new Map(files);changed.set(key,bytes);await assert.rejects(h.verifyN2TailSource({files:changed}),{code:'N2_TAIL_SOURCE_MISMATCH'});
 }
 const pending=h.verifyN2TailSource({files});for(const bytes of files.values())bytes.fill(0);files.clear();
 assert.equal(h.isVerifiedN2TailSource(await pending),true,'All actual source bytes are copied before the first await');
});
