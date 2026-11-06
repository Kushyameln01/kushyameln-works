// Real pinned SDK/Hike; original owner's synthetic nonzero-base source/consumer fixture.
// This is E2 native adapter acceptance, not E1 real-LoRA x real-base acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createLoraAdapter} from '../../docs/shared/ai-connection/adapters/lora.mjs';
const root=process.env.WORKS_LORA_NATIVE_ROOT;
test('pinned actual LoRA v2 plan/prepare/stage uses Hike and keeps opaque handle identity and PARTIAL scope',{skip:!root},async()=>{
 const sdkPath=root+'/docs/shared/inference/lora/sdk-v2.mjs',source=await readFile(sdkPath);
 const expected='c425519eb282f798f4296bc97fd1506664afd850dee9addb17af77dd41e39fa0';
 assert.equal(createHash('sha256').update(source).digest('hex'),expected);
 const fixture=await import(pathToFileURL(root+'/tools/lora/v2-fixture.mjs'));
 const e=await fixture.engine(),sink=fixture.storage();
 try{
  const api=createLoraAdapter({descriptor:{nativeAPI:{version:fixture.CONTRACT,build:e.api.kernelInfo.wasmSha256},operations:['plan','prepare','stage','release'].map(operationId=>({operationId,implementationState:'implemented'}))},nativeClient:e.api,sourceVerified:true,binding:{ownerId:'lora:high',sessionId:'manager'},cancelOwner:()=>e.api.cancel()});
  const invoke=(requestId,operationId,nativeArguments,inputRevision)=>api.invoke({requestId,operationId,nativeArguments,localRevision:99,nativeRevisionBinding:{sdkInstanceId:e.api.sdkInstanceId,inputRevision,applicationRevision:inputRevision}});
  const planned=await invoke('real-plan','plan',[fixture.planInput()],0);assert.equal(planned.status,'ok');const plan=planned.result;assert.equal(plan.coverage,'PARTIAL');assert.equal(plan.localInputRevision,1);assert.equal(planned.localRevision,99);
  const prepared=await invoke('real-prepare','prepare',[plan,{sink,baseProvider:fixture.baseProvider}],1);assert.equal(prepared.status,'ok');assert.deepEqual(sink.blocks.map(b=>[...b.data]),[[10,11],[23]]);
  const staged=await invoke('real-stage','stage',[prepared.result,fixture.consumer()],1);assert.equal(staged.status,'ok');assert.equal(staged.result.state,'STAGED');assert.equal(staged.result.generationReady,false);assert.equal(staged.result.snapshotPublished,false);
  assert.equal((await invoke('real-release','release',[prepared.result],1)).status,'ok');assert.equal(sink.released,1);await api.dispose();
 }finally{await e.close();}
});
