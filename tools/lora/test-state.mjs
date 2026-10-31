import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url=new URL('../../docs/shared/inference/lora/state.mjs',import.meta.url);
async function state(){assert.ok(await fs.stat(url).catch(()=>null),'LoRA state boundary is not implemented');return import(url);}
test('registered, prepared, staged, consumer and manager snapshot states stay distinct',async()=>{
 const {describeLoraState}=await state();const labels=new Set();
 for(const name of ['SOURCE_REGISTERED','PREPARED','STAGED','CONSUMER_APPLIED','SNAPSHOT_PUBLISHED']){const s=describeLoraState({state:name,coverage:'FULL'});assert.equal(s.state,name);assert.equal(s.generationReady,false);labels.add(s.label);}
 assert.equal(labels.size,5);assert.throws(()=>describeLoraState({state:'APPLIED'}),/state/i);
});
test('partial status never claims complete adapter or snapshot readiness',async()=>{
 const {describeLoraState}=await state();for(const name of ['PREPARED','STAGED','CONSUMER_APPLIED']){const s=describeLoraState({state:name,coverage:'PARTIAL'});assert.equal(s.completeAdapter,false);assert.equal(s.generationReady,false);assert.match(s.label,/診断/);}
 assert.throws(()=>describeLoraState({state:'SNAPSHOT_PUBLISHED',coverage:'PARTIAL'}),/partial|snapshot/i);
});
test('unknown coverage cannot be presented as applied or snapshot published',async()=>{
 const {describeLoraState}=await state();for(const name of ['CONSUMER_APPLIED','SNAPSHOT_PUBLISHED'])assert.throws(()=>describeLoraState({state:name}),/coverage|scope/i);
});
test('native header inspection state is displayable without implying registration or application',async()=>{
 const {describeLoraState}=await state();const s=describeLoraState({state:'SOURCE_INSPECTED'});assert.match(s.label,/ヘッダー/);assert.equal(s.generationReady,false);assert.equal(s.completeAdapter,false);
});
test('v1 panel guard accepts legacy consumer but rejects declared staging-only and next contract',async()=>{
 const {assertV1PanelConnection}=await state();const c={targetResolver(){},baseProvider:{readBlock(){}},createSink(){}};
 assert.equal(assertV1PanelConnection(c),c);
 for(const extra of [{contractVersion:'lora-connection/2.0-draft.1'},{apiVersion:2},{stagingOnly:true},{applicationMode:'staging'},{state:'STAGED'}])assert.throws(()=>assertV1PanelConnection({...c,...extra}),/v1|staging|stage|contract/i);
});
